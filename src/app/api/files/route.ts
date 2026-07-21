import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseFileProductService } from "@/lib/services/enterprise-file.service";
import { phase4CreateFolderSchema, phase4FileQuerySchema } from "@/lib/validation/phase4";

export const dynamic = "force-dynamic";
const service = new EnterpriseFileProductService();
export async function GET(request: NextRequest) {
  try { const context = await getAuthenticatedContext(); await requirePermission(context, "files.read"); const raw = Object.fromEntries(request.nextUrl.searchParams); const query = phase4FileQuerySchema.parse({ ...raw, parentId: raw.parentId === "root" ? null : raw.parentId }); const result = await service.list(context, query); return apiSuccess(result.items, 200, { nextCursor: result.nextCursor, breadcrumbs: result.breadcrumbs }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await requirePermission(context, "files.manage"); return apiSuccess(await service.createFolder(context, phase4CreateFolderSchema.parse(await request.json())), 201); }
  catch (error) { return apiError(error); }
}
