import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PhaseCMarketplaceService } from "@/lib/services/phase-c-marketplace.service";
import { profileActionSchema, profileTargetSchema } from "@/lib/validation/phase-c";

export const dynamic = "force-dynamic";
const service = new PhaseCMarketplaceService();

export async function GET(request: NextRequest) {
  try {
    const target = profileTargetSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return apiSuccess(await service.actionState(await getAuthenticatedContext(), target));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = profileActionSchema.parse(await request.json());
    if (input.action === "SAVE") return apiSuccess(await service.save(context, input));
    if (input.action === "FOLLOW") return apiSuccess(await service.follow(context, input.target, input.active));
    return apiSuccess(await service.invite(context, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
