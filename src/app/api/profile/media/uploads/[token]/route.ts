import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PROFILE_MEDIA_MAX_BYTES } from "@/lib/profile/profile-media";
import { AppError } from "@/lib/errors/app-error";
import { ProfileMediaService } from "@/lib/services/profile-media.service";

const service = new ProfileMediaService();
export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    await requireCsrfToken(request);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > PROFILE_MEDIA_MAX_BYTES) throw new AppError("VALIDATION_ERROR", "Profile images must be 5 MB or smaller.", 422);
    const body = Buffer.from(await request.arrayBuffer());
    return apiSuccess(await service.upload(await getAuthenticatedContext(), (await params).token, body));
  } catch (error) { return apiError(error); }
}
