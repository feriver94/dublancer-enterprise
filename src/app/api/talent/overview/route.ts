import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { TalentResourceManagementService } from "@/lib/services/talent-resource-management.service";
import { talentActionSchema } from "@/lib/validation/phase9";

const service = new TalentResourceManagementService();

export async function GET() {
  try {
    return apiSuccess(await service.dashboard(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = talentActionSchema.parse(await request.json());
    switch (input.action) {
      case "profile.upsert": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.upsertProfile(context, data), 201);
      }
      case "skill.upsert": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.upsertSkill(context, data), 201);
      }
      case "certification.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createCertification(context, data), 201);
      }
      case "availability.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createAvailability(context, data), 201);
      }
      case "plan.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createPlan(context, data), 201);
      }
      case "requirement.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createRequirement(context, data), 201);
      }
      case "staffing.assign": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.assignStaffing(context, data), 201);
      }
      case "capacity.capture": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.captureCapacity(context, data), 201);
      }
      case "bench.enter": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.enterBench(context, data), 201);
      }
      case "bench.exit": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.exitBench(context, data));
      }
      case "performance.record": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.recordPerformance(context, data), 201);
      }
    }
  } catch (error) {
    return apiError(error);
  }
}
