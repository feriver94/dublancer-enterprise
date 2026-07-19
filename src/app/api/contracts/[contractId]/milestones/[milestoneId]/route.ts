import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AppError } from "@/lib/errors/app-error";
import { ContractLifecycleService } from "@/lib/services/commercial-platform.service";

const service = new ContractLifecycleService();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contractId: string; milestoneId: string }> },
) {
  try {
    const { contractId, milestoneId } = await params;
    const contract = await service.get(await getAuthenticatedContext(), contractId);
    const milestone = contract.milestones.find((item) => item.id === milestoneId);
    if (!milestone) throw new AppError("NOT_FOUND", "Contract milestone not found.", 404);
    return apiSuccess({ ...milestone, contract: { id: contract.id, status: contract.status, viewerParty: contract.viewerParty } });
  } catch (error) {
    return apiError(error);
  }
}
