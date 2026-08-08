import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";
import { withTransaction } from "@/lib/database/transaction";
import { assertOrganizationMembership } from "@/lib/tenancy/organization";
import type { TenantContext } from "@/lib/tenancy/context";
import {
  ProjectRepository,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "@/lib/repositories/project.repository";
import { AuditRepository } from "@/lib/repositories/audit.repository";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { requireProjectAccess } from "@/lib/authorization/project-access";
import { SearchIndexService } from "@/lib/services/search-index.service";
import { logger } from "@/lib/observability/logger";

async function synchronizeProject(organizationId: string, projectId: string, action: "UPSERT" | "DELETE") {
  try { await new SearchIndexService().synchronizeEntity(organizationId, "PROJECT", projectId, action); }
  catch (error) { logger.warn("search.project_synchronization_failed", { organizationId, projectId, action, error }); }
}

export class ProjectService {
  async list(
    context: TenantContext,
    input: {
      cursor?: string;
      take: number;
      status?: import("@prisma/client").ProjectStatus;
    },
  ) {
    await assertOrganizationMembership(context);
    await requirePermission(context, "project.read");

    const repository = new ProjectRepository();

    return repository.list({
      organizationId: context.organizationId,
      cursor: input.cursor,
      take: input.take,
      status: input.status,
    });
  }

  async get(context: TenantContext, projectId: string) {
    await assertOrganizationMembership(context);
    await requirePermission(context, "project.read");
    await requireProjectAccess(context, projectId, [
      "OWNER",
      "MANAGER",
      "CONTRIBUTOR",
      "VIEWER",
    ]);

    const repository = new ProjectRepository();
    const project = await repository.findById(
      context.organizationId,
      projectId,
    );

    if (!project) {
      throw new AppError("NOT_FOUND", "Project not found.", 404);
    }

    return project;
  }

  async create(
    context: TenantContext,
    input: Omit<CreateProjectInput, "organizationId" | "ownerId">,
  ) {
    await assertOrganizationMembership(context);
    await requirePermission(context, "project.create");

    try {
      const created = await withTransaction(async (tx) => {
        const projects = new ProjectRepository(tx);
        const audit = new AuditRepository(tx);

        const existing = await projects.findBySlug(
          context.organizationId,
          input.slug,
        );

        if (existing) {
          throw new AppError(
            "CONFLICT",
            "A project with this slug already exists.",
            409,
          );
        }

        const project = await projects.create({
          ...input,
          organizationId: context.organizationId,
          ownerId: context.userId,
        });

        await audit.create({
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: "project.create",
          resourceType: "Project",
          resourceId: project.id,
          outcome: "SUCCESS",
          metadata: {
            title: project.title,
            slug: project.slug,
          },
        });

        return project;
      });
      await synchronizeProject(context.organizationId, created.id, "UPSERT");
      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AppError(
          "CONFLICT",
          "A project with this slug already exists.",
          409,
        );
      }

      throw error;
    }
  }

  async update(
    context: TenantContext,
    projectId: string,
    input: UpdateProjectInput,
  ) {
    await assertOrganizationMembership(context);
    await requirePermission(context, "project.update");
    await requireProjectAccess(context, projectId, ["OWNER", "MANAGER"]);

    const updated = await withTransaction(async (tx) => {
      const projects = new ProjectRepository(tx);
      const audit = new AuditRepository(tx);

      const existing = await projects.findById(
        context.organizationId,
        projectId,
      );

      if (!existing) {
        throw new AppError("NOT_FOUND", "Project not found.", 404);
      }

      if (input.slug && input.slug !== existing.slug) {
        const duplicate = await projects.findBySlug(
          context.organizationId,
          input.slug,
        );

        if (duplicate) {
          throw new AppError(
            "CONFLICT",
            "A project with this slug already exists.",
            409,
          );
        }
      }

      const updated = await projects.update(
        context.organizationId,
        projectId,
        input,
      );

      await audit.create({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "project.update",
        resourceType: "Project",
        resourceId: projectId,
        outcome: "SUCCESS",
        metadata: {
          changedFields: Object.keys(input),
        },
      });

      return updated;
    });
    await synchronizeProject(context.organizationId, projectId, "UPSERT");
    return updated;
  }

  async delete(context: TenantContext, projectId: string) {
    await assertOrganizationMembership(context);
    await requirePermission(context, "project.delete");
    await requireProjectAccess(context, projectId, ["OWNER"]);

    const deleted = await withTransaction(async (tx) => {
      const projects = new ProjectRepository(tx);
      const audit = new AuditRepository(tx);

      const existing = await projects.findById(
        context.organizationId,
        projectId,
      );

      if (!existing) {
        throw new AppError("NOT_FOUND", "Project not found.", 404);
      }

      const deleted = await projects.delete(
        context.organizationId,
        projectId,
      );

      await audit.create({
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "project.delete",
        resourceType: "Project",
        resourceId: projectId,
        outcome: "SUCCESS",
        metadata: {
          title: existing.title,
          slug: existing.slug,
        },
      });

      return deleted;
    });
    await synchronizeProject(context.organizationId, projectId, "DELETE");
    return deleted;
  }
}
