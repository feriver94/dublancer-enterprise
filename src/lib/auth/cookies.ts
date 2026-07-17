import { cookies } from "next/headers";
import { AUTH_CONFIG } from "./config";

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const store = await cookies();
  store.set(AUTH_CONFIG.sessionCookieName, accessToken, {
    httpOnly: true, secure: AUTH_CONFIG.cookieSecure, sameSite: "lax", path: "/",
    maxAge: AUTH_CONFIG.accessTokenTtlSeconds,
  });
  store.set(AUTH_CONFIG.refreshCookieName, refreshToken, {
    httpOnly: true, secure: AUTH_CONFIG.cookieSecure, sameSite: "lax", path: "/api/auth",
    maxAge: AUTH_CONFIG.refreshTokenTtlSeconds,
  });
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.set(AUTH_CONFIG.sessionCookieName, "", { httpOnly: true, secure: AUTH_CONFIG.cookieSecure, sameSite: "lax", path: "/", maxAge: 0 });
  store.set(AUTH_CONFIG.refreshCookieName, "", { httpOnly: true, secure: AUTH_CONFIG.cookieSecure, sameSite: "lax", path: "/api/auth", maxAge: 0 });
}
