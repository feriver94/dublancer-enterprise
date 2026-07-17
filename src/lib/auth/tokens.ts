import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { AUTH_CONFIG } from "./config";

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(input: {
  sub: string; sessionId: string; organizationId: string | null; isPlatformAdmin: boolean;
}) {
  return new SignJWT({
    sessionId: input.sessionId,
    organizationId: input.organizationId,
    isPlatformAdmin: input.isPlatformAdmin,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.sub)
    .setIssuedAt()
    .setExpirationTime(`${AUTH_CONFIG.accessTokenTtlSeconds}s`)
    .sign(key());
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
  if (typeof payload.sub !== "string" || typeof payload.sessionId !== "string") {
    throw new Error("Invalid token claims.");
  }
  return {
    sub: payload.sub,
    sessionId: payload.sessionId,
    organizationId: typeof payload.organizationId === "string" ? payload.organizationId : null,
    isPlatformAdmin: payload.isPlatformAdmin === true,
  };
}

export const createRefreshToken = () => randomBytes(48).toString("base64url");
export const hashRefreshToken = (token: string) => createHash("sha256").update(token).digest("hex");
