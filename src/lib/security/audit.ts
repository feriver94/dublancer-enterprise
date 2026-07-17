import { prisma } from "@/lib/database/prisma";
import type { Prisma } from "@prisma/client";

export async function writeAuditEvent(
  input: Prisma.AuditEventUncheckedCreateInput,
) {
  await prisma.auditEvent.create({ data: input });
}
