import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { OrganizationDomainService } from "@/lib/services/organization-domain.service";
import { activityQuerySchema } from "@/lib/validation/organization";
const service = new OrganizationDomainService();
export async function GET(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const context = await getAuthenticatedContext();
    const { organizationId } = await params;
    const query = activityQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const result = await service.activity(context, organizationId, query);
    return apiSuccess(result.items, 200, { nextCursor: result.nextCursor });
  } catch (error) { return apiError(error); }
}
