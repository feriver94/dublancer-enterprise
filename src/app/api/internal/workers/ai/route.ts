import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AiRunService } from "@/lib/services/product-platform.service";
import { requireInternalSecret } from "@/lib/security/internal-auth";
const service = new AiRunService();
export async function POST(request: NextRequest) {
  try {
    requireInternalSecret(new Request(request.url,{headers:{authorization:`Bearer ${request.headers.get("x-worker-secret")??""}`}}), "INTERNAL_WORKER_SECRET");
    const workerId = request.headers.get("x-worker-id")?.slice(0, 128) || "api-worker";
    return apiSuccess(await service.processNext(workerId));
  } catch (error) { return apiError(error); }
}
