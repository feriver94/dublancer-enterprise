import {
  createHash,
  createHmac,
  randomUUID,
} from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { encryptSecret, decryptSecret } from "@/lib/security/secret-box";
import {
  incrementMetric,
  metricsSnapshot,
  observeMetric,
} from "@/lib/observability/metrics";
import { distributedCache } from "@/lib/cache/distributed-cache";
import { pingRedis } from "@/lib/realtime/redis";
import { checkDatabaseHealth } from "@/lib/database/health";
import { withSpan } from "@/lib/observability/telemetry";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function windowMs(window: "ROLLING_1H" | "ROLLING_24H" | "ROLLING_7D" | "ROLLING_30D") {
  return {
    ROLLING_1H: 60 * 60_000,
    ROLLING_24H: 24 * 60 * 60_000,
    ROLLING_7D: 7 * 24 * 60 * 60_000,
    ROLLING_30D: 30 * 24 * 60 * 60_000,
  }[window];
}

function responseCounters() {
  const snapshot = metricsSnapshot();
  let total = 0;
  let errors = 0;
  for (const [key, value] of Object.entries(snapshot.counters)) {
    if (!key.startsWith("dublancer_http_responses_total|")) continue;
    total += value;
    const status = Number(key.match(/(?:^|,)status=(\d+)/)?.[1] ?? 0);
    if (status >= 500) errors += value;
  }
  return { total, errors, good: Math.max(0, total - errors) };
}

async function signedPost(
  endpoint: string,
  secretCipher: string | null,
  payload: unknown,
) {
  const url = new URL(endpoint);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Reliability exports require HTTPS in production.");
  }
  const raw = JSON.stringify(payload);
  const signature = secretCipher
    ? createHmac("sha256", decryptSecret(secretCipher))
        .update(raw)
        .digest("hex")
    : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "Dublancer-Reliability/1.0",
        "x-dublancer-delivery-id": randomUUID(),
        ...(signature ? { "x-dublancer-signature-256": `sha256=${signature}` } : {}),
      },
      body: raw,
    });
    if (!response.ok) {
      throw new Error(`Destination returned HTTP ${response.status}.`);
    }
    return response.status;
  } finally {
    clearTimeout(timeout);
  }
}

export class PlatformReliabilityService {
  async dashboard(context: TenantContext) {
    await requirePermission(context, "observability.read");
    const now = new Date();
    const [
      objectives,
      hooks,
      exportDestinations,
      scalingPolicies,
      recommendations,
      profiles,
      loadTests,
      queueGroups,
      activeWorkers,
      database,
      redis,
    ] = await Promise.all([
      prisma.serviceLevelObjective.findMany({
        where: {
          OR: [
            { organizationId: context.organizationId },
            { organizationId: null },
          ],
        },
        include: {
          measurements: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { name: "asc" },
      }),
      prisma.alertHook.findMany({
        where: {
          OR: [
            { organizationId: context.organizationId },
            { organizationId: null },
          ],
        },
        select: {
          id: true,
          name: true,
          type: true,
          endpoint: true,
          eventTypes: true,
          enabled: true,
          maxAttempts: true,
          createdAt: true,
          _count: { select: { deliveries: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.auditExportDestination.findMany({
        where: { organizationId: context.organizationId },
        select: {
          id: true,
          name: true,
          type: true,
          endpoint: true,
          enabled: true,
          cursorCreatedAt: true,
          cursorId: true,
          createdAt: true,
          runs: { orderBy: { createdAt: "desc" }, take: 5 },
        },
        orderBy: { name: "asc" },
      }),
      prisma.workerScalingPolicy.findMany({
        where: {
          OR: [
            { organizationId: context.organizationId },
            { organizationId: null },
          ],
        },
        orderBy: { queue: "asc" },
      }),
      prisma.workerScalingRecommendation.findMany({
        where: {
          OR: [
            { organizationId: context.organizationId },
            { organizationId: null },
          ],
          status: "OPEN",
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.performanceProfile.findMany({
        where: {
          OR: [
            { organizationId: context.organizationId },
            { organizationId: null },
          ],
        },
        orderBy: { startedAt: "desc" },
        take: 50,
      }),
      prisma.loadTestRun.findMany({
        where: {
          OR: [
            { organizationId: context.organizationId },
            { organizationId: null },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.backgroundJob.groupBy({
        by: ["queue", "status"],
        where: {
          OR: [
            { organizationId: context.organizationId },
            { organizationId: null },
          ],
          status: { in: ["PENDING", "PROCESSING", "DEAD_LETTER"] },
        },
        _count: { _all: true },
        _min: { availableAt: true },
      }),
      prisma.workerHeartbeat.count({
        where: {
          OR: [
            { organizationId: context.organizationId },
            { organizationId: null },
          ],
          status: "ACTIVE",
          lastSeenAt: { gte: new Date(Date.now() - 90_000) },
        },
      }),
      checkDatabaseHealth(),
      pingRedis(),
    ]);
    return {
      health: {
        database,
        redis: { status: redis ? "healthy" : "degraded" },
        cache: distributedCache.health(),
        activeWorkers,
      },
      metrics: metricsSnapshot(),
      queueGroups,
      objectives,
      hooks,
      exportDestinations,
      scalingPolicies,
      recommendations,
      profiles,
      loadTests,
    };
  }

  async createObjective(
    context: TenantContext,
    input: {
      key: string;
      name: string;
      description?: string;
      indicatorType: "AVAILABILITY" | "LATENCY" | "ERROR_RATE" | "QUEUE_AGE";
      service: string;
      target: number;
      latencyThresholdMs?: number;
      window?: "ROLLING_1H" | "ROLLING_24H" | "ROLLING_7D" | "ROLLING_30D";
      alertThreshold?: number;
    },
  ) {
    await requirePermission(context, "observability.manage");
    return prisma.serviceLevelObjective.upsert({
      where: {
        organizationId_key: {
          organizationId: context.organizationId,
          key: input.key,
        },
      },
      create: { organizationId: context.organizationId, ...input },
      update: input,
    });
  }

  async evaluateObjectives(context?: TenantContext) {
    if (context) await requirePermission(context, "observability.manage");
    const objectives = await prisma.serviceLevelObjective.findMany({
      where: {
        enabled: true,
        ...(context ? { organizationId: context.organizationId } : {}),
      },
    });
    const responses = responseCounters();
    const measurements = [];
    for (const objective of objectives) {
      const endedAt = new Date();
      const startedAt = new Date(
        endedAt.getTime() - windowMs(objective.window),
      );
      let good = responses.good;
      let total = responses.total;
      let observed: number | null = null;
      if (objective.indicatorType === "QUEUE_AGE") {
        const oldest = await prisma.backgroundJob.findFirst({
          where: {
            ...(objective.organizationId
              ? { organizationId: objective.organizationId }
              : {}),
            queue: objective.service,
            status: "PENDING",
          },
          orderBy: { availableAt: "asc" },
          select: { availableAt: true },
        });
        observed = oldest
          ? Math.max(0, Date.now() - oldest.availableAt.getTime())
          : 0;
        total = 1;
        good = observed <= objective.target ? 1 : 0;
      } else if (objective.indicatorType === "ERROR_RATE") {
        observed = total ? responses.errors / total : null;
      } else if (objective.indicatorType === "AVAILABILITY") {
        observed = total ? good / total : null;
      } else {
        const snapshot = metricsSnapshot();
        const histograms = Object.entries(snapshot.histograms).filter(([key]) =>
          key.startsWith("dublancer_operation_duration_ms|"),
        );
        const count = histograms.reduce((sum, [, value]) => sum + value.count, 0);
        const sum = histograms.reduce((value, [, row]) => value + row.sum, 0);
        observed = count ? sum / count : null;
        total = count;
        good =
          observed !== null &&
          observed <= (objective.latencyThresholdMs ?? objective.target)
            ? count
            : 0;
      }
      const isAvailability =
        objective.indicatorType === "AVAILABILITY";
      const healthy =
        observed === null
          ? null
          : isAvailability
            ? observed >= objective.target
            : observed <= objective.target;
      const errorBudget =
        observed === null
          ? null
          : isAvailability
            ? Math.max(
                0,
                (objective.target - observed) /
                  Math.max(0.000001, 1 - objective.target),
              )
            : Math.max(
                0,
                (observed - objective.target) /
                  Math.max(1, objective.target),
              );
      const status =
        healthy === null
          ? "NO_DATA"
          : healthy
            ? errorBudget !== null &&
              errorBudget >= 1 - objective.alertThreshold
              ? "AT_RISK"
              : "HEALTHY"
            : "BREACHED";
      const measurement = await prisma.sloMeasurement.create({
        data: {
          objectiveId: objective.id,
          windowStartedAt: startedAt,
          windowEndedAt: endedAt,
          goodEvents: BigInt(good),
          totalEvents: BigInt(total),
          observedValue: observed,
          errorBudgetUsed: errorBudget,
          status,
        },
      });
      measurements.push(measurement);
      if (status === "BREACHED") {
        await this.queueAlert(
          objective.organizationId,
          "slo.breached",
          {
            objective: {
              id: objective.id,
              key: objective.key,
              name: objective.name,
              target: objective.target,
            },
            measurement: {
              ...measurement,
              goodEvents: measurement.goodEvents.toString(),
              totalEvents: measurement.totalEvents.toString(),
            },
          },
        );
      }
    }
    return measurements;
  }

  async createAlertHook(
    context: TenantContext,
    input: {
      name: string;
      type: "WEBHOOK" | "EMAIL";
      endpoint: string;
      secret?: string;
      eventTypes?: string[];
      maxAttempts?: number;
    },
  ) {
    await requirePermission(context, "observability.manage");
    new URL(input.endpoint);
    return prisma.alertHook.create({
      data: {
        organizationId: context.organizationId,
        name: input.name,
        type: input.type,
        endpoint: input.endpoint,
        secretCipher: input.secret ? encryptSecret(input.secret) : undefined,
        eventTypes: input.eventTypes ?? [],
        maxAttempts: input.maxAttempts ?? 5,
      },
      select: {
        id: true,
        name: true,
        type: true,
        endpoint: true,
        eventTypes: true,
        enabled: true,
        maxAttempts: true,
        createdAt: true,
      },
    });
  }

  async deliverAlerts(limit = 50) {
    const deliveries = await prisma.alertDelivery.findMany({
      where: {
        status: { in: ["PENDING", "RETRY_SCHEDULED"] },
        availableAt: { lte: new Date() },
      },
      include: { hook: true },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      take: Math.min(Math.max(limit, 1), 200),
    });
    const results = [];
    for (const delivery of deliveries) {
      try {
        const status = await signedPost(
          delivery.hook.endpoint,
          delivery.hook.secretCipher,
          delivery.payload,
        );
        results.push(
          await prisma.alertDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "DELIVERED",
              attempts: { increment: 1 },
              responseCode: status,
              deliveredAt: new Date(),
              lastError: null,
            },
          }),
        );
      } catch (error) {
        const attempts = delivery.attempts + 1;
        const exhausted = attempts >= delivery.hook.maxAttempts;
        results.push(
          await prisma.alertDelivery.update({
            where: { id: delivery.id },
            data: {
              status: exhausted ? "FAILED" : "RETRY_SCHEDULED",
              attempts,
              availableAt: new Date(
                Date.now() + Math.min(900, 2 ** attempts) * 1_000,
              ),
              lastError:
                error instanceof Error
                  ? error.message.slice(0, 2_000)
                  : "Unknown alert delivery error",
            },
          }),
        );
      }
    }
    return results;
  }

  async createAuditExportDestination(
    context: TenantContext,
    input: {
      name: string;
      type: "WEBHOOK" | "OBJECT_STORAGE";
      endpoint: string;
      secret?: string;
    },
  ) {
    await requirePermission(context, "observability.manage");
    new URL(input.endpoint);
    return prisma.auditExportDestination.create({
      data: {
        organizationId: context.organizationId,
        name: input.name,
        type: input.type,
        endpoint: input.endpoint,
        secretCipher: input.secret ? encryptSecret(input.secret) : undefined,
      },
      select: {
        id: true,
        name: true,
        type: true,
        endpoint: true,
        enabled: true,
        createdAt: true,
      },
    });
  }

  async runAuditExport(
    context: TenantContext,
    destinationId: string,
  ) {
    await requirePermission(context, "audit.read");
    const destination = await prisma.auditExportDestination.findFirst({
      where: {
        id: destinationId,
        organizationId: context.organizationId,
        enabled: true,
      },
    });
    if (!destination) {
      throw new AppError(
        "NOT_FOUND",
        "Audit export destination not found.",
        404,
      );
    }
    const run = await prisma.auditExportRun.create({
      data: {
        organizationId: context.organizationId,
        destinationId: destination.id,
        requestedById: context.userId,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });
    try {
      const events = await prisma.auditEvent.findMany({
        where: {
          organizationId: context.organizationId,
          ...(destination.cursorCreatedAt
            ? {
                OR: [
                  { createdAt: { gt: destination.cursorCreatedAt } },
                  {
                    createdAt: destination.cursorCreatedAt,
                    id: { gt: destination.cursorId ?? "" },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1_000,
      });
      const payload = {
        schema: "dublancer.audit.v1",
        organizationId: context.organizationId,
        runId: run.id,
        exportedAt: new Date().toISOString(),
        events,
      };
      const raw = JSON.stringify(payload);
      const responseCode = await signedPost(
        destination.endpoint,
        destination.secretCipher,
        payload,
      );
      const last = events.at(-1);
      const checksumSha256 = createHash("sha256").update(raw).digest("hex");
      await prisma.$transaction([
        prisma.auditExportRun.update({
          where: { id: run.id },
          data: {
            status: "SUCCEEDED",
            eventCount: events.length,
            firstEventAt: events[0]?.createdAt,
            lastEventAt: last?.createdAt,
            checksumSha256,
            responseCode,
            completedAt: new Date(),
          },
        }),
        prisma.auditExportDestination.update({
          where: { id: destination.id },
          data: last
            ? { cursorCreatedAt: last.createdAt, cursorId: last.id }
            : {},
        }),
      ]);
      incrementMetric("dublancer_audit_export_events_total", {
        result: "success",
      }, events.length);
      return prisma.auditExportRun.findUniqueOrThrow({
        where: { id: run.id },
      });
    } catch (error) {
      await prisma.auditExportRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          error:
            error instanceof Error ? error.message.slice(0, 2_000) : "Unknown error",
          completedAt: new Date(),
        },
      });
      incrementMetric("dublancer_audit_export_events_total", {
        result: "failed",
      });
      throw error;
    }
  }

  async upsertScalingPolicy(
    context: TenantContext,
    input: {
      queue: string;
      minWorkers: number;
      maxWorkers: number;
      targetJobsPerWorker: number;
      targetOldestJobAgeMs: number;
      scaleDownCooldownMs?: number;
      enabled?: boolean;
    },
  ) {
    await requirePermission(context, "platform.operations.manage");
    if (input.maxWorkers < input.minWorkers) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Maximum workers must be at least minimum workers.",
        422,
      );
    }
    return prisma.workerScalingPolicy.upsert({
      where: {
        organizationId_queue: {
          organizationId: context.organizationId,
          queue: input.queue,
        },
      },
      create: { organizationId: context.organizationId, ...input },
      update: input,
    });
  }

  async evaluateScaling(context?: TenantContext) {
    if (context) {
      await requirePermission(context, "platform.operations.manage");
    }
    const policies = await prisma.workerScalingPolicy.findMany({
      where: {
        enabled: true,
        ...(context ? { organizationId: context.organizationId } : {}),
      },
    });
    const recommendations = [];
    for (const policy of policies) {
      const [pendingJobs, oldest, workers] = await Promise.all([
        prisma.backgroundJob.count({
          where: {
            queue: policy.queue,
            status: "PENDING",
            ...(policy.organizationId
              ? { organizationId: policy.organizationId }
              : {}),
          },
        }),
        prisma.backgroundJob.findFirst({
          where: {
            queue: policy.queue,
            status: "PENDING",
            ...(policy.organizationId
              ? { organizationId: policy.organizationId }
              : {}),
          },
          orderBy: { availableAt: "asc" },
          select: { availableAt: true },
        }),
        prisma.workerHeartbeat.count({
          where: {
            queues: { has: policy.queue },
            status: "ACTIVE",
            lastSeenAt: { gte: new Date(Date.now() - 90_000) },
            ...(policy.organizationId
              ? { organizationId: policy.organizationId }
              : {}),
          },
        }),
      ]);
      const age = oldest
        ? Math.max(0, Date.now() - oldest.availableAt.getTime())
        : 0;
      const byDepth = Math.ceil(
        pendingJobs / Math.max(1, policy.targetJobsPerWorker),
      );
      const byAge =
        age > policy.targetOldestJobAgeMs ? Math.max(workers + 1, byDepth) : byDepth;
      const desiredWorkers = Math.min(
        policy.maxWorkers,
        Math.max(policy.minWorkers, byAge),
      );
      if (desiredWorkers === workers) continue;
      await prisma.workerScalingRecommendation.updateMany({
        where: {
          policyId: policy.id,
          status: "OPEN",
        },
        data: { status: "EXPIRED" },
      });
      recommendations.push(
        await prisma.workerScalingRecommendation.create({
          data: {
            organizationId: policy.organizationId,
            policyId: policy.id,
            queue: policy.queue,
            currentWorkers: workers,
            desiredWorkers,
            pendingJobs,
            oldestJobAgeMs: age,
            reason:
              desiredWorkers > workers
                ? "Queue depth or oldest-job age exceeded the scaling target."
                : "Queue demand is below the configured worker target.",
            expiresAt: new Date(Date.now() + 10 * 60_000),
          },
        }),
      );
    }
    return recommendations;
  }

  async planLoadTest(
    context: TenantContext,
    input: {
      name: string;
      targetUrl: string;
      scenario: string;
      concurrency: number;
      durationSeconds: number;
    },
  ) {
    await requirePermission(context, "platform.operations.manage");
    const target = new URL(input.targetUrl);
    const localTarget = ["127.0.0.1", "localhost", "::1"].includes(
      target.hostname,
    );
    if (!localTarget && process.env.ALLOW_EXTERNAL_LOAD_TESTS !== "1") {
      throw new AppError(
        "FORBIDDEN",
        "External load tests require ALLOW_EXTERNAL_LOAD_TESTS=1.",
        403,
      );
    }
    return prisma.loadTestRun.create({
      data: {
        organizationId: context.organizationId,
        requestedById: context.userId,
        name: input.name,
        targetUrl: target.toString(),
        scenario: input.scenario,
        concurrency: Math.min(Math.max(input.concurrency, 1), 500),
        durationSeconds: Math.min(
          Math.max(input.durationSeconds, 1),
          3_600,
        ),
      },
    });
  }

  async completeLoadTest(input: {
    runId: string;
    status: "PASSED" | "FAILED" | "CANCELLED";
    requests: number;
    failures: number;
    p50LatencyMs?: number;
    p95LatencyMs?: number;
    p99LatencyMs?: number;
    maxLatencyMs?: number;
    report?: unknown;
  }) {
    return prisma.loadTestRun.update({
      where: { id: input.runId },
      data: {
        status: input.status,
        requests: input.requests,
        failures: input.failures,
        p50LatencyMs: input.p50LatencyMs,
        p95LatencyMs: input.p95LatencyMs,
        p99LatencyMs: input.p99LatencyMs,
        maxLatencyMs: input.maxLatencyMs,
        report: input.report === undefined ? undefined : json(input.report),
        completedAt: new Date(),
      },
    });
  }

  async systemHealth() {
    const [database, redis, pendingJobs, deadLetters] = await Promise.all([
      checkDatabaseHealth(),
      pingRedis(),
      prisma.backgroundJob.count({ where: { status: "PENDING" } }),
      prisma.backgroundJob.count({ where: { status: "DEAD_LETTER" } }),
    ]);
    return {
      status:
        database.status === "healthy" && deadLetters === 0
          ? redis
            ? "ready"
            : "degraded"
          : "unhealthy",
      checks: {
        database,
        redis: { status: redis ? "healthy" : "degraded" },
        queue: {
          status: deadLetters ? "degraded" : "healthy",
          pendingJobs,
          deadLetters,
        },
        cache: distributedCache.health(),
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async queueAlert(
    organizationId: string | null,
    eventType: string,
    payload: unknown,
  ) {
    const hooks = await prisma.alertHook.findMany({
      where: {
        enabled: true,
        AND: [
          {
            OR: [
              { organizationId },
              ...(organizationId ? [{ organizationId: null }] : []),
            ],
          },
          {
            OR: [
              { eventTypes: { isEmpty: true } },
              { eventTypes: { has: eventType } },
            ],
          },
        ],
      },
    });
    if (!hooks.length) return [];
    return prisma.alertDelivery.createMany({
      data: hooks.map((hook) => ({
        hookId: hook.id,
        eventType,
        payload: json(payload),
      })),
    });
  }
}

export async function withPerformanceProfile<T>(
  input: {
    operation: string;
    organizationId?: string | null;
    correlationId?: string;
    metadata?: unknown;
  },
  operation: () => Promise<T>,
) {
  const cpu = process.cpuUsage();
  const heap = process.memoryUsage().heapUsed;
  const started = performance.now();
  const profile = await prisma.performanceProfile.create({
    data: {
      organizationId: input.organizationId,
      operation: input.operation,
      correlationId: input.correlationId,
      metadata: input.metadata === undefined ? undefined : json(input.metadata),
    },
  });
  return withSpan(
    input.operation,
    {
      "dublancer.operation": input.operation,
      "dublancer.organization.id": input.organizationId ?? "global",
      "dublancer.profile.id": profile.id,
    },
    async () => {
      try {
        const result = await operation();
        const durationMs = Math.round(performance.now() - started);
        const usage = process.cpuUsage(cpu);
        await prisma.performanceProfile.update({
          where: { id: profile.id },
          data: {
            status: "COMPLETED",
            durationMs,
            cpuUserMicros: BigInt(usage.user),
            cpuSystemMicros: BigInt(usage.system),
            heapDeltaBytes: BigInt(process.memoryUsage().heapUsed - heap),
            completedAt: new Date(),
          },
        });
        observeMetric("dublancer_operation_duration_ms", durationMs, {
          operation: input.operation,
          outcome: "success",
        });
        return result;
      } catch (error) {
        const durationMs = Math.round(performance.now() - started);
        await prisma.performanceProfile.update({
          where: { id: profile.id },
          data: {
            status: "FAILED",
            durationMs,
            error:
              error instanceof Error
                ? error.message.slice(0, 2_000)
                : "Unknown error",
            completedAt: new Date(),
          },
        });
        observeMetric("dublancer_operation_duration_ms", durationMs, {
          operation: input.operation,
          outcome: "failure",
        });
        throw error;
      }
    },
  );
}
