import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { FileScanService } from "@/lib/services/file-scan.service";
const service = new FileScanService();
export async function POST(request: NextRequest, route: { params: Promise<{ providerKey: string }> }) { try { const rawBody = await request.text(); const { providerKey } = await route.params; return apiSuccess(await service.accept(providerKey, rawBody, request.headers.get("x-provider-signature") ?? ""), 202); } catch (error) { return apiError(error); } }
