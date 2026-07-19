import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ContractLifecycleService } from "@/lib/services/commercial-platform.service";
import { contractTransitionSchema } from "@/lib/validation/commercial";

const service = new ContractLifecycleService();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    return apiSuccess(
      await service.get(
        await getAuthenticatedContext(),
        (await params).contractId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    await requireCsrfToken(request);
    const input = contractTransitionSchema.parse(await request.json());
    return apiSuccess(
      await service.transition(
        await getAuthenticatedContext(),
        (await params).contractId,
        input.status,
        input.expectedVersion,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
