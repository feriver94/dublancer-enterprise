import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { assertOrganizationAccess } from "@/lib/tenancy/assert-organization-access";
import type {
  createOrganizationSchema,
  invitationStatusSchema,
  inviteSchema,
  membershipSchema,
  settingsSchema,
  updateOrganizationSchema,
} from "@/lib/validation/organization";
import { MemberAdministrationService } from "@/lib/services/member-administration.service";
import { IdentityService } from "@/lib/services/identity.service";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { DEFAULT_ROLES } from "@/lib/authorization/default-roles";
import { PLATFORM_PERMISSIONS } from "@/lib/authorization/permissions";
import { ensureSeatForMembership } from "@/lib/services/subscription-administration.service";

type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
type UpdateMembershipInput = z.infer<typeof membershipSchema>;
type InviteInput = z.infer<typeof inviteSchema>;
type InvitationStatus = z.infer<typeof invitationStatusSchema>["status"];
type SettingsInput = z.infer<typeof settingsSchema>;

export class OrganizationDomainService {
  async create(context: TenantContext, input: CreateOrganizationInput) {
    await requirePermission(context, "organization.update");
    if (await prisma.organization.findUnique({ where: { slug: input.slug }, select: { id: true } })) {
      throw new AppError("CONFLICT", "An organization with this slug already exists.", 409);
    }

    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          ...input,
          settings: {
            create: {
              timezone: "Asia/Dubai",
              defaultCurrency: "AED",
              defaultLocale: "en-AE",
              supportedLocales: ["en-AE", "ar-AE"],
              dataRegion: "UAE",
            },
          },
        },
      });
      await tx.organizationIdentityPolicy.create({ data: { organizationId: organization.id } });

      const permissionIds = new Map<string, string>();
      for (const key of PLATFORM_PERMISSIONS) {
        const permission = await tx.permission.upsert({
          where: { key },
          create: { key, description: `Dublancer permission: ${key}` },
          update: {},
          select: { id: true },
        });
        permissionIds.set(key, permission.id);
      }
      let ownerRoleId = "";
      for (const definition of DEFAULT_ROLES) {
        const role = await tx.role.create({
          data: { organizationId: organization.id, name: definition.name, description: definition.description },
        });
        if (definition.name === "Owner") ownerRoleId = role.id;
        await tx.rolePermission.createMany({
          data: definition.permissions.map((key) => ({ roleId: role.id, permissionId: permissionIds.get(key)! })),
        });
      }
      const membership = await tx.membership.create({
        data: { organizationId: organization.id, userId: context.userId, roleId: ownerRoleId, status: "ACTIVE" },
      });
      const starterPlan = await tx.subscriptionPlan.findFirst({ where: { code: "STARTER", isActive: true } });
      if (starterPlan) {
        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + 14 * 86_400_000);
        const subscription = await tx.organizationSubscription.create({
          data: {
            organizationId: organization.id,
            planId: starterPlan.id,
            status: "TRIALING",
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
            trialStartedAt: now,
            trialEndsAt,
            renewAt: trialEndsAt,
          },
        });
        await tx.subscriptionEvent.create({
          data: {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            actorUserId: context.userId,
            type: "TRIAL_STARTED",
            reason: "Organization trial created from enterprise control center.",
          },
        });
        await ensureSeatForMembership(tx, organization.id, membership.id, context.userId);
      }
      await tx.auditEvent.create({
        data: {
          organizationId: organization.id,
          actorUserId: context.userId,
          action: "organization.created",
          resourceType: "Organization",
          resourceId: organization.id,
          outcome: "SUCCESS",
        },
      });
      return organization;
    });
  }

  async get(context: TenantContext, organizationId: string) {
    await assertOrganizationAccess(context, organizationId);

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        settings: true,
        _count: {
          select: {
            memberships: true,
            projects: true,
            invitations: true,
          },
        },
      },
    });

    if (!organization) {
      throw new AppError("NOT_FOUND", "Organization not found.", 404);
    }

    return organization;
  }

  async update(
    context: TenantContext,
    organizationId: string,
    input: UpdateOrganizationInput,
  ) {
    await assertOrganizationAccess(context, organizationId);
    await requirePermission(context, "organization.update");

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: input,
      include: { settings: true },
    });

    await prisma.organizationActivity.create({
      data: {
        organizationId,
        actorUserId: context.userId,
        type:
          input.status === "ARCHIVED"
            ? "ORGANIZATION_ARCHIVED"
            : "ORGANIZATION_UPDATED",
        resourceType: "Organization",
        resourceId: organizationId,
        summary: "Organization updated.",
        metadata: { changedFields: Object.keys(input) },
      },
    });

    return organization;
  }

  async members(context: TenantContext, organizationId: string) {
    await assertOrganizationAccess(context, organizationId);

    return prisma.membership.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            isPlatformAdmin: true,
          },
        },
        role: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async updateMember(
    context: TenantContext,
    organizationId: string,
    membershipId: string,
    input: UpdateMembershipInput,
  ) {
    await assertOrganizationAccess(context, organizationId);
    const identity = new IdentityService();
    if (input.roleId !== undefined) {
      await identity.assignRole(context, membershipId, input.roleId);
    }
    if (input.status && input.status !== "INVITED") {
      const action =
        input.status === "ACTIVE"
          ? "RESTORE"
          : input.status === "SUSPENDED"
            ? "SUSPEND"
            : "REMOVE";
      await identity.performMembershipAction(context, membershipId, action);
    }
    const membership = await prisma.membership.findFirstOrThrow({
      where: { id: membershipId, organizationId },
    });

    await prisma.organizationActivity.create({
      data: {
        organizationId,
        actorUserId: context.userId,
        type: "MEMBER_UPDATED",
        resourceType: "Membership",
        resourceId: membershipId,
        summary: "Membership updated.",
      },
    });

    return membership;
  }

  async removeMember(
    context: TenantContext,
    organizationId: string,
    membershipId: string,
  ) {
    await assertOrganizationAccess(context, organizationId);
    const membership = await new IdentityService().performMembershipAction(
      context,
      membershipId,
      "REMOVE",
    );

    await prisma.organizationActivity.create({
      data: {
        organizationId,
        actorUserId: context.userId,
        type: "MEMBER_REMOVED",
        resourceType: "Membership",
        resourceId: membershipId,
        summary: "Member removed.",
      },
    });

    return membership;
  }

  async invitations(context: TenantContext, organizationId: string) {
    await assertOrganizationAccess(context, organizationId);

    return prisma.organizationInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async invite(
    context: TenantContext,
    organizationId: string,
    input: InviteInput,
  ) {
    await assertOrganizationAccess(context, organizationId);
    const result = await new MemberAdministrationService().bulkInvite(context, [input]);
    return {
      invitation: result.invitations[0],
      ...(result.developmentTokens?.[0]
        ? { developmentToken: result.developmentTokens[0].token }
        : {}),
    };
  }

  async setInvitation(
    context: TenantContext,
    organizationId: string,
    invitationId: string,
    status: InvitationStatus,
  ) {
    await assertOrganizationAccess(context, organizationId);

    return prisma.organizationInvitation.update({
      where: { id: invitationId, organizationId },
      data: { status },
    });
  }

  async deleteInvitation(
    context: TenantContext,
    organizationId: string,
    invitationId: string,
  ) {
    await assertOrganizationAccess(context, organizationId);

    return prisma.organizationInvitation.delete({
      where: { id: invitationId, organizationId },
    });
  }

  async getSettings(context: TenantContext, organizationId: string) {
    await assertOrganizationAccess(context, organizationId);

    return prisma.organizationSettings.findUnique({
      where: { organizationId },
    });
  }

  async saveSettings(
    context: TenantContext,
    organizationId: string,
    input: SettingsInput,
  ) {
    await assertOrganizationAccess(context, organizationId);

    const { metadata, ...settingsData } = input;
    const settings = await prisma.organizationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ...settingsData,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
      update: {
        ...settingsData,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });

    await prisma.organizationActivity.create({
      data: {
        organizationId,
        actorUserId: context.userId,
        type: "SETTINGS_UPDATED",
        resourceType: "OrganizationSettings",
        resourceId: settings.id,
        summary: "Organization settings updated.",
      },
    });

    return settings;
  }

  async activity(
    context: TenantContext,
    organizationId: string,
    { cursor, take }: { cursor?: string; take: number },
  ) {
    await assertOrganizationAccess(context, organizationId);

    const rows = await prisma.organizationActivity.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        actor: { select: { id: true, email: true, displayName: true } },
      },
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;

    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }
}
