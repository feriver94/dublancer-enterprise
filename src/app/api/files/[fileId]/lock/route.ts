import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseFileProductService } from "@/lib/services/enterprise-file.service";
import { phase4LockFileSchema, phase4UnlockFileSchema } from "@/lib/validation/phase4";

const service = new EnterpriseFileProductService();
type Route = { params: Promise<{ fileId: string }> };
export async function POST(request: NextRequest, route: Route) {
  try { await requireCsrfToken(request); const input = phase4LockFileSchema.parse(await request.json()); return apiSuccess(await service.lock(await getAuthenticatedContext(), (await route.params).fileId, input.expiresInMinutes), 201); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: NextRequest, route: Route) {
  try { await requireCsrfToken(request); const input = phase4UnlockFileSchema.parse(await request.json()); return apiSuccess(await service.unlock(await getAuthenticatedContext(), (await route.params).fileId, input.lockToken)); }
  catch (error) { return apiError(error); }
}
