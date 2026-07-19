import { prisma } from "@/lib/database/prisma";
import { pingRedis } from "@/lib/realtime/redis";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import type { TenantContext } from "@/lib/tenancy/context";

async function databaseReady() { try { await prisma.$queryRaw`SELECT 1`; return true; } catch { return false; } }
async function redisReady() { return pingRedis(); }
const configured = (...keys: string[]) => keys.every((key) => Boolean(process.env[key]));

export async function platformReadiness() {
  const [database, realtime] = await Promise.all([databaseReady(), redisReady()]);
  return { status: database && realtime ? "ready" : "degraded", database, realtime, timestamp: new Date().toISOString() };
}

export class PlatformOperationsService {
  async summary(context: TenantContext) {
    await requirePermission(context, "platform.operations.read");
    const [readiness, pendingJobs, pendingEvents, failedNotifications, pendingAi, workflowRuns] = await Promise.all([
      platformReadiness(),
      prisma.backgroundJob.count({ where: { organizationId: context.organizationId, status: { in: ["PENDING", "PROCESSING"] } } }),
      prisma.realtimeEvent.count({ where: { organizationId: context.organizationId, status: "PENDING" } }),
      prisma.notificationDelivery.count({ where: { notification: { organizationId: context.organizationId }, status: "FAILED" } }),
      prisma.aiRun.count({ where: { organizationId: context.organizationId, status: { in: ["QUEUED", "RUNNING", "PENDING_APPROVAL"] } } }),
      prisma.workflowRun.count({ where: { organizationId: context.organizationId, status: { in: ["QUEUED", "RUNNING", "WAITING_APPROVAL"] } } }),
    ]);
    return { readiness, queues: { pendingJobs, pendingEvents, failedNotifications, pendingAi, workflowRuns }, providers: {
      storage: configured("STORAGE_SIGNING_ENDPOINT", "STORAGE_SIGNING_TOKEN"), ai: configured("AI_PROVIDER_BASE_URL", "AI_PROVIDER_API_KEY"), payments: configured("PAYMENT_PROVIDER_BASE_URL", "PAYMENT_PROVIDER_API_KEY", "PAYMENT_WEBHOOK_SECRET"), notifications: configured("NOTIFICATION_PROVIDER_BASE_URL", "NOTIFICATION_PROVIDER_API_KEY"), fileScanning: configured("FILE_SCAN_WEBHOOK_SECRET"),
    } };
  }
}
