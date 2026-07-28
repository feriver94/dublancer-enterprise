import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { AppError } from "@/lib/errors/app-error";
import { MemberAdministrationService } from "@/lib/services/member-administration.service";
import { memberAdministrationSchema } from "@/lib/validation/phase7";

type RouteContext = { params: Promise<{ organizationId: string }> };
const service = new MemberAdministrationService();

async function contextFor(route: RouteContext) {
  const [context, params] = await Promise.all([getAuthenticatedContext(), route.params]);
  if (context.organizationId !== params.organizationId && !context.isPlatformAdmin) {
    throw new AppError("FORBIDDEN", "Organization access denied.", 403);
  }
  return context;
}

export async function GET(_: NextRequest, route: RouteContext) {
  try {
    return apiSuccess(await service.dashboard(await contextFor(route)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, route: RouteContext) {
  try {
    await requireCsrfToken(request);
    const context = await contextFor(route);
    const input = memberAdministrationSchema.parse(await request.json());
    if (input.action === "department.create") {
      const { action: _, ...data } = input;
      return apiSuccess(await service.createDepartment(context, data), 201);
    }
    if (input.action === "department.update") {
      const { action: _, id, ...data } = input;
      return apiSuccess(await service.updateDepartment(context, id, data));
    }
    if (input.action === "department.delete") {
      return apiSuccess(await service.deleteDepartment(context, input.id));
    }
    if (input.action === "team.create") {
      const { action: _, ...data } = input;
      return apiSuccess(await service.createTeam(context, data), 201);
    }
    if (input.action === "team.update") {
      const { action: _, id, ...data } = input;
      return apiSuccess(await service.updateTeam(context, id, data));
    }
    if (input.action === "team.delete") {
      return apiSuccess(await service.deleteTeam(context, input.id));
    }
    if (input.action === "permissionAudit.run") {
      return apiSuccess(await service.runPermissionAudit(context), 201);
    }
    if (input.action === "accessReview.create") {
      return apiSuccess(
        await service.createAccessReview(context, { title: input.title, dueAt: input.dueAt }),
        201,
      );
    }
    if (input.action === "accessReview.decide") {
      return apiSuccess(await service.decideAccessReviewItem(
        context,
        input.reviewId,
        input.itemId,
        {
          decision: input.decision,
          proposedRoleId: input.proposedRoleId,
          note: input.note,
        },
      ));
    }
    return apiSuccess(await service.completeAccessReview(context, input.reviewId));
  } catch (error) {
    return apiError(error);
  }
}
