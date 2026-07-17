import type { AuditOutcome, Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import type { TransactionClient } from "@/lib/database/transaction";

type DbClient = typeof prisma | TransactionClient;

export type AuditRecordInput = {
  organizationId?: string;
  actorUserId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome: AuditOutcome;
  metadata?: Prisma.InputJsonValue;
};

export class AuditRepository {
  constructor(private readonly db: DbClient = prisma) {}

  async create(input: AuditRecordInput) {
    return this.db.auditEvent.create({
      data: input,
    });
  }
}
