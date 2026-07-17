import { prisma } from "@/lib/database/prisma";
import type { TransactionClient } from "@/lib/database/transaction";

type DbClient = typeof prisma | TransactionClient;

export class OrganizationRepository {
  constructor(private readonly db: DbClient = prisma) {}

  async findById(id: string) {
    return this.db.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findActiveMembership(
    organizationId: string,
    userId: string,
  ) {
    return this.db.membership.findFirst({
      where: {
        organizationId,
        userId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        roleId: true,
        status: true,
      },
    });
  }
}
