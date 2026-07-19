import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ContractLifecycleService } from "@/lib/services/commercial-platform.service";
import { milestoneDecisionSchema, milestoneSubmissionSchema } from "@/lib/validation/commercial";

const service = new ContractLifecycleService();
type RouteContext = { params: Promise<{ contractId: string; milestoneId: string }> };

export async function GET(_request: NextRequest, route: RouteContext) {
  try {
    const { contractId, milestoneId } = await route.params;
    return apiSuccess(
      await service.submissions(
        await getAuthenticatedContext(),
        contractId,
        milestoneId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const { contractId, milestoneId } = await route.params;
    return apiSuccess(
      await service.submitMilestone(
        await getAuthenticatedContext(),
        contractId,
        milestoneId,
        milestoneSubmissionSchema.parse(await request.json()),
      ),
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const { contractId, milestoneId } = await route.params;
    return apiSuccess(
      await service.decideSubmission(
        await getAuthenticatedContext(),
        contractId,
        milestoneId,
        milestoneDecisionSchema.parse(await request.json()),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
