import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { AccountSecurityService } from "@/lib/services/account-security.service";
import { emailChangeSchema } from "@/lib/validation/account-security";

const service = new AccountSecurityService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const { email } = emailChangeSchema.parse(await request.json());
    return apiSuccess(await service.requestEmailChange(context.userId, email), 202);
  } catch (error) {
    return apiError(error);
  }
}
