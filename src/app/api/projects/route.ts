import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import {
  createProjectSchema,
  projectListQuerySchema,
} from "@/lib/validation/project";
import { ProjectService } from "@/lib/services/project.service";

export const dynamic = "force-dynamic";

const service = new ProjectService();

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    const query = projectListQuerySchema.parse({
      cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
      take: request.nextUrl.searchParams.get("take") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
    });

    const result = await service.list(context, query);

    return apiSuccess(result.items, 200, {
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const payload = createProjectSchema.parse(await request.json());
    const project = await service.create(context, payload);

    return apiSuccess(project, 201);
  } catch (error) {
    return apiError(error);
  }
}
