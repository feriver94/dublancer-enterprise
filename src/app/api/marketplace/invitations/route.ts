import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PhaseCMarketplaceService } from "@/lib/services/phase-c-marketplace.service";
import { invitationQuerySchema, profileActionSchema } from "@/lib/validation/phase-c";

export const dynamic = "force-dynamic";
const service = new PhaseCMarketplaceService();

export async function GET(request: NextRequest) {
  try {
    return apiSuccess(await service.invitations(await getAuthenticatedContext(), invitationQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const input = profileActionSchema.parse({ action: "INVITE", ...(await request.json()) });
    if (input.action !== "INVITE") throw new Error("Invalid invitation action.");
    return apiSuccess(await service.invite(await getAuthenticatedContext(), input), 201);
  } catch (error) {
    return apiError(error);
  }
}
