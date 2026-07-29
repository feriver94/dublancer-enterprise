import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import {
  requirePermission,
  resolveAuthorization,
} from "@/lib/authorization/permission-resolver";
import type { TenantContext } from "@/lib/tenancy/context";
import { AiGovernanceService } from "@/lib/services/ai-governance.service";
import { withPerformanceProfile } from "@/lib/services/platform-reliability.service";
import { distributedCache } from "@/lib/cache/distributed-cache";

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

function terms(query: string) {
  return [...new Set(
    query
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 2),
  )].slice(0, 20);
}

function relevance(queryTerms: string[], title: string, body: string) {
  const lowerTitle = title.toLocaleLowerCase();
  const lowerBody = body.toLocaleLowerCase();
  return queryTerms.reduce(
    (score, term) =>
      score +
      (lowerTitle.includes(term) ? 4 : 0) +
      (lowerBody.includes(term) ? 1 : 0),
    0,
  );
}

function excerpt(body: string, queryTerms: string[]) {
  const compact = body.replace(/\s+/g, " ").trim();
  const lower = compact.toLocaleLowerCase();
  const first = queryTerms
    .map((term) => lower.indexOf(term))
    .filter((position) => position >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, first - 120);
  return `${start > 0 ? "…" : ""}${compact.slice(start, start + 520)}${compact.length > start + 520 ? "…" : ""}`;
}

export class KnowledgeManagementService {
  private readonly ai = new AiGovernanceService();

  async dashboard(context: TenantContext) {
    await requirePermission(context, "knowledge.read");
    const authorization = await resolveAuthorization(context);
    const canApprove =
      authorization.isPlatformAdmin ||
      authorization.permissions.includes("knowledge.approve");
    return withPerformanceProfile(
      {
        operation: "phase9.knowledge.dashboard",
        organizationId: context.organizationId,
      },
      async () => {
        const [categories, reviewers, articles, faqs, retrievals, statusCounts] =
          await Promise.all([
            prisma.knowledgeCategory.findMany({
              where: { organizationId: context.organizationId },
              include: {
                parent: { select: { id: true, name: true } },
                _count: { select: { articles: true, faqs: true, children: true } },
              },
              orderBy: { name: "asc" },
            }),
            prisma.membership.findMany({
              where: {
                organizationId: context.organizationId,
                status: "ACTIVE",
                role: {
                  permissions: {
                    some: { permission: { key: "knowledge.approve" } },
                  },
                },
              },
              include: {
                user: { select: { id: true, displayName: true, email: true } },
              },
              orderBy: { createdAt: "asc" },
            }),
            prisma.knowledgeArticle.findMany({
              where: { organizationId: context.organizationId },
              include: {
                category: { select: { id: true, name: true, slug: true } },
                owner: { select: { id: true, displayName: true, email: true } },
                versions: { orderBy: { version: "desc" }, take: 20 },
                approvals: {
                  where: canApprove ? {} : { reviewerId: context.userId },
                  include: {
                    reviewer: { select: { displayName: true, email: true } },
                    version: { select: { version: true } },
                  },
                  orderBy: { createdAt: "desc" },
                },
              },
              orderBy: { updatedAt: "desc" },
              take: 200,
            }),
            prisma.knowledgeFaq.findMany({
              where: { organizationId: context.organizationId },
              include: { category: { select: { id: true, name: true } } },
              orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
              take: 200,
            }),
            prisma.knowledgeRetrievalLog.findMany({
              where: {
                organizationId: context.organizationId,
                ...(authorization.isPlatformAdmin ||
                authorization.permissions.includes("knowledge.manage")
                  ? {}
                  : { userId: context.userId }),
              },
              orderBy: { createdAt: "desc" },
              take: 100,
            }),
            prisma.knowledgeArticle.groupBy({
              by: ["status"],
              where: { organizationId: context.organizationId },
              _count: true,
            }),
          ]);
        return {
          categories,
          reviewers,
          articles,
          faqs,
          retrievals,
          analytics: {
            statusCounts,
            pendingApprovals: articles.reduce(
              (count, article) =>
                count +
                article.approvals.filter((approval) => approval.decision === "PENDING")
                  .length,
              0,
            ),
            publishedArticles:
              statusCounts.find((row) => row.status === "PUBLISHED")?._count ?? 0,
          },
        };
      },
    );
  }

  async createCategory(
    context: TenantContext,
    input: {
      name: string;
      slug: string;
      description?: string;
      parentId?: string;
    },
  ) {
    await requirePermission(context, "knowledge.manage");
    if (input.parentId) {
      const parent = await prisma.knowledgeCategory.findFirst({
        where: { id: input.parentId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!parent) throw new AppError("NOT_FOUND", "Knowledge category not found.", 404);
    }
    return prisma.$transaction(async (tx) => {
      const category = await tx.knowledgeCategory.create({
        data: { organizationId: context.organizationId, ...input },
      });
      await audit(
        tx,
        context,
        "knowledge.category.created",
        "KnowledgeCategory",
        category.id,
      );
      return category;
    });
  }

  async createArticle(
    context: TenantContext,
    input: {
      categoryId?: string;
      slug: string;
      title: string;
      summary?: string;
      locale: "en-AE" | "ar-AE";
      body: string;
      isInternal: boolean;
      metadata?: Record<string, unknown>;
    },
  ) {
    await requirePermission(context, "knowledge.manage");
    if (input.categoryId) {
      const category = await prisma.knowledgeCategory.findFirst({
        where: { id: input.categoryId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!category) throw new AppError("NOT_FOUND", "Knowledge category not found.", 404);
    }
    return prisma.$transaction(async (tx) => {
      const article = await tx.knowledgeArticle.create({
        data: {
          organizationId: context.organizationId,
          categoryId: input.categoryId,
          ownerId: context.userId,
          slug: input.slug,
          title: input.title,
          summary: input.summary,
          locale: input.locale,
          isInternal: input.isInternal,
          metadata: input.metadata ? json(input.metadata) : undefined,
          versions: {
            create: {
              version: 1,
              title: input.title,
              body: input.body,
              changeSummary: "Initial version",
              createdById: context.userId,
            },
          },
        },
        include: { versions: true },
      });
      await audit(
        tx,
        context,
        "knowledge.article.created",
        "KnowledgeArticle",
        article.id,
        { version: 1 },
      );
      return article;
    });
  }

  async createVersion(
    context: TenantContext,
    input: {
      articleId: string;
      title: string;
      body: string;
      changeSummary?: string;
    },
  ) {
    await requirePermission(context, "knowledge.manage");
    const article = await prisma.knowledgeArticle.findFirst({
      where: { id: input.articleId, organizationId: context.organizationId },
    });
    if (!article || article.status === "ARCHIVED") {
      throw new AppError("NOT_FOUND", "Editable knowledge article not found.", 404);
    }
    return prisma.$transaction(async (tx) => {
      const version = article.currentVersion + 1;
      const changed = await tx.knowledgeArticle.updateMany({
        where: {
          id: article.id,
          organizationId: context.organizationId,
          currentVersion: article.currentVersion,
        },
        data: {
          title: input.title,
          currentVersion: version,
          status: "DRAFT",
        },
      });
      if (changed.count !== 1) {
        throw new AppError("CONFLICT", "The article changed before this version was saved.", 409);
      }
      const created = await tx.knowledgeArticleVersion.create({
        data: {
          articleId: article.id,
          version,
          title: input.title,
          body: input.body,
          changeSummary: input.changeSummary,
          createdById: context.userId,
        },
      });
      await audit(
        tx,
        context,
        "knowledge.article.version_created",
        "KnowledgeArticle",
        article.id,
        { version },
      );
      return created;
    });
  }

  async submitArticle(
    context: TenantContext,
    input: { articleId: string; reviewerIds: string[] },
  ) {
    await requirePermission(context, "knowledge.manage");
    const article = await prisma.knowledgeArticle.findFirst({
      where: { id: input.articleId, organizationId: context.organizationId },
    });
    if (!article || !["DRAFT", "APPROVED"].includes(article.status)) {
      throw new AppError("CONFLICT", "Only a draft article can enter review.", 409);
    }
    const reviewerIds = [...new Set(input.reviewerIds)];
    if (reviewerIds.includes(article.ownerId)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Knowledge approval requires an independent reviewer.",
        422,
      );
    }
    const reviewers = await prisma.membership.findMany({
      where: {
        organizationId: context.organizationId,
        userId: { in: reviewerIds },
        status: "ACTIVE",
        role: {
          permissions: {
            some: { permission: { key: "knowledge.approve" } },
          },
        },
      },
      select: { userId: true },
    });
    if (reviewers.length !== reviewerIds.length) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Every reviewer must be an active member with knowledge approval permission.",
        422,
      );
    }
    const version = await prisma.knowledgeArticleVersion.findUnique({
      where: {
        articleId_version: {
          articleId: article.id,
          version: article.currentVersion,
        },
      },
    });
    if (!version) throw new AppError("NOT_FOUND", "Article version not found.", 404);
    return prisma.$transaction(async (tx) => {
      await tx.knowledgeApproval.deleteMany({
        where: {
          articleId: article.id,
          versionId: version.id,
          decision: "PENDING",
        },
      });
      await tx.knowledgeApproval.createMany({
        data: reviewerIds.map((reviewerId) => ({
          articleId: article.id,
          versionId: version.id,
          reviewerId,
        })),
        skipDuplicates: true,
      });
      await tx.knowledgeArticle.update({
        where: { id: article.id },
        data: { status: "IN_REVIEW" },
      });
      await audit(
        tx,
        context,
        "knowledge.article.submitted",
        "KnowledgeArticle",
        article.id,
        { version: article.currentVersion, reviewerCount: reviewerIds.length },
      );
      return tx.knowledgeArticle.findUniqueOrThrow({
        where: { id: article.id },
        include: { approvals: { where: { versionId: version.id } } },
      });
    });
  }

  async decideApproval(
    context: TenantContext,
    input: {
      approvalId: string;
      decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
      comment?: string;
    },
  ) {
    await requirePermission(context, "knowledge.approve");
    const approval = await prisma.knowledgeApproval.findFirst({
      where: {
        id: input.approvalId,
        reviewerId: context.userId,
        decision: "PENDING",
        article: { organizationId: context.organizationId, status: "IN_REVIEW" },
      },
      include: { article: true },
    });
    if (!approval) {
      throw new AppError("NOT_FOUND", "Pending knowledge approval not found.", 404);
    }
    return prisma.$transaction(async (tx) => {
      const decided = await tx.knowledgeApproval.update({
        where: { id: approval.id },
        data: {
          decision: input.decision,
          comment: input.comment,
          decidedAt: new Date(),
        },
      });
      const approvals = await tx.knowledgeApproval.findMany({
        where: { articleId: approval.articleId, versionId: approval.versionId },
        select: { decision: true },
      });
      const articleStatus = approvals.some((row) =>
        ["CHANGES_REQUESTED", "REJECTED"].includes(row.decision),
      )
        ? "DRAFT"
        : approvals.every((row) => row.decision === "APPROVED")
          ? "APPROVED"
          : "IN_REVIEW";
      await tx.knowledgeArticle.update({
        where: { id: approval.articleId },
        data: { status: articleStatus },
      });
      await audit(
        tx,
        context,
        "knowledge.approval.decided",
        "KnowledgeApproval",
        decided.id,
        { decision: input.decision, articleStatus },
      );
      return { approval: decided, articleStatus };
    });
  }

  async publishArticle(context: TenantContext, articleId: string) {
    await requirePermission(context, "knowledge.manage");
    await requirePermission(context, "knowledge.approve");
    const article = await prisma.knowledgeArticle.findFirst({
      where: {
        id: articleId,
        organizationId: context.organizationId,
        status: "APPROVED",
      },
      include: {
        versions: { orderBy: { version: "desc" }, take: 1 },
        approvals: true,
      },
    });
    const version = article?.versions[0];
    if (!article || !version || version.version !== article.currentVersion) {
      throw new AppError("CONFLICT", "Approved article version not found.", 409);
    }
    if (
      !article.approvals.some(
        (approval) =>
          approval.versionId === version.id && approval.decision === "APPROVED",
      )
    ) {
      throw new AppError(
        "CONFLICT",
        "At least one independent approval is required before publication.",
        409,
      );
    }
    const publishedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const published = await tx.knowledgeArticle.update({
        where: { id: article.id },
        data: {
          status: "PUBLISHED",
          publishedVersion: version.version,
          publishedAt,
          archivedAt: null,
        },
      });
      await tx.searchDocument.upsert({
        where: {
          organizationId_entityType_entityId: {
            organizationId: context.organizationId,
            entityType: "KNOWLEDGE_ARTICLE",
            entityId: article.id,
          },
        },
        create: {
          organizationId: context.organizationId,
          entityType: "KNOWLEDGE_ARTICLE",
          entityId: article.id,
          title: version.title,
          body: version.body,
          locale: article.locale,
          requiredPermission: "knowledge.read",
          sourceUpdatedAt: publishedAt,
          metadata: json({
            href: `/knowledge?articleId=${article.id}`,
            slug: article.slug,
            version: version.version,
            isInternal: article.isInternal,
          }),
        },
        update: {
          title: version.title,
          body: version.body,
          locale: article.locale,
          requiredPermission: "knowledge.read",
          sourceUpdatedAt: publishedAt,
          indexedAt: publishedAt,
          deletedAt: null,
          metadata: json({
            href: `/knowledge?articleId=${article.id}`,
            slug: article.slug,
            version: version.version,
            isInternal: article.isInternal,
          }),
        },
      });
      await audit(
        tx,
        context,
        "knowledge.article.published",
        "KnowledgeArticle",
        article.id,
        { version: version.version },
      );
      return published;
    });
    await distributedCache.invalidateTenant(context.organizationId);
    return result;
  }

  async archiveArticle(context: TenantContext, articleId: string) {
    await requirePermission(context, "knowledge.manage");
    const article = await prisma.knowledgeArticle.findFirst({
      where: { id: articleId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (!article) throw new AppError("NOT_FOUND", "Knowledge article not found.", 404);
    const result = await prisma.$transaction(async (tx) => {
      const archived = await tx.knowledgeArticle.update({
        where: { id: article.id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await tx.searchDocument.updateMany({
        where: {
          organizationId: context.organizationId,
          entityType: "KNOWLEDGE_ARTICLE",
          entityId: article.id,
        },
        data: { deletedAt: new Date() },
      });
      await audit(
        tx,
        context,
        "knowledge.article.archived",
        "KnowledgeArticle",
        article.id,
      );
      return archived;
    });
    await distributedCache.invalidateTenant(context.organizationId);
    return result;
  }

  async upsertFaq(
    context: TenantContext,
    input: {
      faqId?: string;
      categoryId?: string;
      question: string;
      answer: string;
      locale: "en-AE" | "ar-AE";
      publish: boolean;
      sortOrder: number;
    },
  ) {
    await requirePermission(context, "knowledge.manage");
    if (input.categoryId) {
      const category = await prisma.knowledgeCategory.findFirst({
        where: { id: input.categoryId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!category) throw new AppError("NOT_FOUND", "Knowledge category not found.", 404);
    }
    if (input.faqId) {
      const faq = await prisma.knowledgeFaq.findFirst({
        where: { id: input.faqId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!faq) throw new AppError("NOT_FOUND", "FAQ not found.", 404);
    }
    const now = new Date();
    const faq = await prisma.$transaction(async (tx) => {
      const saved = input.faqId
        ? await tx.knowledgeFaq.update({
            where: { id: input.faqId },
            data: {
              categoryId: input.categoryId,
              question: input.question,
              answer: input.answer,
              locale: input.locale,
              sortOrder: input.sortOrder,
              status: input.publish ? "PUBLISHED" : "DRAFT",
              publishedAt: input.publish ? now : null,
            },
          })
        : await tx.knowledgeFaq.create({
            data: {
              organizationId: context.organizationId,
              createdById: context.userId,
              categoryId: input.categoryId,
              question: input.question,
              answer: input.answer,
              locale: input.locale,
              sortOrder: input.sortOrder,
              status: input.publish ? "PUBLISHED" : "DRAFT",
              publishedAt: input.publish ? now : undefined,
            },
          });
      if (input.publish) {
        await tx.searchDocument.upsert({
          where: {
            organizationId_entityType_entityId: {
              organizationId: context.organizationId,
              entityType: "KNOWLEDGE_FAQ",
              entityId: saved.id,
            },
          },
          create: {
            organizationId: context.organizationId,
            entityType: "KNOWLEDGE_FAQ",
            entityId: saved.id,
            title: saved.question,
            body: saved.answer,
            locale: saved.locale,
            requiredPermission: "knowledge.read",
            sourceUpdatedAt: now,
            metadata: json({ href: `/knowledge?faqId=${saved.id}` }),
          },
          update: {
            title: saved.question,
            body: saved.answer,
            locale: saved.locale,
            sourceUpdatedAt: now,
            indexedAt: now,
            deletedAt: null,
          },
        });
      } else {
        await tx.searchDocument.updateMany({
          where: {
            organizationId: context.organizationId,
            entityType: "KNOWLEDGE_FAQ",
            entityId: saved.id,
          },
          data: { deletedAt: now },
        });
      }
      await audit(tx, context, "knowledge.faq.upserted", "KnowledgeFaq", saved.id, {
        published: input.publish,
      });
      return saved;
    });
    await distributedCache.invalidateTenant(context.organizationId);
    return faq;
  }

  async retrieve(
    context: TenantContext,
    input: {
      query: string;
      locale?: "en-AE" | "ar-AE";
      take: number;
      aiAssist: boolean;
      idempotencyKey?: string;
    },
  ) {
    await requirePermission(context, "knowledge.read");
    const started = performance.now();
    const queryTerms = terms(input.query);
    if (!queryTerms.length) {
      throw new AppError("VALIDATION_ERROR", "Knowledge query has no searchable terms.", 422);
    }
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        organizationId: context.organizationId,
        status: "PUBLISHED",
        ...(input.locale ? { locale: input.locale } : {}),
      },
      include: {
        versions: {
          where: { version: { gt: 0 } },
          orderBy: { version: "desc" },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 500,
    });
    const sources = articles
      .flatMap((article) => {
        const version = article.versions.find(
          (candidate) => candidate.version === article.publishedVersion,
        );
        if (!version) return [];
        const score = relevance(queryTerms, version.title, version.body);
        return score > 0
          ? [{
              articleId: article.id,
              slug: article.slug,
              title: version.title,
              version: version.version,
              score,
              excerpt: excerpt(version.body, queryTerms),
            }]
          : [];
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, input.take);
    const confidence =
      sources.length === 0
        ? 0
        : Math.min(1, sources.reduce((sum, source) => sum + source.score, 0) / 20);
    const groundedAnswer =
      sources.length === 0
        ? "No approved knowledge source matched this query."
        : sources.map((source) => `${source.title}: ${source.excerpt}`).join("\n\n");
    let aiRun = null;
    if (input.aiAssist) {
      await requirePermission(context, "ai.use");
      aiRun = await this.ai.create(context, {
        useCase: "knowledge.retrieval",
        input: {
          query: input.query,
          instructions:
            "Answer only from the approved tenant knowledge excerpts. Cite articleId and version. State when evidence is insufficient.",
          sources,
        },
        idempotencyKey: input.idempotencyKey ?? `knowledge-${randomUUID()}`,
      });
    }
    const latencyMs = Math.round(performance.now() - started);
    const retrieval = await prisma.knowledgeRetrievalLog.create({
      data: {
        organizationId: context.organizationId,
        userId: context.userId,
        query: input.query,
        answer: input.aiAssist ? null : groundedAnswer,
        sourceArticleIds: sources.map((source) => source.articleId),
        confidence,
        mode: input.aiAssist ? "GOVERNED_AI_PENDING" : "GROUNDED_SEARCH",
        aiRunId: aiRun?.id,
        latencyMs,
      },
    });
    return {
      retrievalId: retrieval.id,
      mode: retrieval.mode,
      answer: groundedAnswer,
      confidence,
      sources,
      aiRun,
      latencyMs,
    };
  }
}
