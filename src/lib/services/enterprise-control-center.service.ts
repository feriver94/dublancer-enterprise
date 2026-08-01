import { prisma } from "@/lib/database/prisma";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import type { TenantContext } from "@/lib/tenancy/context";
import { MemberAdministrationService } from "@/lib/services/member-administration.service";

export class EnterpriseControlCenterService {
  async dashboard(context: TenantContext) {
    await requirePermission(context, "organization.read");
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const [organization, administration, organizationCount, projects, auditLog, unresolvedCritical] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: context.organizationId },
        include: { settings: true, identityPolicy: true, subscription: { include: { plan: true } } },
      }),
      new MemberAdministrationService().dashboard(context),
      prisma.membership.count({ where: { userId: context.userId, status: "ACTIVE" } }),
      prisma.project.count({ where: { organizationId: context.organizationId } }),
      prisma.auditEvent.findMany({
        where: { organizationId: context.organizationId },
        include: { actor: { select: { displayName: true, email: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 30,
      }),
      prisma.securityEvent.count({
        where: { organizationId: context.organizationId, severity: "CRITICAL", resolvedAt: null },
      }),
    ]);

    const activeMembers = administration.members.filter((item) => item.status === "ACTIVE");
    const activeOwners = activeMembers.filter((item) => item.role?.name === "Owner").length;
    const pendingInvitations = administration.invitations.filter(
      (item) => item.status === "PENDING" && item.expiresAt > now,
    ).length;
    const latestAudit = administration.permissionAudits[0] ?? null;
    const recentPermissionAudit = Boolean(latestAudit && latestAudit.completedAt >= thirtyDaysAgo);
    const checks = [
      { key: "mfa", label: "Multi-factor authentication required", weight: 20, passed: Boolean(organization.identityPolicy?.requireMfa || organization.settings?.requireMfa) },
      { key: "sessions", label: "Session idle and maximum age enforced", weight: 10, passed: Boolean(organization.identityPolicy && organization.identityPolicy.sessionIdleMinutes > 0 && organization.identityPolicy.sessionMaxAgeMinutes > organization.identityPolicy.sessionIdleMinutes) },
      { key: "owner", label: "An active owner is assigned", weight: 15, passed: activeOwners > 0 },
      { key: "roles", label: "All active members have roles", weight: 15, passed: activeMembers.every((item) => Boolean(item.roleId)) },
      { key: "audit", label: "Tenant audit evidence is available", weight: 15, passed: auditLog.length > 0 },
      { key: "permissionAudit", label: "Permission audit completed in the last 30 days", weight: 15, passed: recentPermissionAudit },
      { key: "criticalEvents", label: "No unresolved critical security events", weight: 10, passed: unresolvedCritical === 0 },
    ];

    return {
      organization,
      administration,
      counters: {
        organizations: organizationCount,
        activeMembers: activeMembers.length,
        projects,
        departments: administration.departments.length,
        teams: administration.teams.length,
        pendingInvitations,
      },
      security: {
        score: checks.reduce((score, check) => score + (check.passed ? check.weight : 0), 0),
        checks,
        unresolvedCritical,
        calculatedAt: now,
      },
      auditLog,
    };
  }
}
