import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ProfileMediaService } from "@/lib/services/profile-media.service";
import { z } from "zod";

const service = new ProfileMediaService();
const schema = z.object({ target: z.enum(["client", "freelancer", "organization"]), asset: z.enum(["avatar", "logo", "banner"]), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), sizeBytes: z.number().int().positive().max(5 * 1024 * 1024), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();
export async function POST(request: NextRequest) {
  try { await requireCsrfToken(request); return apiSuccess(service.createIntent(await getAuthenticatedContext(), schema.parse(await request.json())), 201); }
  catch (error) { return apiError(error); }
}
