import { NextResponse } from "next/server";
import { platformReadiness } from "@/lib/services/platform-operations.service";
export const dynamic = "force-dynamic";
export async function GET() { const health = await platformReadiness(); return NextResponse.json(health, { status: health.status === "ready" ? 200 : 503, headers: { "Cache-Control": "no-store" } }); }
