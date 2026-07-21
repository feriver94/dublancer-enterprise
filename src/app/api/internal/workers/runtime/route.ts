import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireInternalSecret } from "@/lib/security/internal-auth";
import { AppError } from "@/lib/errors/app-error";
import { claimJob, completeJob, enqueueDueSchedules, failJob, getActiveClaim, heartbeatJob, registerWorker } from "@/lib/jobs/worker-runtime.service";
import { EnterpriseOperationsService } from "@/lib/services/enterprise-operations.service";
import { workerRuntimeSchema } from "@/lib/validation/phase5";

const service = new EnterpriseOperationsService();
export async function POST(request: NextRequest) {
  try {
    requireInternalSecret(request, "INTERNAL_WORKER_SECRET");
    const input = workerRuntimeSchema.parse(await request.json());
    if (input.action === "SCHEDULE") return apiSuccess(await enqueueDueSchedules(), 202);
    if (input.action === "CLAIM") return apiSuccess(await claimJob({ workerId: input.workerId, types: input.types, queues: input.queues, version: input.version, hostname: input.hostname }), 202);
    if (input.action === "HEARTBEAT") {
      if (!input.jobId || !input.leaseToken) return apiSuccess(await registerWorker({ workerId: input.workerId, queues: input.queues, version: input.version, hostname: input.hostname }), 202);
      return apiSuccess(await heartbeatJob({ jobId: input.jobId, workerId: input.workerId, leaseToken: input.leaseToken }), 202);
    }
    if (input.action === "COMPLETE" || input.action === "FAIL") {
      if (!input.jobId || !input.leaseToken) throw new AppError("BAD_REQUEST", "jobId and leaseToken are required for lease completion.", 400);
      const claim = await getActiveClaim({ jobId: input.jobId, workerId: input.workerId, leaseToken: input.leaseToken });
      if (input.action === "COMPLETE") return apiSuccess(await completeJob(claim, input.diagnostics), 202);
      const workerError = Object.assign(new Error(input.errorMessage ?? "The worker reported a failure."), { code: input.errorCode ?? "WORKER_ERROR" });
      return apiSuccess(await failJob(claim, workerError, input.diagnostics), 202);
    }
    return apiSuccess(await service.processNext(input.workerId), 202);
  } catch (error) { return apiError(error); }
}
