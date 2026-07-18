import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AUTH_CONFIG } from "@/lib/auth/config";
import { refreshSchema } from "@/lib/validation/auth";
import { AuthService } from "@/lib/services/auth.service";
import { setAuthCookies } from "@/lib/auth/cookies";
import { AppError } from "@/lib/errors/app-error";
import { requireCsrfToken, requireSameOrigin } from "@/lib/auth/csrf";
const service=new AuthService();
export async function POST(r:NextRequest){try{requireSameOrigin(r);await requireCsrfToken(r);const raw=(await cookies()).get(AUTH_CONFIG.refreshCookieName)?.value;if(!raw)throw new AppError("UNAUTHORIZED","Refresh token missing.",401);const body=await r.json().catch(()=>({}));const x=await service.refresh(raw,refreshSchema.parse(body).organizationId);await setAuthCookies(x.accessToken,x.refreshToken);return apiSuccess({sessionId:x.sessionId,organizationId:x.organizationId})}catch(e){return apiError(e)}}
