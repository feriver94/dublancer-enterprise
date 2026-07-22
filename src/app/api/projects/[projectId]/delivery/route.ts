import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { Phase6WorkspaceService } from "@/lib/services/phase6-workspace.service";
import { phase6WorkspaceCreateSchema, phase6WorkspaceTransitionSchema } from "@/lib/validation/phase6";

export const dynamic = "force-dynamic";
const service = new Phase6WorkspaceService();

export async function GET(_request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try { return apiSuccess(await service.summary(await getAuthenticatedContext(), (await params).projectId)); } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try { await requireCsrfToken(request); return apiSuccess(await service.create(await getAuthenticatedContext(), (await params).projectId, phase6WorkspaceCreateSchema.parse(await request.json())), 201); } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try { await requireCsrfToken(request); return apiSuccess(await service.transition(await getAuthenticatedContext(), (await params).projectId, phase6WorkspaceTransitionSchema.parse(await request.json()))); } catch (error) { return apiError(error); }
}
