import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ProfileManagementService } from "@/lib/services/profile-management.service";
import { contentKindSchema } from "@/lib/validation/profile";

export const dynamic = "force-dynamic";
const service = new ProfileManagementService();
const routeParams = z.object({ kind: contentKindSchema, id: z.string().trim().min(1) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    await requireCsrfToken(request);
    const { kind, id } = routeParams.parse(await params);
    return apiSuccess(await service.updateContent(await getAuthenticatedContext(), kind, id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    await requireCsrfToken(request);
    const { kind, id } = routeParams.parse(await params);
    const version = z.coerce.number().int().positive().parse(request.nextUrl.searchParams.get("version"));
    return apiSuccess(await service.deleteContent(await getAuthenticatedContext(), kind, id, version));
  } catch (error) {
    return apiError(error);
  }
}
