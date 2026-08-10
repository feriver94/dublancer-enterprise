import { apiError } from "@/lib/http/api-response";
import { ProfileMediaService } from "@/lib/services/profile-media.service";

const service = new ProfileMediaService();
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const media = await service.read((await params).token);
    return new Response(media.body, { headers: { "content-type": media.mimeType, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox" } });
  } catch (error) { return apiError(error); }
}
