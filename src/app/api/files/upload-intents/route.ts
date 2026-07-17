import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseFileService } from "@/lib/services/product-platform.service";
import { createUploadIntentSchema } from "@/lib/validation/product";

const service = new EnterpriseFileService();
export async function POST(request: NextRequest) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await requirePermission(context, "files.manage"); return apiSuccess(await service.createUploadIntent(context, createUploadIntentSchema.parse(await request.json())), 201); }
  catch (error) { return apiError(error); }
}
