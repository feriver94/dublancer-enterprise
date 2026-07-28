import { NextResponse } from "next/server";
import { PlatformReliabilityService } from "@/lib/services/platform-reliability.service";
export const dynamic = "force-dynamic";
const service = new PlatformReliabilityService();
export async function GET() { const health = await service.systemHealth(); return NextResponse.json(health, { status: health.status === "unhealthy" ? 503 : 200, headers: { "Cache-Control": "no-store" } }); }
