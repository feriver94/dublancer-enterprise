import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ProfileMediaService } from "@/lib/services/profile-media.service";
import { z } from "zod";

const service = new ProfileMediaService();
const schema = z.object({ target: z.enum(["client", "freelancer", "organization"]), asset: z.enum(["avatar", "logo", "banner"]) }).strict();
export async function DELETE(request: NextRequest) {
  try { await requireCsrfToken(request); const input = schema.parse(await request.json()); return apiSuccess(await service.remove(await getAuthenticatedContext(), input.target, input.asset)); }
  catch (error) { return apiError(error); }
}
