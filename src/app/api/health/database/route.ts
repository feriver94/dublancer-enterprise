import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/database/health";
export const dynamic="force-dynamic";
export async function GET(){ const health=await checkDatabaseHealth(); return NextResponse.json(health,{status:health.status==="healthy"?200:503,headers:{"Cache-Control":"no-store"}}); }
