import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { FinanceService } from "@/lib/services/product-platform.service";
const service = new FinanceService();
export async function POST(request: NextRequest, { params }: { params: Promise<{ providerKey: string }> }) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-provider-signature") ?? "";
    const eventId = request.headers.get("x-provider-event-id") ?? "";
    if (!eventId || eventId.length > 255) throw new AppError("BAD_REQUEST", "Missing or invalid provider event id.", 400);
    return apiSuccess(await service.acceptWebhook((await params).providerKey, eventId, rawBody, signature), 202);
  } catch (error) { return apiError(error); }
}
