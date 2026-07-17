export type TenantContext={organizationId:string;userId:string;isPlatformAdmin:boolean};
export function requireTenantContext(context:TenantContext|null|undefined):TenantContext{ if(!context?.organizationId||!context.userId) throw new Error("Valid tenant context required"); return context; }
