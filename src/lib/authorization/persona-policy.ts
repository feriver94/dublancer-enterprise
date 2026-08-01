import type { AccountPersonaType } from "@prisma/client";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { requirePermission } from "./permission-resolver";
import type { PlatformPermission } from "./permissions";

export const PERSONA_CAPABILITIES = {
  "marketplace.listing.manage": ["CLIENT", "ORGANIZATION"],
  "marketplace.proposal.manage": ["FREELANCER"],
  "marketplace.proposal.review": ["CLIENT", "ORGANIZATION"],
  "marketplace.profile.manage": ["FREELANCER"],
  "organization.manage": ["ORGANIZATION"],
} as const satisfies Record<string, readonly AccountPersonaType[]>;

export function requireActivePersona(
  context: TenantContext,
  allowedTypes: readonly AccountPersonaType[],
) {
  if (context.isPlatformAdmin) return;
  if (!context.activePersonaId || !context.activePersonaType) {
    throw new AppError(
      "FORBIDDEN",
      "Select an active Dublancer persona before performing this action.",
      403,
      { code: "PERSONA_REQUIRED", allowedTypes },
    );
  }
  if (!allowedTypes.includes(context.activePersonaType)) {
    throw new AppError(
      "FORBIDDEN",
      `The ${context.activePersonaType.toLowerCase()} persona cannot perform this action.`,
      403,
      { code: "PERSONA_NOT_ALLOWED", activeType: context.activePersonaType, allowedTypes },
    );
  }
}

export async function requirePersonaPermission(
  context: TenantContext,
  permission: PlatformPermission,
  allowedTypes: readonly AccountPersonaType[],
) {
  requireActivePersona(context, allowedTypes);
  return requirePermission(context, permission);
}
