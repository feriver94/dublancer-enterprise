import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireInternalSecret } from "@/lib/security/internal-auth";
import { SearchIndexService } from "@/lib/services/search-index.service";
import { phase4WorkerSchema } from "@/lib/validation/phase4";

const service = new SearchIndexService();
export async function POST(request: NextRequest) {
  try {
    requireInternalSecret(request, "INTERNAL_WORKER_SECRET");
    const input = phase4WorkerSchema.parse(await request.json());
    if (input.action === "SCHEDULE") return apiSuccess(await service.scheduleIncremental(input.organizationId), 202);
    return apiSuccess(await service.processNext(input.workerId), 202);
  } catch (error) { return apiError(error); }
}
