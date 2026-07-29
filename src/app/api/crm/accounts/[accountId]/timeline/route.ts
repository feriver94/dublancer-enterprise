import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseCrmService } from "@/lib/services/enterprise-crm.service";

const service = new EnterpriseCrmService();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  try {
    return apiSuccess(
      await service.customerTimeline(
        await getAuthenticatedContext(),
        (await params).accountId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
