import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PublicProfileService } from "@/lib/services/public-profile.service";
import { publicProfileParamsSchema } from "@/lib/validation/profile";

export const dynamic = "force-dynamic";
const service = new PublicProfileService();

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username } = publicProfileParamsSchema.parse(await params);
    return apiSuccess(await service.freelancer(username));
  } catch (error) {
    return apiError(error);
  }
}
