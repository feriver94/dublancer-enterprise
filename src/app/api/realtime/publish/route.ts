import { apiError, apiSuccess } from "@/lib/http/api-response";
import { publishPendingRealtimeEvents } from "@/lib/realtime/publisher";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const secret = request.headers.get(
      "x-internal-publisher-secret",
    );

    if (
      !process.env.INTERNAL_PUBLISHER_SECRET ||
      secret !== process.env.INTERNAL_PUBLISHER_SECRET
    ) {
      return new Response("Unauthorized", {
        status: 401,
      });
    }

    return apiSuccess(
      await publishPendingRealtimeEvents(),
    );
  } catch (error) {
    return apiError(error);
  }
}
