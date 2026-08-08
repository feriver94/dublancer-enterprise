import { NextResponse } from "next/server";
import { PlatformReliabilityService } from "@/lib/services/platform-reliability.service";
import { unavailableReadiness } from "@/lib/reliability/readiness";
export const dynamic = "force-dynamic";
const service = new PlatformReliabilityService();
export async function GET() {
  try {
    const health = await service.systemHealth();
    return NextResponse.json(health, {
      status: health.status === "ready" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(unavailableReadiness(), {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
