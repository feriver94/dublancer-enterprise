import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/database/prisma";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { clearAuthCookies } from "@/lib/auth/cookies";
import { AUTH_CONFIG } from "@/lib/auth/config";
import { hashRefreshToken } from "@/lib/auth/tokens";
import { apiError, apiSuccess } from "@/lib/http/api-response";

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const rawRefreshToken = (await cookies()).get(AUTH_CONFIG.refreshCookieName)?.value;
    const refreshTokenHash = rawRefreshToken ? hashRefreshToken(rawRefreshToken) : null;
    const context = await getAuthenticatedContext().catch(() => null);
    const refreshSession = refreshTokenHash
      ? await prisma.authSession.findUnique({ where: { refreshTokenHash } })
      : null;
    const anchor = context
      ? await prisma.authSession.findUnique({ where: { id: context.sessionId } })
      : refreshSession;
    let revoked = 0;

    if (anchor) {
      const now = new Date();
      revoked = await prisma.$transaction(async (tx) => {
        const result = await tx.authSession.updateMany({
          where: {
            status: "ACTIVE",
            OR: [
              { id: { in: [context?.sessionId, refreshSession?.id].filter((value): value is string => Boolean(value)) } },
              {
                userId: anchor.userId,
                organizationId: anchor.organizationId,
                userAgent: anchor.userAgent,
                ipAddress: anchor.ipAddress,
                ...(anchor.trustedDeviceId ? { trustedDeviceId: anchor.trustedDeviceId } : {}),
              },
            ],
          },
          data: { status: "REVOKED", revokedAt: now },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: anchor.organizationId,
            actorUserId: anchor.userId,
            action: "identity.session.logout",
            resourceType: "AuthSession",
            resourceId: anchor.id,
            outcome: "SUCCESS",
            metadata: { revokedSessions: result.count, duplicateSessionsRemoved: Math.max(0, result.count - 1) },
          },
        });
        return result.count;
      });
    }

    await clearAuthCookies();
    return apiSuccess({ signedOut: true, revokedSessions: revoked });
  } catch (error) {
    return apiError(error);
  }
}
