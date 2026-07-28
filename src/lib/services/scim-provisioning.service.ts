import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import {
  ensureSeatForMembership,
  releaseMembershipSeat,
} from "@/lib/services/subscription-administration.service";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export type ScimPrincipal = {
  tokenId: string;
  organizationId: string;
  providerId: string | null;
  scopes: string[];
};

type ScimUserInput = {
  externalId?: string;
  userName: string;
  active?: boolean;
  displayName?: string;
  name?: { formatted?: string; givenName?: string; familyName?: string };
  emails?: Array<{ value: string; primary?: boolean; type?: string }>;
  roles?: Array<{ value?: string; display?: string }>;
};

function scimError(status: number, detail: string, scimType?: string) {
  const code =
    status === 401
      ? "UNAUTHORIZED"
      : status === 403
        ? "FORBIDDEN"
        : status === 404
          ? "NOT_FOUND"
          : status === 409
            ? "CONFLICT"
            : "BAD_REQUEST";
  throw new AppError(code, detail, status, {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    ...(scimType ? { scimType } : {}),
  });
}

function requireScope(principal: ScimPrincipal, scope: string) {
  if (!principal.scopes.includes(scope)) {
    scimError(403, `SCIM scope ${scope} is required.`);
  }
}

function scimUser(resource: {
  id: string;
  externalId: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: { email: string; displayName: string | null };
}) {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: resource.id,
    externalId: resource.externalId,
    userName: resource.user.email,
    displayName: resource.user.displayName ?? resource.user.email,
    active: resource.active,
    emails: [{ value: resource.user.email, primary: true, type: "work" }],
    meta: {
      resourceType: "User",
      created: resource.createdAt.toISOString(),
      lastModified: resource.updatedAt.toISOString(),
      version: `W/"${resource.updatedAt.getTime()}"`,
    },
  };
}

export class ScimProvisioningService {
  async createToken(
    context: TenantContext,
    input: {
      name: string;
      providerId?: string | null;
      scopes?: string[];
      expiresAt?: Date | null;
    },
  ) {
    await requirePermission(context, "identity.manage");
    if (input.providerId) {
      const provider = await prisma.identityProvider.findFirst({
        where: {
          id: input.providerId,
          organizationId: context.organizationId,
        },
      });
      if (!provider) {
        throw new AppError("NOT_FOUND", "Identity provider not found.", 404);
      }
    }
    const raw = `dscim_${randomBytes(32).toString("base64url")}`;
    const token = await prisma.scimAccessToken.create({
      data: {
        organizationId: context.organizationId,
        providerId: input.providerId,
        name: input.name,
        tokenPrefix: raw.slice(0, 14),
        tokenHash: hash(raw),
        scopes: input.scopes ?? ["Users.read", "Users.write"],
        expiresAt: input.expiresAt,
      },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "identity.scim_token.created",
        resourceType: "ScimAccessToken",
        resourceId: token.id,
        outcome: "SUCCESS",
      },
    });
    return { token, secret: raw };
  }

  async revokeToken(context: TenantContext, tokenId: string) {
    await requirePermission(context, "identity.manage");
    const updated = await prisma.scimAccessToken.updateMany({
      where: {
        id: tokenId,
        organizationId: context.organizationId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new AppError("NOT_FOUND", "Active SCIM token not found.", 404);
    }
    await prisma.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "identity.scim_token.revoked",
        resourceType: "ScimAccessToken",
        resourceId: tokenId,
        outcome: "SUCCESS",
      },
    });
    return { revoked: true };
  }

  async authenticate(authorization: string | null): Promise<ScimPrincipal> {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) scimError(401, "A SCIM bearer token is required.");
    const token = await prisma.scimAccessToken.findUnique({
      where: { tokenHash: hash(match![1]) },
    });
    if (
      !token ||
      token.revokedAt ||
      (token.expiresAt && token.expiresAt <= new Date())
    ) {
      scimError(401, "SCIM bearer token is invalid or expired.");
    }
    await prisma.scimAccessToken.update({
      where: { id: token!.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      tokenId: token!.id,
      organizationId: token!.organizationId,
      providerId: token!.providerId,
      scopes: token!.scopes,
    };
  }

  async serviceProviderConfig(principal: ScimPrincipal) {
    requireScope(principal, "Users.read");
    return {
      schemas: [
        "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
      ],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: true },
      etag: { supported: true },
      authenticationSchemes: [
        {
          type: "oauthbearertoken",
          name: "Bearer Token",
          description: "Organization-scoped SCIM bearer token.",
          specUri: "https://www.rfc-editor.org/info/rfc6750",
          primary: true,
        },
      ],
    };
  }

  async listUsers(
    principal: ScimPrincipal,
    input: { filter?: string | null; startIndex?: number; count?: number },
  ) {
    requireScope(principal, "Users.read");
    const filter = input.filter?.match(
      /^(userName|externalId)\s+eq\s+"([^"]+)"$/i,
    );
    if (input.filter && !filter) {
      scimError(400, "Only userName eq and externalId eq filters are supported.", "invalidFilter");
    }
    const startIndex = Math.max(1, input.startIndex ?? 1);
    const count = Math.min(200, Math.max(1, input.count ?? 100));
    const where: Prisma.ScimResourceWhereInput = {
      organizationId: principal.organizationId,
      ...(filter?.[1].toLowerCase() === "username"
        ? { user: { email: filter[2].toLowerCase() } }
        : filter
          ? { externalId: filter[2] }
          : {}),
    };
    const [totalResults, resources] = await Promise.all([
      prisma.scimResource.count({ where }),
      prisma.scimResource.findMany({
        where,
        include: { user: { select: { email: true, displayName: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: startIndex - 1,
        take: count,
      }),
    ]);
    return {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults,
      startIndex,
      itemsPerPage: resources.length,
      Resources: resources.map(scimUser),
    };
  }

  async getUser(principal: ScimPrincipal, resourceId: string) {
    requireScope(principal, "Users.read");
    const resource = await prisma.scimResource.findFirst({
      where: {
        id: resourceId,
        organizationId: principal.organizationId,
      },
      include: { user: { select: { email: true, displayName: true } } },
    });
    if (!resource) scimError(404, "SCIM user was not found.");
    return scimUser(resource!);
  }

  async createUser(
    principal: ScimPrincipal,
    input: ScimUserInput,
    requestId: string = randomUUID(),
  ) {
    requireScope(principal, "Users.write");
    const email = this.email(input);
    const externalId = input.externalId?.trim() || email;
    const event = await this.startEvent(
      principal,
      "CREATE",
      requestId,
      externalId,
      input,
    );
    try {
      const resource = await prisma.$transaction(async (tx) => {
        const existingResource = await tx.scimResource.findUnique({
          where: {
            organizationId_externalId: {
              organizationId: principal.organizationId,
              externalId,
            },
          },
          include: {
            user: { select: { email: true, displayName: true } },
          },
        });
        if (existingResource) return existingResource;
        const user = await tx.user.upsert({
          where: { email },
          create: {
            email,
            displayName: this.displayName(input, email),
            emailVerified: new Date(),
          },
          update: {
            displayName: this.displayName(input, email),
          },
        });
        const existingMembership = await tx.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: principal.organizationId,
            },
          },
        });
        const roleId = await this.roleId(
          tx,
          principal.organizationId,
          input,
        );
        const membership = existingMembership
          ? await tx.membership.update({
              where: { id: existingMembership.id },
              data: {
                status: input.active === false ? "SUSPENDED" : "ACTIVE",
                roleId,
              },
            })
          : await tx.membership.create({
              data: {
                userId: user.id,
                organizationId: principal.organizationId,
                roleId,
                status: input.active === false ? "SUSPENDED" : "ACTIVE",
              },
            });
        if (membership.status === "ACTIVE") {
          await ensureSeatForMembership(
            tx,
            principal.organizationId,
            membership.id,
            user.id,
          );
        }
        return tx.scimResource.create({
          data: {
            organizationId: principal.organizationId,
            tokenId: principal.tokenId,
            providerId: principal.providerId,
            externalId,
            userId: user.id,
            membershipId: membership.id,
            active: membership.status === "ACTIVE",
            attributes: json(input),
          },
          include: {
            user: { select: { email: true, displayName: true } },
          },
        });
      });
      await this.completeEvent(event.id, resource.id, scimUser(resource));
      return scimUser(resource);
    } catch (error) {
      await this.failEvent(event.id, error);
      throw error;
    }
  }

  async patchUser(
    principal: ScimPrincipal,
    resourceId: string,
    operations: Array<{
      op: string;
      path?: string;
      value?: unknown;
    }>,
    requestId: string = randomUUID(),
  ) {
    requireScope(principal, "Users.write");
    const current = await prisma.scimResource.findFirst({
      where: {
        id: resourceId,
        organizationId: principal.organizationId,
      },
      include: {
        user: { select: { email: true, displayName: true } },
        membership: true,
      },
    });
    if (!current) scimError(404, "SCIM user was not found.");
    const event = await this.startEvent(
      principal,
      "UPDATE",
      requestId,
      current!.externalId,
      operations,
    );
    try {
      let active = current!.active;
      let displayName = current!.user.displayName;
      for (const operation of operations) {
        const op = operation.op.toLowerCase();
        if (!["add", "replace", "remove"].includes(op)) {
          scimError(400, `Unsupported SCIM patch operation ${operation.op}.`, "invalidSyntax");
        }
        const path = operation.path?.toLowerCase();
        if (path === "active" || (!path && typeof operation.value === "object")) {
          const value =
            path === "active"
              ? operation.value
              : (operation.value as { active?: unknown })?.active;
          if (typeof value === "boolean") active = value;
        }
        if (path === "displayname" && typeof operation.value === "string") {
          displayName = operation.value.trim();
        }
      }
      const resource = await prisma.$transaction(async (tx) => {
        const membership = await tx.membership.update({
          where: { id: current!.membershipId },
          data: { status: active ? "ACTIVE" : "SUSPENDED" },
        });
        if (active) {
          await ensureSeatForMembership(
            tx,
            principal.organizationId,
            membership.id,
            current!.userId,
          );
        } else {
          await releaseMembershipSeat(tx, principal.organizationId, membership.id);
        }
        await tx.user.update({
          where: { id: current!.userId },
          data: { displayName },
        });
        return tx.scimResource.update({
          where: { id: current!.id },
          data: {
            active,
            tokenId: principal.tokenId,
            attributes: json({ operations }),
          },
          include: {
            user: { select: { email: true, displayName: true } },
          },
        });
      });
      await this.completeEvent(
        event.id,
        resource.id,
        scimUser(resource),
        active ? "REACTIVATE" : "DEACTIVATE",
      );
      return scimUser(resource);
    } catch (error) {
      await this.failEvent(event.id, error);
      throw error;
    }
  }

  async deleteUser(
    principal: ScimPrincipal,
    resourceId: string,
    requestId: string = randomUUID(),
  ) {
    requireScope(principal, "Users.write");
    const current = await prisma.scimResource.findFirst({
      where: {
        id: resourceId,
        organizationId: principal.organizationId,
      },
    });
    if (!current) scimError(404, "SCIM user was not found.");
    const event = await this.startEvent(
      principal,
      "DELETE",
      requestId,
      current!.externalId,
      { resourceId },
    );
    try {
      await prisma.$transaction(async (tx) => {
        await tx.membership.update({
          where: { id: current!.membershipId },
          data: { status: "REMOVED" },
        });
        await releaseMembershipSeat(
          tx,
          principal.organizationId,
          current!.membershipId,
        );
        await tx.authSession.updateMany({
          where: {
            userId: current!.userId,
            organizationId: principal.organizationId,
            status: "ACTIVE",
          },
          data: { status: "REVOKED", revokedAt: new Date() },
        });
        await tx.scimResource.update({
          where: { id: current!.id },
          data: { active: false, tokenId: principal.tokenId },
        });
      });
      await this.completeEvent(event.id, current!.id, { active: false }, "DELETE");
      return { deleted: true };
    } catch (error) {
      await this.failEvent(event.id, error);
      throw error;
    }
  }

  private email(input: ScimUserInput) {
    const value =
      input.userName ||
      input.emails?.find((row) => row.primary)?.value ||
      input.emails?.[0]?.value;
    const email = value?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      scimError(400, "A valid userName email is required.", "invalidValue");
    }
    return email!;
  }

  private displayName(input: ScimUserInput, fallback: string) {
    return (
      input.displayName?.trim() ||
      input.name?.formatted?.trim() ||
      [input.name?.givenName, input.name?.familyName].filter(Boolean).join(" ") ||
      fallback
    );
  }

  private async roleId(
    tx: Prisma.TransactionClient,
    organizationId: string,
    input: ScimUserInput,
  ) {
    const desired = input.roles?.[0]?.value ?? input.roles?.[0]?.display;
    if (desired) {
      const role = await tx.role.findFirst({
        where: {
          organizationId,
          OR: [{ id: desired }, { name: desired }],
        },
      });
      if (!role) scimError(400, "The requested SCIM role is invalid.", "invalidValue");
      return role!.id;
    }
    const policy = await tx.organizationIdentityPolicy.findUnique({
      where: { organizationId },
      select: { defaultRoleId: true },
    });
    if (policy?.defaultRoleId) return policy.defaultRoleId;
    return (
      await tx.role.findFirst({
        where: { organizationId, name: "Member" },
        select: { id: true },
      })
    )?.id;
  }

  private startEvent(
    principal: ScimPrincipal,
    action: "CREATE" | "UPDATE" | "DELETE",
    requestId: string,
    externalId: string,
    request: unknown,
  ) {
    return prisma.scimProvisioningEvent.create({
      data: {
        organizationId: principal.organizationId,
        tokenId: principal.tokenId,
        action,
        requestId,
        externalId,
        request: json(request),
      },
    });
  }

  private async completeEvent(
    eventId: string,
    resourceId: string,
    response: unknown,
    action?: "DEACTIVATE" | "REACTIVATE" | "DELETE",
  ) {
    if (action) {
      await prisma.scimProvisioningEvent.update({
        where: { id: eventId },
        data: { action },
      });
    }
    return prisma.scimProvisioningEvent.update({
      where: { id: eventId },
      data: {
        resourceId,
        status: "SUCCEEDED",
        response: json(response),
        completedAt: new Date(),
      },
    });
  }

  private failEvent(eventId: string, error: unknown) {
    return prisma.scimProvisioningEvent.update({
      where: { id: eventId },
      data: {
        status: "FAILED",
        error:
          error instanceof Error ? error.message.slice(0, 2_000) : "Unknown error",
        completedAt: new Date(),
      },
    });
  }
}

export const scimSchemas = {
  user: SCIM_USER_SCHEMA,
};
