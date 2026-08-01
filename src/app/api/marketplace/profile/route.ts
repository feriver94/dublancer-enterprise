import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { MarketplaceService } from "@/lib/services/product-platform.service";
import { marketplaceProfileSchema } from "@/lib/validation/product";
import { PersonaService } from "@/lib/services/persona.service";
import { setAccessCookie } from "@/lib/auth/cookies";
import { prisma } from "@/lib/database/prisma";

export const dynamic = "force-dynamic";
const service = new MarketplaceService();
const personas = new PersonaService();

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    await requirePermission(context, "marketplace.profile.manage");
    return apiSuccess(await service.profile(context));
  } catch (error) { return apiError(error); }
}

export async function PUT(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    await requirePermission(context, "marketplace.profile.manage");
    const profile = await service.upsertProfile(context, marketplaceProfileSchema.parse(await request.json()));
    const persona = await prisma.accountPersona.findFirstOrThrow({
      where: { userId: context.userId, type: "FREELANCER" },
    });
    await personas.activate(context, persona.id);
    const switched = await personas.switchPersona(context, persona.id);
    await setAccessCookie(switched.accessToken);
    return apiSuccess(profile);
  } catch (error) { return apiError(error); }
}
