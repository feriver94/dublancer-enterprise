import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseFileProductService } from "@/lib/services/enterprise-file.service";
import { phase4CreateVersionIntentSchema } from "@/lib/validation/phase4";

const service = new EnterpriseFileProductService();
export async function POST(request: NextRequest, route: { params: Promise<{ fileId: string }> }) {
  try { await requireCsrfToken(request); return apiSuccess(await service.createVersionUploadIntent(await getAuthenticatedContext(), (await route.params).fileId, phase4CreateVersionIntentSchema.parse(await request.json())), 201); }
  catch (error) { return apiError(error); }
}
