import { cookies } from "next/headers";
import { AUTH_CONFIG } from "./config";

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const store = await cookies();
  setAccessCookieOnStore(store, accessToken);
  store.set(AUTH_CONFIG.refreshCookieName, refreshToken, {
    httpOnly: true, secure: AUTH_CONFIG.cookieSecure, sameSite: "lax", path: "/api/auth",
    maxAge: AUTH_CONFIG.refreshTokenTtlSeconds,
  });
}

function setAccessCookieOnStore(store: Awaited<ReturnType<typeof cookies>>, accessToken: string) {
  store.set(AUTH_CONFIG.sessionCookieName, accessToken, {
    httpOnly: true, secure: AUTH_CONFIG.cookieSecure, sameSite: "lax", path: "/",
    maxAge: AUTH_CONFIG.accessTokenTtlSeconds,
  });
}

export async function setAccessCookie(accessToken: string) {
  setAccessCookieOnStore(await cookies(), accessToken);
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.set(AUTH_CONFIG.sessionCookieName, "", { httpOnly: true, secure: AUTH_CONFIG.cookieSecure, sameSite: "lax", path: "/", maxAge: 0 });
  store.set(AUTH_CONFIG.refreshCookieName, "", { httpOnly: true, secure: AUTH_CONFIG.cookieSecure, sameSite: "lax", path: "/api/auth", maxAge: 0 });
}
