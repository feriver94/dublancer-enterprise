import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { tokenSchema } from "@/lib/validation/account-security";
import { AccountSecurityService } from "@/lib/services/account-security.service";
import { requireCsrfToken } from "@/lib/auth/csrf";
const s=new AccountSecurityService();
export async function POST(r:NextRequest){try{await requireCsrfToken(r);const {token}=tokenSchema.parse(await r.json());return apiSuccess(await s.verifyEmail(token))}catch(e){return apiError(e)}}
