import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/api-response";
import { EnterpriseOperationsService } from "@/lib/services/enterprise-operations.service";

const service = new EnterpriseOperationsService();
export async function GET(_request: Request, { params }: { params: Promise<{ exportId: string }> }) {
  try {
    const exportJob = await service.exportArtifact(await getAuthenticatedContext(), (await params).exportId);
    return new NextResponse(JSON.stringify(exportJob.artifact!.payload, null, 2), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="dublancer-${exportJob.type.toLowerCase()}-${exportJob.id}.json"`,
        "x-content-sha256": exportJob.artifact!.checksumSha256,
      },
    });
  } catch (error) { return apiError(error); }
}
