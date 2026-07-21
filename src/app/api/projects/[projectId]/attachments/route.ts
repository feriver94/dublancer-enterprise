import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { createAttachmentSchema } from "@/lib/validation/project-workspace";
import { EnterpriseFileProductService } from "@/lib/services/enterprise-file.service";

const service = new EnterpriseFileProductService();
type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, route: Context) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { projectId } = await route.params;
    const input = createAttachmentSchema.parse(await request.json());
    return apiSuccess(await service.bindProjectAttachment(context, projectId, input), 201);
  } catch (error) {
    return apiError(error);
  }
}
