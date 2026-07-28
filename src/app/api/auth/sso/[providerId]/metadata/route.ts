import { apiError } from "@/lib/http/api-response";
import { FederatedIdentityService } from "@/lib/services/federated-identity.service";

type RouteContext = { params: Promise<{ providerId: string }> };
const service = new FederatedIdentityService();

export async function GET(_: Request, route: RouteContext) {
  try {
    const { providerId } = await route.params;
    return new Response(await service.metadata(providerId), {
      headers: {
        "content-type": "application/samlmetadata+xml; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
