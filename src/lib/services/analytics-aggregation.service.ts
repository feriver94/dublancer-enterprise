import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { PHASE4_JOB_TYPES, runClaimedPhase4Job } from "@/lib/jobs/phase4-job.service";
import type { TenantContext } from "@/lib/tenancy/context";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const DAY_MS = 86_400_000;
const METRIC_NAMES = [
  "events.count",
  "files.uploaded.count",
  "files.downloaded.count",
  "search.queries.count",
  "projects.created.count",
  "contracts.created.count",
  "invoices.issued.count",
  "invoices.issued.minor",
] as const;

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function validateDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError("VALIDATION_ERROR", "Analytics date must use YYYY-MM-DD.", 422);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || dateKey(parsed) !== value) throw new AppError("VALIDATION_ERROR", "Analytics date is invalid.", 422);
  return parsed;
}

function zoneOffset(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second)) - instant.getTime();
}

function localMidnight(key: string, timeZone: string) {
  const date = validateDateKey(key);
  const guess = date.getTime();
  let instant = new Date(guess - zoneOffset(new Date(guess), timeZone));
  instant = new Date(guess - zoneOffset(instant, timeZone));
  return instant;
}

export function analyticsDayBounds(key: string, timeZone = "Asia/Dubai") {
  const date = validateDateKey(key);
  const nextKey = dateKey(new Date(date.getTime() + DAY_MS));
  return { metricDate: date, start: localMidnight(key, timeZone), end: localMidnight(nextKey, timeZone) };
}

function datesBetween(from: string, to: string) {
  const start = validateDateKey(from);
  const end = validateDateKey(to);
  if (end < start) throw new AppError("VALIDATION_ERROR", "Analytics range end must not precede the start.", 422);
  const days = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days > 366) throw new AppError("VALIDATION_ERROR", "Analytics backfill is limited to 366 days per request.", 422);
  return Array.from({ length: days }, (_, index) => dateKey(new Date(start.getTime() + index * DAY_MS)));
}

export class AnalyticsAggregationService {
  private async createRun(input: { organizationId: string; requestedById?: string; from: string; to: string; timeZone: string; idempotencyKey: string }) {
    const days = datesBetween(input.from, input.to);
    const { start } = analyticsDayBounds(days[0], input.timeZone);
    const { end } = analyticsDayBounds(days.at(-1)!, input.timeZone);
    return prisma.$transaction(async (tx) => {
      const run = await tx.analyticsAggregationRun.upsert({
        where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } },
        create: { organizationId: input.organizationId, requestedById: input.requestedById, rangeStart: start, rangeEnd: end, timezone: input.timeZone, idempotencyKey: input.idempotencyKey },
        update: {},
      });
      const job = await tx.backgroundJob.upsert({
        where: { deduplicationKey: `analytics:${input.organizationId}:${input.idempotencyKey}` },
        create: { organizationId: input.organizationId, type: PHASE4_JOB_TYPES.ANALYTICS_AGGREGATE, deduplicationKey: `analytics:${input.organizationId}:${input.idempotencyKey}`, payload: json({ runId: run.id, from: input.from, to: input.to }) },
        update: {},
      });
      return { run, job };
    });
  }

  async enqueueBackfill(context: TenantContext, input: { from: string; to: string; idempotencyKey?: string }) {
    await requirePermission(context, "platform.operations.read");
    datesBetween(input.from, input.to);
    const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: context.organizationId }, select: { timezone: true } });
    const timeZone = settings?.timezone ?? "Asia/Dubai";
    const idempotencyKey = input.idempotencyKey ?? createHash("sha256").update(`backfill:${input.from}:${input.to}:${timeZone}`).digest("hex");
    return this.createRun({ organizationId: context.organizationId, requestedById: context.userId, from: input.from, to: input.to, timeZone, idempotencyKey });
  }

  async scheduleDaily() {
    const organizations = await prisma.organization.findMany({ where: { status: "ACTIVE" }, include: { settings: { select: { timezone: true } } } });
    const scheduled = [];
    for (const organization of organizations) {
      const timeZone = organization.settings?.timezone ?? "Asia/Dubai";
      const localParts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      const today = `${localParts.find((part) => part.type === "year")!.value}-${localParts.find((part) => part.type === "month")!.value}-${localParts.find((part) => part.type === "day")!.value}`;
      const yesterday = dateKey(new Date(validateDateKey(today).getTime() - DAY_MS));
      scheduled.push(await this.createRun({ organizationId: organization.id, from: yesterday, to: yesterday, timeZone, idempotencyKey: `daily:${yesterday}:${timeZone}` }));
    }
    return scheduled;
  }

  private async aggregateDay(organizationId: string, key: string, timeZone: string) {
    const { metricDate, start, end } = analyticsDayBounds(key, timeZone);
    const [eventGroups, eventCount, uploads, downloads, searches, projects, contracts, invoices] = await Promise.all([
      prisma.analyticsEvent.groupBy({ by: ["eventType"], where: { organizationId, occurredAt: { gte: start, lt: end } }, _count: true }),
      prisma.analyticsEvent.count({ where: { organizationId, occurredAt: { gte: start, lt: end } } }),
      prisma.fileVersion.count({ where: { fileNode: { organizationId }, createdAt: { gte: start, lt: end } } }),
      prisma.fileActivity.count({ where: { fileNode: { organizationId }, type: "DOWNLOADED", createdAt: { gte: start, lt: end } } }),
      prisma.searchQueryLog.count({ where: { organizationId, createdAt: { gte: start, lt: end } } }),
      prisma.project.count({ where: { organizationId, createdAt: { gte: start, lt: end } } }),
      prisma.contract.count({ where: { organizationId, createdAt: { gte: start, lt: end } } }),
      prisma.invoice.aggregate({ where: { organizationId, issuedAt: { gte: start, lt: end } }, _count: true, _sum: { totalMinor: true } }),
    ]);
    const metrics: Array<{ metric: string; dimensionKey: string; value: bigint; metadata?: unknown }> = [
      { metric: "events.count", dimensionKey: "all", value: BigInt(eventCount) },
      ...eventGroups.map((group) => ({ metric: "events.count", dimensionKey: group.eventType, value: BigInt(group._count) })),
      { metric: "files.uploaded.count", dimensionKey: "all", value: BigInt(uploads) },
      { metric: "files.downloaded.count", dimensionKey: "all", value: BigInt(downloads) },
      { metric: "search.queries.count", dimensionKey: "all", value: BigInt(searches) },
      { metric: "projects.created.count", dimensionKey: "all", value: BigInt(projects) },
      { metric: "contracts.created.count", dimensionKey: "all", value: BigInt(contracts) },
      { metric: "invoices.issued.count", dimensionKey: "all", value: BigInt(invoices._count) },
      { metric: "invoices.issued.minor", dimensionKey: "AED", value: invoices._sum.totalMinor ?? BigInt(0), metadata: { currency: "AED" } },
    ];
    await prisma.$transaction(async (tx) => {
      await tx.analyticsDailyMetric.deleteMany({ where: { organizationId, date: metricDate, metric: { in: [...METRIC_NAMES] } } });
      for (const metric of metrics) {
        await tx.analyticsDailyMetric.create({ data: { organizationId, date: metricDate, metric: metric.metric, dimensionKey: metric.dimensionKey, value: metric.value, metadata: metric.metadata ? json(metric.metadata) : undefined } });
      }
    });
    return { processedEvents: eventCount, metricCount: metrics.length };
  }

  async processNext(workerId: string) {
    return runClaimedPhase4Job(workerId, [PHASE4_JOB_TYPES.ANALYTICS_AGGREGATE], async (job) => {
      const payload = job.payload as { runId?: string; from?: string; to?: string };
      if (!payload.runId || !payload.from || !payload.to) throw new AppError("VALIDATION_ERROR", "Analytics job payload is invalid.", 422);
      const run = await prisma.analyticsAggregationRun.findFirst({ where: { id: payload.runId, organizationId: job.organizationId ?? undefined } });
      if (!run) throw new AppError("NOT_FOUND", "Analytics aggregation run not found.", 404);
      if (run.status === "COMPLETED") return { runId: run.id, replay: true, metricCount: run.metricCount };
      await prisma.analyticsAggregationRun.update({ where: { id: run.id }, data: { status: "RUNNING", startedAt: run.startedAt ?? new Date(), errorMessage: null } });
      try {
        let processedEventCount = 0;
        let metricCount = 0;
        for (const key of datesBetween(payload.from, payload.to)) {
          const result = await this.aggregateDay(run.organizationId, key, run.timezone);
          processedEventCount += result.processedEvents;
          metricCount += result.metricCount;
        }
        const completedAt = new Date();
        const [completed] = await prisma.$transaction([
          prisma.analyticsAggregationRun.update({ where: { id: run.id }, data: { status: "COMPLETED", processedEventCount, metricCount, completedAt, errorMessage: null } }),
          prisma.realtimeEvent.create({ data: { organizationId: run.organizationId, topic: `organization:${run.organizationId}`, eventType: "analytics.aggregation.completed", aggregateType: "AnalyticsAggregationRun", aggregateId: run.id, payload: json({ processedEventCount, metricCount, completedAt }) } }),
        ]);
        return { runId: completed.id, replay: false, processedEventCount, metricCount };
      } catch (error) {
        await prisma.analyticsAggregationRun.update({ where: { id: run.id }, data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 2000) : "Unknown analytics aggregation error" } });
        throw error;
      }
    });
  }

  async summary(context: TenantContext, input: { days: number; metric?: string; dimensionKey?: string; cursor?: string; take: number }) {
    await requirePermission(context, "analytics.read");
    const since = new Date(Date.now() - input.days * DAY_MS);
    const where: Prisma.AnalyticsDailyMetricWhereInput = {
      organizationId: context.organizationId,
      date: { gte: since },
      ...(input.metric ? { metric: input.metric } : {}),
      ...(input.dimensionKey ? { dimensionKey: input.dimensionKey } : {}),
    };
    const [metrics, activeProjects, activeContracts, invoices, files, searches, latestRun, metricDefinitions] = await Promise.all([
      prisma.analyticsDailyMetric.findMany({ where, orderBy: [{ date: "desc" }, { metric: "asc" }, { dimensionKey: "asc" }, { id: "asc" }], take: input.take + 1, ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}) }),
      prisma.project.count({ where: { organizationId: context.organizationId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.contract.count({ where: { OR: [{ organizationId: context.organizationId }, { providerOrganizationId: context.organizationId }], status: "ACTIVE" } }),
      prisma.invoice.aggregate({ where: { organizationId: context.organizationId, status: { not: "VOID" } }, _count: true, _sum: { totalMinor: true } }),
      prisma.fileNode.count({ where: { organizationId: context.organizationId, type: "FILE", deletedAt: null } }),
      prisma.searchQueryLog.count({ where: { organizationId: context.organizationId, createdAt: { gte: since } } }),
      prisma.analyticsAggregationRun.findFirst({ where: { organizationId: context.organizationId, status: "COMPLETED" }, orderBy: { completedAt: "desc" } }),
      prisma.analyticsDailyMetric.findMany({ where: { organizationId: context.organizationId, date: { gte: since } }, distinct: ["metric", "dimensionKey"], select: { metric: true, dimensionKey: true }, orderBy: [{ metric: "asc" }, { dimensionKey: "asc" }] }),
    ]);
    const hasMore = metrics.length > input.take;
    if (hasMore) metrics.pop();
    const nextCursor = hasMore ? metrics.at(-1)?.id ?? null : null;
    const latestMetricAt = metrics.reduce<Date | null>((latest, metric) => !latest || metric.updatedAt > latest ? metric.updatedAt : latest, null);
    return {
      windowDays: input.days,
      live: { activeProjects, activeContracts, invoices, files, searches },
      freshness: { latestCompletedAt: latestRun?.completedAt ?? null, latestMetricAt, stale: !latestRun?.completedAt || Date.now() - latestRun.completedAt.getTime() > 36 * 60 * 60 * 1000 },
      metrics,
      metricDefinitions,
      nextCursor,
    };
  }
}
