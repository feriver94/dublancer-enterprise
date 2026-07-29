import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import type { TenantContext } from "@/lib/tenancy/context";
import { withPerformanceProfile } from "@/lib/services/platform-reliability.service";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function audit(
  tx: Prisma.TransactionClient,
  context: TenantContext,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: unknown,
) {
  await tx.auditEvent.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action,
      resourceType,
      resourceId,
      outcome: "SUCCESS",
      metadata: metadata === undefined ? undefined : json(metadata),
    },
  });
  await tx.realtimeEvent.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      topic: `organization:${context.organizationId}`,
      eventType: action,
      aggregateType: resourceType,
      aggregateId: resourceId,
      payload: json(metadata ?? {}),
    },
  });
}

async function profileInTenant(organizationId: string, talentProfileId: string) {
  const profile = await prisma.talentProfile.findFirst({
    where: { id: talentProfileId, organizationId },
    include: {
      membership: { include: { user: { select: { displayName: true, email: true } } } },
    },
  });
  if (!profile) throw new AppError("NOT_FOUND", "Talent profile not found.", 404);
  return profile;
}

function dateRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (end <= start) {
    throw new AppError("VALIDATION_ERROR", "The end date must follow the start date.", 422);
  }
  return { start, end };
}

export class TalentResourceManagementService {
  async dashboard(context: TenantContext) {
    await requirePermission(context, "talent.read");
    return withPerformanceProfile(
      {
        operation: "phase9.talent.dashboard",
        organizationId: context.organizationId,
      },
      async () => {
        const [profiles, members, plans, capacity, bench, performance, skills] =
          await Promise.all([
            prisma.talentProfile.findMany({
              where: { organizationId: context.organizationId },
              include: {
                membership: {
                  include: {
                    user: { select: { id: true, displayName: true, email: true } },
                    role: { select: { name: true } },
                  },
                },
                skills: { include: { skill: true }, orderBy: { updatedAt: "desc" } },
                certifications: { orderBy: { expiresAt: "asc" } },
                availability: {
                  where: { endsAt: { gte: new Date() } },
                  orderBy: { startsAt: "asc" },
                  take: 10,
                },
                staffingAssignments: {
                  where: { status: { in: ["PLANNED", "ACTIVE"] } },
                  include: {
                    resourcePlan: { select: { id: true, name: true } },
                    project: { select: { id: true, title: true } },
                  },
                  orderBy: { startsAt: "asc" },
                },
                capacitySnapshots: { orderBy: { periodEnd: "desc" }, take: 5 },
                benchEntries: { orderBy: { startedAt: "desc" }, take: 3 },
                performanceHistory: { orderBy: { periodEnd: "desc" }, take: 5 },
              },
              orderBy: { updatedAt: "desc" },
              take: 200,
            }),
            prisma.membership.findMany({
              where: {
                organizationId: context.organizationId,
                status: "ACTIVE",
              },
              include: {
                user: { select: { id: true, displayName: true, email: true } },
                role: { select: { name: true } },
              },
              orderBy: { createdAt: "asc" },
            }),
            prisma.resourcePlan.findMany({
              where: { organizationId: context.organizationId },
              include: {
                project: { select: { id: true, title: true } },
                owner: { select: { displayName: true, email: true } },
                requirements: {
                  include: { skill: true, _count: { select: { assignments: true } } },
                  orderBy: { startsAt: "asc" },
                },
                assignments: {
                  include: {
                    talentProfile: {
                      include: {
                        membership: {
                          include: {
                            user: { select: { displayName: true, email: true } },
                          },
                        },
                      },
                    },
                  },
                  orderBy: { startsAt: "asc" },
                },
              },
              orderBy: { updatedAt: "desc" },
              take: 100,
            }),
            prisma.talentCapacitySnapshot.aggregate({
              where: { organizationId: context.organizationId },
              _avg: { utilizationPercent: true },
              _sum: { availableHours: true, allocatedHours: true },
              _count: true,
            }),
            prisma.talentBenchEntry.groupBy({
              by: ["status"],
              where: { organizationId: context.organizationId },
              _count: true,
            }),
            prisma.talentPerformanceRecord.groupBy({
              by: ["rating"],
              where: { organizationId: context.organizationId },
              _count: true,
            }),
            prisma.talentProfileSkill.groupBy({
              by: ["skillId", "proficiency"],
              where: { talentProfile: { organizationId: context.organizationId } },
              _count: true,
              _avg: { yearsExperience: true },
            }),
          ]);
        const skillDefinitions = await prisma.skill.findMany({
          where: { id: { in: skills.map((row) => row.skillId) } },
          select: { id: true, slug: true, nameEn: true, nameAr: true, category: true },
        });
        const skillById = new Map(skillDefinitions.map((skill) => [skill.id, skill]));
        return {
          profiles,
          members,
          plans,
          analytics: { capacity, bench, performance },
          skillsMatrix: skills.map((row) => ({
            ...row,
            skill: skillById.get(row.skillId) ?? null,
          })),
        };
      },
    );
  }

  async upsertProfile(
    context: TenantContext,
    input: {
      membershipId: string;
      title: string;
      summary?: string;
      status: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
      location?: string;
      timezone: string;
      hireDate?: string;
      costRateMinor?: number;
      billRateMinor?: number;
      currency: string;
      targetUtilizationPercent: number;
    },
  ) {
    await requirePermission(context, "talent.manage");
    const membership = await prisma.membership.findFirst({
      where: {
        id: input.membershipId,
        organizationId: context.organizationId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!membership) {
      throw new AppError("NOT_FOUND", "Active organization member not found.", 404);
    }
    const data = {
      organizationId: context.organizationId,
      title: input.title,
      summary: input.summary,
      status: input.status,
      location: input.location,
      timezone: input.timezone,
      hireDate: input.hireDate ? new Date(input.hireDate) : undefined,
      costRateMinor:
        input.costRateMinor === undefined ? undefined : BigInt(input.costRateMinor),
      billRateMinor:
        input.billRateMinor === undefined ? undefined : BigInt(input.billRateMinor),
      currency: input.currency.toUpperCase(),
      targetUtilizationPercent: input.targetUtilizationPercent,
    };
    return prisma.$transaction(async (tx) => {
      const profile = await tx.talentProfile.upsert({
        where: { membershipId: membership.id },
        create: { membershipId: membership.id, ...data },
        update: data,
      });
      await audit(tx, context, "talent.profile.upserted", "TalentProfile", profile.id);
      return profile;
    });
  }

  async upsertSkill(
    context: TenantContext,
    input: {
      talentProfileId: string;
      skillId: string;
      proficiency: "FOUNDATION" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
      yearsExperience: number;
      verified: boolean;
    },
  ) {
    await requirePermission(context, "talent.manage");
    await profileInTenant(context.organizationId, input.talentProfileId);
    const skill = await prisma.skill.findFirst({
      where: { id: input.skillId, isActive: true },
      select: { id: true },
    });
    if (!skill) throw new AppError("NOT_FOUND", "Skill not found.", 404);
    return prisma.$transaction(async (tx) => {
      const row = await tx.talentProfileSkill.upsert({
        where: {
          talentProfileId_skillId: {
            talentProfileId: input.talentProfileId,
            skillId: skill.id,
          },
        },
        create: {
          talentProfileId: input.talentProfileId,
          skillId: skill.id,
          proficiency: input.proficiency,
          yearsExperience: input.yearsExperience,
          verifiedAt: input.verified ? new Date() : undefined,
        },
        update: {
          proficiency: input.proficiency,
          yearsExperience: input.yearsExperience,
          verifiedAt: input.verified ? new Date() : null,
        },
      });
      await audit(tx, context, "talent.skill.upserted", "TalentProfile", input.talentProfileId, {
        skillId: skill.id,
        proficiency: input.proficiency,
      });
      return row;
    });
  }

  async createCertification(
    context: TenantContext,
    input: {
      talentProfileId: string;
      name: string;
      issuer: string;
      credentialId?: string;
      credentialUrl?: string;
      issuedAt: string;
      expiresAt?: string;
    },
  ) {
    await requirePermission(context, "talent.manage");
    await profileInTenant(context.organizationId, input.talentProfileId);
    const issuedAt = new Date(input.issuedAt);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
    if (expiresAt && expiresAt <= issuedAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Certification expiry must follow its issue date.",
        422,
      );
    }
    const status =
      expiresAt && expiresAt <= new Date()
        ? "EXPIRED"
        : expiresAt && expiresAt.getTime() <= Date.now() + 90 * 24 * 60 * 60 * 1_000
          ? "EXPIRING"
          : "ACTIVE";
    return prisma.$transaction(async (tx) => {
      const certification = await tx.talentCertification.create({
        data: { ...input, issuedAt, expiresAt, status },
      });
      await audit(
        tx,
        context,
        "talent.certification.created",
        "TalentCertification",
        certification.id,
      );
      return certification;
    });
  }

  async createAvailability(
    context: TenantContext,
    input: {
      talentProfileId: string;
      status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
      startsAt: string;
      endsAt: string;
      capacityPercent: number;
      reason?: string;
    },
  ) {
    await requirePermission(context, "talent.manage");
    await profileInTenant(context.organizationId, input.talentProfileId);
    const { start, end } = dateRange(input.startsAt, input.endsAt);
    if (input.status === "UNAVAILABLE" && input.capacityPercent !== 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Unavailable talent must have zero capacity.",
        422,
      );
    }
    return prisma.$transaction(async (tx) => {
      const availability = await tx.talentAvailability.create({
        data: {
          ...input,
          startsAt: start,
          endsAt: end,
        },
      });
      await audit(
        tx,
        context,
        "talent.availability.created",
        "TalentAvailability",
        availability.id,
      );
      return availability;
    });
  }

  async createPlan(
    context: TenantContext,
    input: {
      name: string;
      description?: string;
      projectId?: string;
      startsAt: string;
      endsAt: string;
      budgetHours?: number;
      activate: boolean;
    },
  ) {
    await requirePermission(context, "talent.manage");
    const { start, end } = dateRange(input.startsAt, input.endsAt);
    if (input.projectId) {
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!project) throw new AppError("NOT_FOUND", "Project not found.", 404);
    }
    return prisma.$transaction(async (tx) => {
      const plan = await tx.resourcePlan.create({
        data: {
          organizationId: context.organizationId,
          ownerId: context.userId,
          name: input.name,
          description: input.description,
          projectId: input.projectId,
          startsAt: start,
          endsAt: end,
          budgetHours: input.budgetHours,
          status: input.activate ? "ACTIVE" : "DRAFT",
        },
      });
      await audit(tx, context, "talent.resource_plan.created", "ResourcePlan", plan.id);
      return plan;
    });
  }

  async createRequirement(
    context: TenantContext,
    input: {
      resourcePlanId: string;
      skillId?: string;
      roleTitle: string;
      requiredProfiles: number;
      hoursPerWeek: number;
      minProficiency?: "FOUNDATION" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
      startsAt: string;
      endsAt: string;
    },
  ) {
    await requirePermission(context, "talent.manage");
    const { start, end } = dateRange(input.startsAt, input.endsAt);
    const plan = await prisma.resourcePlan.findFirst({
      where: { id: input.resourcePlanId, organizationId: context.organizationId },
    });
    if (!plan) throw new AppError("NOT_FOUND", "Resource plan not found.", 404);
    if (start < plan.startsAt || end > plan.endsAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Staffing requirement dates must stay within the resource plan.",
        422,
      );
    }
    if (input.skillId) {
      const skill = await prisma.skill.findFirst({
        where: { id: input.skillId, isActive: true },
        select: { id: true },
      });
      if (!skill) throw new AppError("NOT_FOUND", "Skill not found.", 404);
    }
    return prisma.$transaction(async (tx) => {
      const requirement = await tx.staffingRequirement.create({
        data: { ...input, startsAt: start, endsAt: end },
      });
      await audit(
        tx,
        context,
        "talent.staffing_requirement.created",
        "StaffingRequirement",
        requirement.id,
      );
      return requirement;
    });
  }

  async assignStaffing(
    context: TenantContext,
    input: {
      resourcePlanId: string;
      requirementId?: string;
      talentProfileId: string;
      projectId?: string;
      allocationPercent: number;
      hoursPerWeek: number;
      startsAt: string;
      endsAt: string;
      activate: boolean;
    },
  ) {
    await requirePermission(context, "talent.manage");
    const { start, end } = dateRange(input.startsAt, input.endsAt);
    const [plan, profile, requirement, project, overlapping] = await Promise.all([
      prisma.resourcePlan.findFirst({
        where: { id: input.resourcePlanId, organizationId: context.organizationId },
      }),
      profileInTenant(context.organizationId, input.talentProfileId),
      input.requirementId
        ? prisma.staffingRequirement.findFirst({
            where: {
              id: input.requirementId,
              resourcePlanId: input.resourcePlanId,
            },
          })
        : Promise.resolve(null),
      input.projectId
        ? prisma.project.findFirst({
            where: { id: input.projectId, organizationId: context.organizationId },
            select: { id: true },
          })
        : Promise.resolve({ id: "" }),
      prisma.staffingAssignment.findMany({
        where: {
          organizationId: context.organizationId,
          talentProfileId: input.talentProfileId,
          status: { in: ["PLANNED", "ACTIVE"] },
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
        select: { allocationPercent: true },
      }),
    ]);
    if (!plan || (input.requirementId && !requirement) || !project) {
      throw new AppError("NOT_FOUND", "Staffing relationship not found.", 404);
    }
    if (start < plan.startsAt || end > plan.endsAt) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Staffing assignment dates must stay within the resource plan.",
        422,
      );
    }
    const existingAllocation = overlapping.reduce(
      (sum, row) => sum + row.allocationPercent,
      0,
    );
    if (existingAllocation + input.allocationPercent > 100) {
      throw new AppError(
        "CONFLICT",
        "The staffing assignment would exceed 100% capacity.",
        409,
        { existingAllocation },
      );
    }
    return prisma.$transaction(async (tx) => {
      const assignment = await tx.staffingAssignment.create({
        data: {
          organizationId: context.organizationId,
          resourcePlanId: plan.id,
          requirementId: input.requirementId,
          talentProfileId: profile.id,
          projectId: input.projectId ?? plan.projectId,
          allocatedById: context.userId,
          allocationPercent: input.allocationPercent,
          hoursPerWeek: input.hoursPerWeek,
          startsAt: start,
          endsAt: end,
          status: input.activate ? "ACTIVE" : "PLANNED",
        },
      });
      if (requirement) {
        const filled = await tx.staffingAssignment.count({
          where: {
            requirementId: requirement.id,
            status: { in: ["PLANNED", "ACTIVE"] },
          },
        });
        await tx.staffingRequirement.update({
          where: { id: requirement.id },
          data: {
            filledProfiles: filled,
            status:
              filled >= requirement.requiredProfiles
                ? "FILLED"
                : filled > 0
                  ? "PARTIALLY_FILLED"
                  : "OPEN",
          },
        });
      }
      await tx.talentBenchEntry.updateMany({
        where: {
          organizationId: context.organizationId,
          talentProfileId: profile.id,
          status: { in: ["ON_BENCH", "PARTIALLY_ALLOCATED"] },
          endedAt: null,
        },
        data: {
          status: input.allocationPercent >= 100 ? "ASSIGNED" : "PARTIALLY_ALLOCATED",
          endedAt: input.allocationPercent >= 100 ? new Date() : null,
        },
      });
      await audit(
        tx,
        context,
        "talent.staffing_assigned",
        "StaffingAssignment",
        assignment.id,
        { talentProfileId: profile.id, allocationPercent: input.allocationPercent },
      );
      return assignment;
    });
  }

  async captureCapacity(
    context: TenantContext,
    input: {
      talentProfileId: string;
      periodStart: string;
      periodEnd: string;
      availableHours: number;
      allocatedHours: number;
    },
  ) {
    await requirePermission(context, "talent.manage");
    await profileInTenant(context.organizationId, input.talentProfileId);
    const { start, end } = dateRange(input.periodStart, input.periodEnd);
    const utilizationPercent =
      input.availableHours === 0
        ? 0
        : Math.round((input.allocatedHours / input.availableHours) * 100);
    return prisma.talentCapacitySnapshot.upsert({
      where: {
        talentProfileId_periodStart_periodEnd: {
          talentProfileId: input.talentProfileId,
          periodStart: start,
          periodEnd: end,
        },
      },
      create: {
        organizationId: context.organizationId,
        talentProfileId: input.talentProfileId,
        periodStart: start,
        periodEnd: end,
        availableHours: input.availableHours,
        allocatedHours: input.allocatedHours,
        utilizationPercent,
      },
      update: {
        availableHours: input.availableHours,
        allocatedHours: input.allocatedHours,
        utilizationPercent,
        capturedAt: new Date(),
      },
    });
  }

  async enterBench(
    context: TenantContext,
    input: {
      talentProfileId: string;
      reason?: string;
      nextAssignmentDate?: string;
    },
  ) {
    await requirePermission(context, "talent.manage");
    await profileInTenant(context.organizationId, input.talentProfileId);
    const existing = await prisma.talentBenchEntry.findFirst({
      where: {
        organizationId: context.organizationId,
        talentProfileId: input.talentProfileId,
        status: { in: ["ON_BENCH", "PARTIALLY_ALLOCATED"] },
        endedAt: null,
      },
      select: { id: true },
    });
    if (existing) throw new AppError("CONFLICT", "Talent is already on the bench.", 409);
    return prisma.$transaction(async (tx) => {
      const entry = await tx.talentBenchEntry.create({
        data: {
          organizationId: context.organizationId,
          talentProfileId: input.talentProfileId,
          reason: input.reason,
          nextAssignmentDate: input.nextAssignmentDate
            ? new Date(input.nextAssignmentDate)
            : undefined,
        },
      });
      await audit(tx, context, "talent.bench.entered", "TalentBenchEntry", entry.id);
      return entry;
    });
  }

  async exitBench(
    context: TenantContext,
    input: {
      benchEntryId: string;
      status: "PARTIALLY_ALLOCATED" | "ASSIGNED" | "EXITED";
    },
  ) {
    await requirePermission(context, "talent.manage");
    const entry = await prisma.talentBenchEntry.findFirst({
      where: {
        id: input.benchEntryId,
        organizationId: context.organizationId,
        endedAt: null,
      },
    });
    if (!entry) throw new AppError("NOT_FOUND", "Active bench entry not found.", 404);
    return prisma.$transaction(async (tx) => {
      const updated = await tx.talentBenchEntry.update({
        where: { id: entry.id },
        data: {
          status: input.status,
          endedAt: input.status === "PARTIALLY_ALLOCATED" ? null : new Date(),
        },
      });
      await audit(tx, context, "talent.bench.updated", "TalentBenchEntry", entry.id, {
        status: input.status,
      });
      return updated;
    });
  }

  async recordPerformance(
    context: TenantContext,
    input: {
      talentProfileId: string;
      periodStart: string;
      periodEnd: string;
      rating:
        | "BELOW_EXPECTATIONS"
        | "MEETS_EXPECTATIONS"
        | "EXCEEDS_EXPECTATIONS"
        | "EXCEPTIONAL";
      utilizationPercent?: number;
      deliveryScore?: number;
      feedback?: string;
      goals?: Record<string, unknown>;
    },
  ) {
    await requirePermission(context, "talent.manage");
    await profileInTenant(context.organizationId, input.talentProfileId);
    const { start, end } = dateRange(input.periodStart, input.periodEnd);
    return prisma.$transaction(async (tx) => {
      const record = await tx.talentPerformanceRecord.upsert({
        where: {
          talentProfileId_periodStart_periodEnd: {
            talentProfileId: input.talentProfileId,
            periodStart: start,
            periodEnd: end,
          },
        },
        create: {
          organizationId: context.organizationId,
          talentProfileId: input.talentProfileId,
          reviewerId: context.userId,
          periodStart: start,
          periodEnd: end,
          rating: input.rating,
          utilizationPercent: input.utilizationPercent,
          deliveryScore: input.deliveryScore,
          feedback: input.feedback,
          goals: input.goals ? json(input.goals) : undefined,
        },
        update: {
          reviewerId: context.userId,
          rating: input.rating,
          utilizationPercent: input.utilizationPercent,
          deliveryScore: input.deliveryScore,
          feedback: input.feedback,
          goals: input.goals ? json(input.goals) : undefined,
        },
      });
      await audit(
        tx,
        context,
        "talent.performance.recorded",
        "TalentPerformanceRecord",
        record.id,
      );
      return record;
    });
  }
}
