import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { KnowledgeManagementService } from "@/lib/services/knowledge-management.service";
import { knowledgeRetrievalSchema } from "@/lib/validation/phase9";
import { withRequestSpan } from "@/lib/observability/telemetry";

const service = new KnowledgeManagementService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = knowledgeRetrievalSchema.parse(await request.json());
    return apiSuccess(
      await withRequestSpan(
        "phase9.knowledge.retrieve",
        request,
        { "dublancer.organization.id": context.organizationId },
        () => service.retrieve(context, input),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
