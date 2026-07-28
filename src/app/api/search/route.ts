import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { SearchIndexService } from "@/lib/services/search-index.service";
import { phase4SearchSchema } from "@/lib/validation/phase4";
import { withRequestSpan } from "@/lib/observability/telemetry";

export const dynamic = "force-dynamic";
const service = new SearchIndexService();
export async function GET(request: NextRequest) {
  try {
    return await withRequestSpan(
      "search.query",
      request,
      { "http.route": "/api/search" },
      async () => {
        const result = await service.search(
          await getAuthenticatedContext(),
          phase4SearchSchema.parse(
            Object.fromEntries(request.nextUrl.searchParams),
          ),
        );
        return apiSuccess(result.items, 200, {
          nextCursor: result.nextCursor,
        });
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
