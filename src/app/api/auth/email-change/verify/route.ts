import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { AccountSecurityService } from "@/lib/services/account-security.service";
import { tokenSchema } from "@/lib/validation/account-security";

const service = new AccountSecurityService();

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const { token } = tokenSchema.parse(await request.json());
    return apiSuccess(await service.verifyEmailChange(token));
  } catch (error) {
    return apiError(error);
  }
}
