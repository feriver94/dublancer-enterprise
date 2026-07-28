import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireInternalHeader } from "@/lib/security/internal-auth";
import { EmailOperationsService } from "@/lib/services/email-operations.service";
import { emailProviderEventSchema } from "@/lib/validation/phase7";

const service = new EmailOperationsService();

function authenticate(request: NextRequest) {
  requireInternalHeader(request, "x-internal-email-secret", "INTERNAL_EMAIL_SECRET");
}

export async function POST(request: NextRequest) {
  try {
    authenticate(request);
    const body = (await request.json().catch(() => ({}))) as {
      batchSize?: number;
      organizationId?: string;
    };
    return apiSuccess(await service.process(body.batchSize, body.organizationId));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    authenticate(request);
    const input = emailProviderEventSchema.parse(await request.json());
    return apiSuccess(await service.recordProviderEvent(input));
  } catch (error) {
    return apiError(error);
  }
}
