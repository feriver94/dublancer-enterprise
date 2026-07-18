import { cookies } from "next/headers";
import { AppError } from "@/lib/errors/app-error";
import { createSecurityToken } from "./security-tokens";

const CSRF_COOKIE = "dublancer_csrf";

export async function issueCsrfToken(): Promise<string> {
  const token = createSecurityToken();
  const store = await cookies();

  store.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60,
  });

  return token;
}

export async function requireCsrfToken(
  request: Request,
): Promise<void> {
  const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get("x-csrf-token");

  if (
    !cookieToken ||
    !headerToken ||
    cookieToken !== headerToken
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Invalid or missing CSRF token.",
      403,
    );
  }
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.APP_BASE_URL
    ? new URL(process.env.APP_BASE_URL).origin
    : null;

  if (
    !origin ||
    (origin !== requestOrigin && origin !== configuredOrigin)
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Cross-origin authentication requests are not permitted.",
      403,
    );
  }
}
