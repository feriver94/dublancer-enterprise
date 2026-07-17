import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { emailSchema } from "@/lib/validation/account-security";
import { AccountSecurityService } from "@/lib/services/account-security.service";
const s=new AccountSecurityService();
export async function POST(r:NextRequest){try{await requireCsrfToken(r);const {email}=emailSchema.parse(await r.json());return apiSuccess(await s.requestPasswordReset(email),202)}catch(e){return apiError(e)}}
