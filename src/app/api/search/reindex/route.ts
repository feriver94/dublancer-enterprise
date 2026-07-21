import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { SearchIndexService } from "@/lib/services/search-index.service";
import { phase4ReindexSchema } from "@/lib/validation/phase4";

const service = new SearchIndexService();
export async function GET() {
  try { return apiSuccess(await service.status(await getAuthenticatedContext())); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { await requireCsrfToken(request); return apiSuccess(await service.enqueueReindex(await getAuthenticatedContext(), phase4ReindexSchema.parse(await request.json()).idempotencyKey), 202); }
  catch (error) { return apiError(error); }
}
