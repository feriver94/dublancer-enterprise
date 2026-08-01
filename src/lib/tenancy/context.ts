import type { AccountPersonaType } from "@prisma/client";

export type TenantContext={
  organizationId:string;
  userId:string;
  isPlatformAdmin:boolean;
  sessionId?:string;
  activePersonaId?:string|null;
  activePersonaType?:AccountPersonaType|null;
};
export function requireTenantContext(context:TenantContext|null|undefined):TenantContext{ if(!context?.organizationId||!context.userId) throw new Error("Valid tenant context required"); return context; }
