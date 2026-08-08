import { apiError, apiSuccess } from "@/lib/http/api-response";
import { PublicProfileService } from "@/lib/services/public-profile.service";
import { publicOrganizationParamsSchema } from "@/lib/validation/profile";

export const dynamic = "force-dynamic";
const service = new PublicProfileService();

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = publicOrganizationParamsSchema.parse(await params);
    return apiSuccess(await service.organization(slug));
  } catch (error) {
    return apiError(error);
  }
}
