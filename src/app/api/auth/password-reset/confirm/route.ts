import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { resetPasswordSchema } from "@/lib/validation/account-security";
import { AccountSecurityService } from "@/lib/services/account-security.service";
import { requireCsrfToken } from "@/lib/auth/csrf";
const s=new AccountSecurityService();
export async function POST(r:NextRequest){try{await requireCsrfToken(r);const x=resetPasswordSchema.parse(await r.json());return apiSuccess(await s.resetPassword(x.token,x.password))}catch(e){return apiError(e)}}
