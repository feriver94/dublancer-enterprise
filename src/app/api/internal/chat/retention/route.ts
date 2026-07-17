import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { ChatRetentionService } from "@/lib/services/chat-retention.service";
import { chatMaintenanceSchema } from "@/lib/validation/chat";

export const runtime = "nodejs";
const service = new ChatRetentionService();

function validSecret(candidate: string | null) {
  const expected = process.env.INTERNAL_CHAT_MAINTENANCE_SECRET;
  if (!candidate || !expected) return false;
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return (
    candidateBytes.length === expectedBytes.length &&
    timingSafeEqual(candidateBytes, expectedBytes)
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!validSecret(request.headers.get("x-internal-chat-secret"))) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid internal credential." } },
        { status: 401 },
      );
    }
    const input = chatMaintenanceSchema.parse(await request.json());
    return apiSuccess(await service.purgeExpired(input.batchSize));
  } catch (error) {
    return apiError(error);
  }
}
