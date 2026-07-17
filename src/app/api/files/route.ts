import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseFileService } from "@/lib/services/product-platform.service";
import { createFolderSchema, fileQuerySchema } from "@/lib/validation/product";

export const dynamic = "force-dynamic";
const service = new EnterpriseFileService();
export async function GET(request: NextRequest) {
  try { const context = await getAuthenticatedContext(); await requirePermission(context, "files.read"); const raw = Object.fromEntries(request.nextUrl.searchParams); const query = fileQuerySchema.parse({ ...raw, parentId: raw.parentId === "root" ? null : raw.parentId }); const result = await service.list(context, query); return apiSuccess(result.items, 200, { nextCursor: result.nextCursor }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await requirePermission(context, "files.manage"); return apiSuccess(await service.createFolder(context, createFolderSchema.parse(await request.json())), 201); }
  catch (error) { return apiError(error); }
}
