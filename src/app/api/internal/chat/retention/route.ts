import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ChatRetentionService } from "@/lib/services/chat-retention.service";
import { chatMaintenanceSchema } from "@/lib/validation/chat";
import { requireInternalHeader } from "@/lib/security/internal-auth";

export const runtime = "nodejs";
const service = new ChatRetentionService();

export async function POST(request: NextRequest) {
  try {
    requireInternalHeader(
      request,
      "x-internal-chat-secret",
      "INTERNAL_CHAT_MAINTENANCE_SECRET",
    );
    const input = chatMaintenanceSchema.parse(await request.json());
    return apiSuccess(await service.purgeExpired(input.batchSize));
  } catch (error) {
    return apiError(error);
  }
}
