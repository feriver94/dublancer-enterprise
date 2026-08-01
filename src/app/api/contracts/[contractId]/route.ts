import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ContractLifecycleService } from "@/lib/services/commercial-platform.service";
import { contractTransitionSchema } from "@/lib/validation/commercial";
import { ContractService } from "@/lib/services/product-platform.service";
import { deleteContractSchema, updateContractSchema } from "@/lib/validation/product";

const service = new ContractLifecycleService();
const contracts = new ContractService();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    return apiSuccess(
      await service.get(
        await getAuthenticatedContext(),
        (await params).contractId,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    await requireCsrfToken(request);
    const body = await request.json();
    const context = await getAuthenticatedContext();
    const contractId = (await params).contractId;
    if (body && typeof body === "object" && "status" in body) {
      const input = contractTransitionSchema.parse(body);
      return apiSuccess(await service.transition(context, contractId, input.status, input.expectedVersion));
    }
    return apiSuccess(await contracts.update(context, contractId, updateContractSchema.parse(body)));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    await requireCsrfToken(request);
    const input = deleteContractSchema.parse(await request.json());
    return apiSuccess(await contracts.delete(await getAuthenticatedContext(), (await params).contractId, input.expectedVersion));
  } catch (error) {
    return apiError(error);
  }
}
