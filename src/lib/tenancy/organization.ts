import { prisma } from "@/lib/database/prisma";
import { requireTenantContext, type TenantContext } from "./context";
export async function assertOrganizationMembership(input:TenantContext){ const ctx=requireTenantContext(input); if(ctx.isPlatformAdmin)return; const membership=await prisma.membership.findFirst({where:{organizationId:ctx.organizationId,userId:ctx.userId,status:"ACTIVE"},select:{id:true}}); if(!membership) throw new Error("Access denied: active organization membership required"); }
