import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PhaseCMarketplaceService } from "@/lib/services/phase-c-marketplace.service";
import { invitationDecisionSchema } from "@/lib/validation/phase-c";

const service = new PhaseCMarketplaceService();
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ invitationId: string }> }) {
  try {
    await requireCsrfToken(request);
    const invitationId = z.string().trim().min(1).max(191).parse((await params).invitationId);
    return apiSuccess(await service.respond(await getAuthenticatedContext(), invitationId, invitationDecisionSchema.parse(await request.json())));
  } catch (error) {
    return apiError(error);
  }
}
