import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ProfileManagementService } from "@/lib/services/profile-management.service";

export const dynamic = "force-dynamic";
const service = new ProfileManagementService();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrfToken(request);
    const id = z.string().trim().min(1).parse((await params).id);
    return apiSuccess(await service.toggleFollow(await getAuthenticatedContext(), id));
  } catch (error) {
    return apiError(error);
  }
}
