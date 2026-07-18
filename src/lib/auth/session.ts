import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { AUTH_CONFIG } from "./config";
import { verifyAccessToken } from "./tokens";

export async function getAuthenticatedContext() {
  const token = (await cookies()).get(AUTH_CONFIG.sessionCookieName)?.value;
  if (!token) throw new AppError("UNAUTHORIZED", "Authentication required.", 401);

  let claims;
  try { claims = await verifyAccessToken(token); }
  catch { throw new AppError("UNAUTHORIZED", "Invalid or expired session.", 401); }

  const session = await prisma.authSession.findFirst({
    where: { id: claims.sessionId, userId: claims.sub, status: "ACTIVE", expiresAt: { gt: new Date() } },
    include: { user: { select: { isPlatformAdmin: true } } },
  });
  if (!session) throw new AppError("UNAUTHORIZED", "Session is no longer active.", 401);

  if (claims.organizationId !== session.organizationId) {
    throw new AppError(
      "UNAUTHORIZED",
      "Session organization context is invalid.",
      401,
    );
  }

  if (!session.user.isPlatformAdmin) {
    if (!session.organizationId) {
      throw new AppError(
        "FORBIDDEN",
        "An active organization membership is required.",
        403,
      );
    }

    const membership = await prisma.membership.findFirst({
      where: {
        organizationId: session.organizationId,
        userId: session.userId,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (!membership) {
      throw new AppError(
        "FORBIDDEN",
        "The session organization membership is no longer active.",
        403,
      );
    }
  }

  return {
    sessionId: session.id,
    userId: claims.sub,
    organizationId: session.organizationId ?? "",
    isPlatformAdmin: session.user.isPlatformAdmin,
  };
}

export async function getRequestMetadata() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}
