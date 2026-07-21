import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { requireProjectAccess } from "@/lib/authorization/project-access";
import { EnterpriseFileProductService } from "@/lib/services/enterprise-file.service";

export class ProjectWorkspaceService {
  async addMember(
    context: TenantContext,
    projectId: string,
    input: {
      userId: string;
      role: "OWNER" | "MANAGER" | "CONTRIBUTOR" | "VIEWER";
    },
  ) {
    await requireProjectAccess(context, projectId, ["OWNER", "MANAGER"]);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });

    if (!project) {
      throw new AppError("NOT_FOUND", "Project not found.", 404);
    }

    const organizationMembership = await prisma.membership.findFirst({
      where: {
        organizationId: project.organizationId,
        userId: input.userId,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (!organizationMembership) {
      throw new AppError(
        "CONFLICT",
        "User must be an active organization member first.",
        409,
      );
    }

    return prisma.$transaction(async (tx) => {
      const membership = await tx.projectMembership.upsert({
        where: {
          projectId_userId: {
            projectId,
            userId: input.userId,
          },
        },
        create: {
          projectId,
          userId: input.userId,
          role: input.role,
        },
        update: {
          role: input.role,
        },
      });

      await tx.projectActivity.create({
        data: {
          projectId,
          actorUserId: context.userId,
          type: "MEMBER_ADDED",
          resourceType: "ProjectMembership",
          resourceId: membership.id,
          summary: "Project member added or updated.",
          metadata: {
            userId: input.userId,
            role: input.role,
          },
        },
      });

      return membership;
    });
  }

  async createMilestone(
    context: TenantContext,
    projectId: string,
    input: {
      title: string;
      description?: string;
      status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
      dueAt?: Date;
    },
  ) {
    await requireProjectAccess(context, projectId, ["OWNER", "MANAGER"]);

    return prisma.$transaction(async (tx) => {
      const milestone = await tx.projectMilestone.create({
        data: {
          projectId,
          ...input,
        },
      });

      await tx.projectActivity.create({
        data: {
          projectId,
          actorUserId: context.userId,
          type: "MILESTONE_CREATED",
          resourceType: "ProjectMilestone",
          resourceId: milestone.id,
          summary: `Milestone created: ${milestone.title}.`,
        },
      });

      return milestone;
    });
  }

  async createTask(
    context: TenantContext,
    projectId: string,
    input: {
      milestoneId?: string;
      assigneeId?: string;
      title: string;
      description?: string;
      status: "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE" | "CANCELLED";
      priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      dueAt?: Date;
      position: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    await requireProjectAccess(context, projectId, ["OWNER", "MANAGER", "CONTRIBUTOR"]);

    if (input.milestoneId) {
      const milestone = await prisma.projectMilestone.findFirst({
        where: {
          id: input.milestoneId,
          projectId,
        },
        select: { id: true },
      });
      if (!milestone) {
        throw new AppError("NOT_FOUND", "Milestone not found in this project.", 404);
      }
    }

    if (input.assigneeId) {
      const assignee = await prisma.projectMembership.findFirst({
        where: {
          projectId,
          userId: input.assigneeId,
        },
        select: { id: true },
      });
      if (!assignee) {
        throw new AppError("CONFLICT", "Assignee must be a project member.", 409);
      }
    }

    return prisma.$transaction(async (tx) => {
      const task = await tx.projectTask.create({
        data: {
          projectId,
          creatorId: context.userId,
          ...input,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      await tx.projectActivity.create({
        data: {
          projectId,
          actorUserId: context.userId,
          type: "TASK_CREATED",
          resourceType: "ProjectTask",
          resourceId: task.id,
          summary: `Task created: ${task.title}.`,
        },
      });

      if (task.assigneeId && task.assigneeId !== context.userId) {
        await tx.userNotification.create({
          data: {
            userId: task.assigneeId,
            organizationId: context.organizationId,
            projectId,
            type: "TASK_ASSIGNED",
            title: "You were assigned a task",
            body: task.title,
            metadata: {
              taskId: task.id,
            },
          },
        });
      }

      return task;
    });
  }

  async updateTask(
    context: TenantContext,
    projectId: string,
    taskId: string,
    input: Record<string, unknown>,
  ) {
    await requireProjectAccess(context, projectId, ["OWNER", "MANAGER", "CONTRIBUTOR"]);

    const existing = await prisma.projectTask.findFirst({
      where: {
        id: taskId,
        projectId,
      },
      select: {
        id: true,
        assigneeId: true,
      },
    });

    if (!existing) {
      throw new AppError("NOT_FOUND", "Task not found.", 404);
    }

    return prisma.$transaction(async (tx) => {
      const task = await tx.projectTask.update({
        where: {
          id: taskId,
          projectId,
        },
        data: input,
      });

      await tx.projectActivity.create({
        data: {
          projectId,
          actorUserId: context.userId,
          type:
            task.assigneeId !== existing.assigneeId
              ? "TASK_ASSIGNED"
              : "TASK_UPDATED",
          resourceType: "ProjectTask",
          resourceId: task.id,
          summary: `Task updated: ${task.title}.`,
          metadata: {
            changedFields: Object.keys(input),
          },
        },
      });

      return task;
    });
  }

  async createComment(
    context: TenantContext,
    projectId: string,
    input: {
      taskId?: string;
      body: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await requireProjectAccess(context, projectId, ["OWNER", "MANAGER", "CONTRIBUTOR", "VIEWER"]);

    if (input.taskId) {
      const task = await prisma.projectTask.findFirst({
        where: {
          id: input.taskId,
          projectId,
        },
        select: { id: true },
      });
      if (!task) {
        throw new AppError("NOT_FOUND", "Task not found in this project.", 404);
      }
    }

    return prisma.$transaction(async (tx) => {
      const comment = await tx.projectComment.create({
        data: {
          projectId,
          authorId: context.userId,
          ...input,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      await tx.projectActivity.create({
        data: {
          projectId,
          actorUserId: context.userId,
          type: "COMMENT_CREATED",
          resourceType: "ProjectComment",
          resourceId: comment.id,
          summary: "Project comment created.",
        },
      });

      return comment;
    });
  }

  async registerAttachment(
    context: TenantContext,
    projectId: string,
    input: {
      taskId?: string;
      fileVersionId: string;
    },
  ) {
    return new EnterpriseFileProductService().bindProjectAttachment(context, projectId, input);
  }

  async listActivity(
    context: TenantContext,
    projectId: string,
    input: {
      cursor?: string;
      take: number;
    },
  ) {
    await requireProjectAccess(context, projectId, ["OWNER", "MANAGER", "CONTRIBUTOR", "VIEWER"]);

    const rows = await prisma.projectActivity.findMany({
      where: { projectId },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: input.take + 1,
      ...(input.cursor
        ? {
            cursor: { id: input.cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = rows.length > input.take;
    const items = hasMore ? rows.slice(0, input.take) : rows;

    return {
      items,
      nextCursor: hasMore
        ? items[items.length - 1]?.id ?? null
        : null,
    };
  }
}
