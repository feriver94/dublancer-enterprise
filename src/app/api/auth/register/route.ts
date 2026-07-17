import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { registerSchema } from "@/lib/validation/auth";
import { AuthService } from "@/lib/services/auth.service";
import { getRequestMetadata } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { AccountSecurityService } from "@/lib/services/account-security.service";
const service=new AuthService();
const security = new AccountSecurityService();
export async function POST(r:NextRequest){try{await requireCsrfToken(r);const input=registerSchema.parse(await r.json());const meta=await getRequestMetadata();await enforceRateLimit({scope:"auth.register",identifier:`${meta.ipAddress??"unknown"}:${input.email}`,limit:10,windowMs:3600000});const user=await service.register(input,meta);await security.requestEmailVerification(user.email);return apiSuccess(user,201)}catch(e){return apiError(e)}}
