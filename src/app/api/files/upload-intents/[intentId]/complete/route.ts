import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseFileProductService } from "@/lib/services/enterprise-file.service";

const service = new EnterpriseFileProductService();
export async function POST(request: NextRequest, route: { params: Promise<{ intentId: string }> }) {
  try { await requireCsrfToken(request); return apiSuccess(await service.completeUpload(await getAuthenticatedContext(), (await route.params).intentId), 201); }
  catch (error) { return apiError(error); }
}
