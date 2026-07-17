import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){ const organizationId=request.headers.get("x-organization-id"); if(!organizationId)return NextResponse.json({error:"Missing x-organization-id header"},{status:400}); const organization=await prisma.organization.findUnique({where:{id:organizationId},select:{id:true,name:true,slug:true,status:true,createdAt:true,updatedAt:true}}); if(!organization)return NextResponse.json({error:"Organization not found"},{status:404}); return NextResponse.json({data:organization}); }
