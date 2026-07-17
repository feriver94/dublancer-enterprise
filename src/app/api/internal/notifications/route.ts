import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { createNotification } from "@/lib/notifications/notification.service";
import { createNotificationSchema } from "@/lib/validation/notifications";

function validSecret(candidate: string | null) {
  const expected = process.env.INTERNAL_NOTIFICATION_SECRET;
  if (!candidate || !expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  try {
    if (!validSecret(request.headers.get("x-internal-notification-secret"))) {
      return Response.json({ error: { code: "UNAUTHORIZED", message: "Invalid internal credential." } }, { status: 401 });
    }
    const input = createNotificationSchema.parse(await request.json());
    return apiSuccess(await createNotification(input), 201);
  } catch (error) {
    return apiError(error);
  }
}
