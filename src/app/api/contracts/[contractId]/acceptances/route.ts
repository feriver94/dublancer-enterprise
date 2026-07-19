import type { NextRequest } from "next/server";
import { getAuthenticatedContext, getRequestMetadata } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ContractLifecycleService } from "@/lib/services/commercial-platform.service";
import { contractAcceptanceSchema } from "@/lib/validation/commercial";

const service = new ContractLifecycleService();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    await requireCsrfToken(request);
    const [context, metadata, input] = await Promise.all([
      getAuthenticatedContext(),
      getRequestMetadata(),
      request.json().then((body) => contractAcceptanceSchema.parse(body)),
    ]);
    return apiSuccess(
      await service.accept(context, (await params).contractId, input, metadata),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
