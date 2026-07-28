import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ status: "live", service: "dublancer-enterprise", version: process.env.APP_VERSION ?? "1.0.0", uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } }); }
