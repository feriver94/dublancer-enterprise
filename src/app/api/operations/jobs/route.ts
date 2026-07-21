import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseOperationsService } from "@/lib/services/enterprise-operations.service";
import { jobListSchema } from "@/lib/validation/phase5";

const service = new EnterpriseOperationsService();
export async function GET(request: NextRequest) { try { return apiSuccess(await service.jobs(await getAuthenticatedContext(), jobListSchema.parse(Object.fromEntries(request.nextUrl.searchParams)))); } catch (error) { return apiError(error); } }
