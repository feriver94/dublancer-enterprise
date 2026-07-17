import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { loginSchema } from "@/lib/validation/auth";
import { AuthService } from "@/lib/services/auth.service";
import { getRequestMetadata } from "@/lib/auth/session";
import { setAuthCookies } from "@/lib/auth/cookies";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { enforceRateLimit } from "@/lib/security/rate-limit";
const service=new AuthService();
export async function POST(r:NextRequest){try{await requireCsrfToken(r);const input=loginSchema.parse(await r.json());const meta=await getRequestMetadata();await enforceRateLimit({scope:"auth.login",identifier:`${meta.ipAddress??"unknown"}:${input.email}`,limit:20,windowMs:900000});const x=await service.login(input,meta);await setAuthCookies(x.accessToken,x.refreshToken);return apiSuccess({user:x.user,sessionId:x.sessionId,organizationId:x.organizationId})}catch(e){return apiError(e)}}
