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
    where: {
      id: claims.sessionId,
      userId: claims.sub,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
      OR: [{ idleExpiresAt: null }, { idleExpiresAt: { gt: new Date() } }],
    },
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

  if (session.lastSeenAt.getTime() < Date.now() - 5 * 60_000) {
    const policy = session.organizationId
      ? await prisma.organizationIdentityPolicy.findUnique({
          where: { organizationId: session.organizationId },
          select: { sessionIdleMinutes: true },
        })
      : null;
    await prisma.authSession.updateMany({
      where: { id: session.id, status: "ACTIVE" },
      data: {
        lastSeenAt: new Date(),
        idleExpiresAt: new Date(
          Date.now() + (policy?.sessionIdleMinutes ?? 720) * 60_000,
        ),
      },
    });
  }

  return {
    sessionId: session.id,
    userId: claims.sub,
    organizationId: session.organizationId ?? "",
    isPlatformAdmin: session.user.isPlatformAdmin,
    assuranceLevel: session.assuranceLevel,
    authMethod: session.authMethod,
    stepUpExpiresAt: session.stepUpExpiresAt,
    trustedDeviceId: session.trustedDeviceId,
  };
}

export async function requireStepUpAuthentication() {
  const context = await getAuthenticatedContext();
  if (
    context.assuranceLevel === "AAL1" ||
    !context.stepUpExpiresAt ||
    context.stepUpExpiresAt <= new Date()
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Recent MFA verification is required for this action.",
      403,
      { code: "STEP_UP_REQUIRED" },
    );
  }
  return context;
}

export async function getRequestMetadata() {
  const h = await headers();
  return {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}
