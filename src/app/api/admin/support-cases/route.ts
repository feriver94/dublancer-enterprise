import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOperationsService } from "@/lib/services/enterprise-operations.service";
import { supportCaseSchema } from "@/lib/validation/product";

const service = new EnterpriseOperationsService();
export async function GET() { try { return apiSuccess(await service.supportCases(await getAuthenticatedContext())); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); return apiSuccess(await service.createSupportCase(await getAuthenticatedContext(), supportCaseSchema.parse(await request.json())), 201); } catch (error) { return apiError(error); } }
