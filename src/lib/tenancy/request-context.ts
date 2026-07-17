import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";

export function getTenantContextFromRequest(
  request: NextRequest,
): TenantContext {
  const organizationId = request.headers.get("x-organization-id");
  const userId = request.headers.get("x-user-id");
  const isPlatformAdmin =
    request.headers.get("x-platform-admin") === "true";

  if (!organizationId || !userId) {
    throw new AppError(
      "UNAUTHORIZED",
      "Authenticated user and organization context are required.",
      401,
    );
  }

  return {
    organizationId,
    userId,
    isPlatformAdmin,
  };
}
