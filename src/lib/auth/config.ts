export const AUTH_CONFIG = {
  accessTokenTtlSeconds: 60 * 15,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 30,
  sessionCookieName: "dublancer_session",
  refreshCookieName: "dublancer_refresh",
  cookieSecure: process.env.NODE_ENV === "production",
  cookieSameSite: "lax" as const,
};
