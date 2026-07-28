import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import {
  requirePermission,
  resolveAuthorization,
} from "@/lib/authorization/permission-resolver";
import { PLATFORM_PERMISSIONS } from "@/lib/authorization/permissions";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export class PrivilegedAccessService {
  async request(
    context: TenantContext,
    input: { permissions: string[]; reason: string; requestedMinutes: number },
  ) {
    await requirePermission(context, "identity.read");
    const invalid = input.permissions.filter(
      (permission) =>
        !PLATFORM_PERMISSIONS.includes(permission as never),
    );
    if (invalid.length) {
      throw new AppError(
        "VALIDATION_ERROR",
        "One or more privileged permissions are invalid.",
        422,
        { invalid },
      );
    }
    const requestedMinutes = Math.min(
      Math.max(input.requestedMinutes, 5),
      240,
    );
    const request = await prisma.privilegedAccessRequest.create({
      data: {
        organizationId: context.organizationId,
        requestedById: context.userId,
        permissions: [...new Set(input.permissions)],
        reason: input.reason,
        requestedMinutes,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
    await this.audit(
      context,
      "identity.pam.requested",
      request.id,
      "SUCCESS",
      { permissions: request.permissions, requestedMinutes },
    );
    return request;
  }

  async decide(
    context: TenantContext,
    input: {
      requestId: string;
      decision: "APPROVE" | "DENY";
      note?: string;
    },
  ) {
    await requirePermission(context, "identity.pam.approve");
    const request = await prisma.privilegedAccessRequest.findFirst({
      where: {
        id: input.requestId,
        organizationId: context.organizationId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (!request) {
      throw new AppError(
        "NOT_FOUND",
        "Pending privileged access request not found.",
        404,
      );
    }
    if (request.requestedById === context.userId && !context.isPlatformAdmin) {
      throw new AppError(
        "FORBIDDEN",
        "Privileged access requires independent approval.",
        403,
      );
    }
    if (input.decision === "DENY") {
      const denied = await prisma.privilegedAccessRequest.update({
        where: { id: request.id },
        data: {
          status: "DENIED",
          reviewedById: context.userId,
          reviewedAt: new Date(),
          reviewNote: input.note,
        },
      });
      await this.audit(
        context,
        "identity.pam.denied",
        request.id,
        "SUCCESS",
      );
      return { request: denied, grant: null };
    }
    const expiresAt = new Date(
      Date.now() + request.requestedMinutes * 60_000,
    );
    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.privilegedAccessRequest.updateMany({
        where: { id: request.id, status: "PENDING" },
        data: {
          status: "APPROVED",
          reviewedById: context.userId,
          reviewedAt: new Date(),
          reviewNote: input.note,
        },
      });
      if (changed.count !== 1) {
        throw new AppError(
          "CONFLICT",
          "The privileged access request was already reviewed.",
          409,
        );
      }
      const grant = await tx.privilegedAccessGrant.create({
        data: {
          organizationId: context.organizationId,
          requestId: request.id,
          userId: request.requestedById,
          approvedById: context.userId,
          permissions: request.permissions,
          expiresAt,
        },
      });
      return {
        request: await tx.privilegedAccessRequest.findUniqueOrThrow({
          where: { id: request.id },
        }),
        grant,
      };
    });
    await this.audit(
      context,
      "identity.pam.approved",
      result.grant.id,
      "SUCCESS",
      { requestId: request.id, expiresAt: expiresAt.toISOString() },
    );
    return result;
  }

  async revoke(
    context: TenantContext,
    grantId: string,
    reason: string,
  ) {
    await requirePermission(context, "identity.pam.approve");
    const grant = await prisma.privilegedAccessGrant.findFirst({
      where: {
        id: grantId,
        organizationId: context.organizationId,
        status: "APPROVED",
      },
    });
    if (!grant) {
      throw new AppError("NOT_FOUND", "Active privileged grant not found.", 404);
    }
    const updated = await prisma.privilegedAccessGrant.update({
      where: { id: grant.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedById: context.userId,
        revokeReason: reason,
      },
    });
    await prisma.privilegedAccessRequest.update({
      where: { id: grant.requestId },
      data: { status: "REVOKED" },
    });
    await this.audit(
      context,
      "identity.pam.revoked",
      grant.id,
      "SUCCESS",
      { reason },
    );
    return updated;
  }

  async cancel(context: TenantContext, requestId: string) {
    const updated = await prisma.privilegedAccessRequest.updateMany({
      where: {
        id: requestId,
        organizationId: context.organizationId,
        requestedById: context.userId,
        status: "PENDING",
      },
      data: { status: "CANCELLED" },
    });
    if (updated.count !== 1) {
      throw new AppError(
        "NOT_FOUND",
        "Pending privileged access request not found.",
        404,
      );
    }
    await this.audit(
      context,
      "identity.pam.cancelled",
      requestId,
      "SUCCESS",
    );
    return { cancelled: true };
  }

  async list(context: TenantContext) {
    const authorization = await resolveAuthorization(context);
    if (
      !authorization.isPlatformAdmin &&
      !authorization.permissions.includes("identity.read")
    ) {
      throw new AppError(
        "FORBIDDEN",
        "Missing required permission: identity.read",
        403,
      );
    }
    const canReview =
      authorization.isPlatformAdmin ||
      authorization.permissions.includes("identity.pam.approve");
    return {
      requests: await prisma.privilegedAccessRequest.findMany({
        where: {
          organizationId: context.organizationId,
          ...(canReview ? {} : { requestedById: context.userId }),
        },
        include: {
          requestedBy: { select: { email: true, displayName: true } },
          reviewedBy: { select: { email: true, displayName: true } },
          grant: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      activeGrants: await prisma.privilegedAccessGrant.findMany({
        where: {
          organizationId: context.organizationId,
          ...(canReview ? {} : { userId: context.userId }),
          status: "APPROVED",
          expiresAt: { gt: new Date() },
        },
        orderBy: { expiresAt: "asc" },
      }),
    };
  }

  async requireGrant(context: TenantContext, permission: string) {
    const grant = await prisma.privilegedAccessGrant.findFirst({
      where: {
        organizationId: context.organizationId,
        userId: context.userId,
        status: "APPROVED",
        startsAt: { lte: new Date() },
        expiresAt: { gt: new Date() },
        permissions: { has: permission },
      },
      orderBy: { expiresAt: "desc" },
    });
    if (!grant && !context.isPlatformAdmin) {
      throw new AppError(
        "FORBIDDEN",
        "An active privileged access grant is required.",
        403,
        { code: "PAM_GRANT_REQUIRED", permission },
      );
    }
    return grant;
  }

  private audit(
    context: TenantContext,
    action: string,
    resourceId: string,
    outcome: "SUCCESS" | "FAILURE" | "DENIED",
    metadata?: unknown,
  ) {
    return prisma.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action,
        resourceType: "PrivilegedAccess",
        resourceId,
        outcome,
        metadata: metadata === undefined ? undefined : json(metadata),
      },
    });
  }
}
