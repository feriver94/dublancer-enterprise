import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOperationsService } from "@/lib/services/enterprise-operations.service";
import { exportRequestSchema } from "@/lib/validation/product";
import { exportListSchema } from "@/lib/validation/phase5";

const service = new EnterpriseOperationsService();
export async function GET(request: NextRequest) { try { return apiSuccess(await service.exports(await getAuthenticatedContext(), exportListSchema.parse(Object.fromEntries(request.nextUrl.searchParams)))); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); return apiSuccess(await service.requestExport(await getAuthenticatedContext(), exportRequestSchema.parse(await request.json())), 202); } catch (error) { return apiError(error); } }
