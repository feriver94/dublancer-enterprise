import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { PlatformReliabilityService } from "@/lib/services/platform-reliability.service";
import { reliabilityActionSchema } from "@/lib/validation/phase8";

const service = new PlatformReliabilityService();

export async function GET() {
  try {
    return apiSuccess(
      await service.dashboard(await getAuthenticatedContext()),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = reliabilityActionSchema.parse(await request.json());
    if (input.action === "slo.upsert") {
      const { action: _, ...data } = input;
      return apiSuccess(await service.createObjective(context, data), 201);
    }
    if (input.action === "slo.evaluate") {
      return apiSuccess(await service.evaluateObjectives(context), 201);
    }
    if (input.action === "alertHook.create") {
      const { action: _, ...data } = input;
      return apiSuccess(await service.createAlertHook(context, data), 201);
    }
    if (input.action === "auditDestination.create") {
      const { action: _, ...data } = input;
      return apiSuccess(
        await service.createAuditExportDestination(context, data),
        201,
      );
    }
    if (input.action === "auditExport.run") {
      return apiSuccess(
        await service.runAuditExport(context, input.destinationId),
        202,
      );
    }
    if (input.action === "scalingPolicy.upsert") {
      const { action: _, ...data } = input;
      return apiSuccess(await service.upsertScalingPolicy(context, data), 201);
    }
    if (input.action === "scaling.evaluate") {
      return apiSuccess(await service.evaluateScaling(context), 201);
    }
    const { action: _, ...data } = input;
    return apiSuccess(await service.planLoadTest(context, data), 201);
  } catch (error) {
    return apiError(error);
  }
}
