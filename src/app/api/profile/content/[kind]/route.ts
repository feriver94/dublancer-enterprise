import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ProfileManagementService } from "@/lib/services/profile-management.service";
import { contentKindSchema } from "@/lib/validation/profile";

export const dynamic = "force-dynamic";
const service = new ProfileManagementService();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const kind = contentKindSchema.parse((await params).kind);
    return apiSuccess(await service.listContent(await getAuthenticatedContext(), kind));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    await requireCsrfToken(request);
    const kind = contentKindSchema.parse((await params).kind);
    return apiSuccess(await service.createContent(await getAuthenticatedContext(), kind, await request.json()), 201);
  } catch (error) {
    return apiError(error);
  }
}
