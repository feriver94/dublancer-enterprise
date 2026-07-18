import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors/app-error";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function requireConfiguredSecret(
  supplied: string,
  environmentKey: string,
): void {
  const configured = process.env[environmentKey];

  if (!configured || configured.length < 32) {
    throw new AppError("SERVICE_UNAVAILABLE", "Internal worker authentication is not configured.", 503);
  }

  const expected = digest(configured);
  const provided = digest(supplied);

  if (!timingSafeEqual(expected, provided)) {
    throw new AppError("UNAUTHORIZED", "Invalid internal worker credentials.", 401);
  }
}

export function requireInternalHeader(
  request: Request,
  headerName: string,
  environmentKey: string,
): void {
  requireConfiguredSecret(
    request.headers.get(headerName) ?? "",
    environmentKey,
  );
}

export function requireInternalSecret(
  request: Request,
  environmentKey: string,
): void {
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  requireConfiguredSecret(supplied, environmentKey);
}
