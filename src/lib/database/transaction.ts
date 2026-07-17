import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";

export type TransactionClient = Prisma.TransactionClient;

export async function withTransaction<T>(
  operation: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => operation(tx),
    {
      maxWait: 5_000,
      timeout: 15_000,
      isolationLevel: "ReadCommitted",
    },
  );
}
