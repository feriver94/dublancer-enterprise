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