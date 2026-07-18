import type {
  Prisma,
  Project,
  ProjectStatus,
} from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import type { TransactionClient } from "@/lib/database/transaction";

type DbClient = typeof prisma | TransactionClient;

export type ProjectListInput = {
  organizationId: string;
  cursor?: string;
  take: number;
  status?: ProjectStatus;
};

export type CreateProjectInput = {
  organizationId: string;
  ownerId: string;
  title: string;
  slug: string;
  description?: string;
  budgetMinor?: bigint;
  currency: string;
};

export type UpdateProjectInput = {
  title?: string;
  slug?: string;
  description?: string;
  budgetMinor?: bigint;
  currency?: string;
  status?: ProjectStatus;
};

export class ProjectRepository {
  constructor(private readonly db: DbClient = prisma) {}

  async list(input: ProjectListInput) {
    const items = await this.db.project.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.status ? { status: input.status } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.take + 1,
      ...(input.cursor
        ? {
            cursor: { id: input.cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        organizationId: true,
        ownerId: true,
        title: true,
        slug: true,
        description: true,
        status: true,
        budgetMinor: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = items.length > input.take;
    const visibleItems = hasMore ? items.slice(0, input.take) : items;

    return {
      items: visibleItems,
      nextCursor: hasMore
        ? visibleItems[visibleItems.length - 1]?.id ?? null
        : null,
    };
  }

  async findById(
    organizationId: string,
    projectId: string,
  ) {
    return this.db.project.findFirst({
      where: {
        id: projectId,
        organizationId,
      },
      include: {
        milestones: { orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }] },
        tasks: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          include: {
            assignee: { select: { id: true, displayName: true, email: true } },
            creator: { select: { id: true, displayName: true } },
          },
        },
        comments: {
          orderBy: { createdAt: "desc" },
          include: {
            author: { select: { id: true, displayName: true, email: true } },
          },
        },
        memberships: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, displayName: true, email: true } },
          },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
          include: {
            uploadedBy: { select: { id: true, displayName: true } },
          },
        },
        activities: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
  }

  async findBySlug(
    organizationId: string,
    slug: string,
  ): Promise<Project | null> {
    return this.db.project.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug,
        },
      },
    });
  }

  async create(input: CreateProjectInput): Promise<Project> {
    return this.db.project.create({
      data: input,
    });
  }

  async update(
    organizationId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    return this.db.project.update({
      where: {
        id: projectId,
        organizationId,
      },
      data: input,
    });
  }

  async delete(
    organizationId: string,
    projectId: string,
  ): Promise<Project> {
    return this.db.project.delete({
      where: {
        id: projectId,
        organizationId,
      },
    });
  }
}
