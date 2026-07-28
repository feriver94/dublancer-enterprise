import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { notificationProvider } from "@/lib/providers/integrations";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import type { TenantContext } from "@/lib/tenancy/context";

const MAX_BATCH_SIZE = 100;

function substitute(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

export class EmailOperationsService {
  async queue(input: {
    organizationId?: string | null;
    userId?: string | null;
    recipient: string;
    templateKey: string;
    locale?: string;
    variables: Record<string, string>;
    metadata?: Record<string, unknown>;
  }) {
    const locale = input.locale === "ar-AE" ? "ar-AE" : "en-AE";
    const scopes = [
      ...(input.organizationId ? [`organization:${input.organizationId}`] : []),
      "platform",
    ];
    const templates = await prisma.emailTemplate.findMany({
      where: {
        scope: { in: scopes },
        key: input.templateKey,
        locale,
        isActive: true,
      },
    });
    const template =
      templates.find((item) => item.scope === scopes[0]) ??
      templates.find((item) => item.scope === "platform");
    if (!template) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        `Email template ${input.templateKey}/${locale} is not configured.`,
        503,
      );
    }

    return prisma.$transaction(async (tx) => {
      const message = await tx.emailMessage.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          recipient: input.recipient.toLowerCase(),
          templateKey: input.templateKey,
          locale,
          subject: substitute(template.subject, input.variables),
          textBody: substitute(template.textBody, input.variables),
          htmlBody: substitute(template.htmlBody, input.variables),
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      await tx.emailAuditEvent.create({
        data: {
          organizationId: input.organizationId,
          messageId: message.id,
          type: "email.queued",
          metadata: { templateKey: input.templateKey, locale },
        },
      });
      return message;
    });
  }

  async process(batchSize = MAX_BATCH_SIZE, organizationId?: string) {
    const messages = await prisma.emailMessage.findMany({
      where: {
        status: { in: ["QUEUED", "RETRYING"] },
        availableAt: { lte: new Date() },
        attempts: { lt: prisma.emailMessage.fields.maxAttempts },
        ...(organizationId ? { organizationId } : {}),
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      take: Math.min(Math.max(batchSize, 1), MAX_BATCH_SIZE),
    });
    const results: Array<{ id: string; delivered: boolean; status: string }> = [];

    for (const message of messages) {
      const attemptNumber = message.attempts + 1;
      const claimed = await prisma.emailMessage.updateMany({
        where: {
          id: message.id,
          status: { in: ["QUEUED", "RETRYING"] },
          attempts: message.attempts,
        },
        data: { status: "PROCESSING", attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;

      const attempt = await prisma.emailDeliveryAttempt.create({
        data: {
          messageId: message.id,
          attempt: attemptNumber,
          status: "PROCESSING",
        },
      });

      try {
        const actionUrl =
          message.metadata &&
          typeof message.metadata === "object" &&
          !Array.isArray(message.metadata) &&
          typeof (message.metadata as Record<string, unknown>).actionUrl === "string"
            ? String((message.metadata as Record<string, unknown>).actionUrl)
            : undefined;
        const delivered = await notificationProvider.deliver({
          channel: "EMAIL",
          recipient: message.recipient,
          title: message.subject,
          body: message.textBody,
          htmlBody: message.htmlBody,
          actionUrl,
          idempotencyKey: message.id,
          locale: message.locale,
        });
        const now = new Date();
        await prisma.$transaction([
          prisma.emailDeliveryAttempt.update({
            where: { id: attempt.id },
            data: {
              status: "SENT",
              providerRef: delivered.providerReference,
              finishedAt: now,
            },
          }),
          prisma.emailMessage.update({
            where: { id: message.id },
            data: {
              status: "DELIVERED",
              provider: notificationProvider.key,
              providerRef: delivered.providerReference,
              sentAt: now,
              deliveredAt: now,
              lastError: null,
            },
          }),
          prisma.emailAuditEvent.create({
            data: {
              organizationId: message.organizationId,
              messageId: message.id,
              type: "email.delivered",
              metadata: {
                attempt: attemptNumber,
                provider: notificationProvider.key,
                providerRef: delivered.providerReference ?? null,
              },
            },
          }),
        ]);
        results.push({ id: message.id, delivered: true, status: "DELIVERED" });
      } catch (error) {
        const detail = error instanceof Error ? error.message.slice(0, 2000) : "Unknown email delivery error";
        const exhausted = attemptNumber >= message.maxAttempts;
        const availableAt = new Date(
          Date.now() + Math.min(2 ** Math.max(attemptNumber - 1, 0) * 60_000, 3_600_000),
        );
        await prisma.$transaction([
          prisma.emailDeliveryAttempt.update({
            where: { id: attempt.id },
            data: { status: "FAILED", error: detail, finishedAt: new Date() },
          }),
          prisma.emailMessage.update({
            where: { id: message.id },
            data: {
              status: exhausted ? "FAILED" : "RETRYING",
              availableAt,
              lastError: detail,
            },
          }),
          prisma.emailAuditEvent.create({
            data: {
              organizationId: message.organizationId,
              messageId: message.id,
              type: exhausted ? "email.failed" : "email.retry_scheduled",
              metadata: { attempt: attemptNumber, availableAt, error: detail },
            },
          }),
        ]);
        results.push({
          id: message.id,
          delivered: false,
          status: exhausted ? "FAILED" : "RETRYING",
        });
      }
    }
    return results;
  }

  async recordProviderEvent(input: {
    providerRef: string;
    providerEventId: string;
    event: "DELIVERED" | "SOFT_BOUNCE" | "HARD_BOUNCE" | "COMPLAINT";
    reason?: string;
    occurredAt: Date;
    metadata?: Record<string, unknown>;
  }) {
    const message = await prisma.emailMessage.findUnique({
      where: { providerRef: input.providerRef },
    });
    if (!message) throw new AppError("NOT_FOUND", "Email message not found.", 404);

    if (input.event === "DELIVERED") {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.emailMessage.update({
          where: { id: message.id },
          data: { status: "DELIVERED", deliveredAt: input.occurredAt },
        });
        await tx.emailAuditEvent.create({
          data: {
            organizationId: message.organizationId,
            messageId: message.id,
            type: "email.provider_delivered",
            metadata: { providerEventId: input.providerEventId },
          },
        });
        return updated;
      });
    }

    const type =
      input.event === "SOFT_BOUNCE"
        ? "SOFT"
        : input.event === "HARD_BOUNCE"
          ? "HARD"
          : "COMPLAINT";
    return prisma.$transaction(async (tx) => {
      const bounce = await tx.emailBounce.upsert({
        where: { providerEventId: input.providerEventId },
        create: {
          messageId: message.id,
          providerEventId: input.providerEventId,
          type,
          reason: input.reason,
          occurredAt: input.occurredAt,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
        update: {},
      });
      await tx.emailMessage.update({
        where: { id: message.id },
        data: {
          status: "BOUNCED",
          bouncedAt: input.occurredAt,
          lastError: input.reason,
        },
      });
      await tx.emailAuditEvent.create({
        data: {
          organizationId: message.organizationId,
          messageId: message.id,
          type: `email.${type.toLowerCase()}_bounce`,
          metadata: { providerEventId: input.providerEventId, reason: input.reason ?? null },
        },
      });
      return bounce;
    });
  }

  async history(context: TenantContext) {
    await requirePermission(context, "organization.members.manage");
    return prisma.emailMessage.findMany({
      where: { organizationId: context.organizationId },
      include: {
        deliveryAttempts: { orderBy: { attempt: "desc" }, take: 5 },
        bounces: { orderBy: { occurredAt: "desc" }, take: 5 },
        auditEvents: { orderBy: { createdAt: "desc" }, take: 10 },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
