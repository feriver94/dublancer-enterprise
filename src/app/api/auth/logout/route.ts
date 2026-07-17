import type { NextRequest } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { clearAuthCookies } from "@/lib/auth/cookies";
import { apiError, apiSuccess } from "@/lib/http/api-response";
export async function POST(request: NextRequest) { try { await requireCsrfToken(request); const context = await getAuthenticatedContext(); await prisma.authSession.updateMany({ where: { id: context.sessionId, userId: context.userId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } }); await clearAuthCookies(); return apiSuccess({ signedOut: true }); } catch (error) { return apiError(error); } }
