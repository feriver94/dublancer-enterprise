import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const requireRepresentativeRecords = process.argv.includes("--require-representative-records");
const sourceUrl = process.env.DATABASE_URL?.trim();
const restoreUrl = process.env.RESTORE_DATABASE_URL?.trim();

if (!sourceUrl) throw new Error("DATABASE_URL is required for native PostgreSQL verification.");

async function committedMigrations() {
  return (await readdir(path.join(process.cwd(), "prisma/migrations"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function client(connectionString) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

async function inspect(prisma, expectedMigrations) {
  const versionRows = await prisma.$queryRawUnsafe("SHOW server_version");
  const deployed = await prisma.$queryRawUnsafe(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
  );
  const migrationNames = deployed.map((row) => row.migration_name);
  assert.deepEqual(migrationNames, expectedMigrations, "Native PostgreSQL migration history differs from the committed history.");

  const counts = {
    users: await prisma.user.count(),
    clientProfiles: await prisma.clientProfile.count(),
    freelancerProfiles: await prisma.freelancerProfile.count(),
    projects: await prisma.project.count(),
    contracts: await prisma.contract.count(),
    skills: await prisma.skill.count(),
    featureFlags: await prisma.featureFlag.count(),
    subscriptionPlans: await prisma.subscriptionPlan.count(),
  };
  const representativeIds = {
    user: (await prisma.user.findFirst({ orderBy: { id: "asc" }, select: { id: true } }))?.id ?? null,
    clientProfile: (await prisma.clientProfile.findFirst({ orderBy: { id: "asc" }, select: { id: true } }))?.id ?? null,
    freelancerProfile: (await prisma.freelancerProfile.findFirst({ orderBy: { id: "asc" }, select: { id: true } }))?.id ?? null,
    project: (await prisma.project.findFirst({ orderBy: { id: "asc" }, select: { id: true } }))?.id ?? null,
    contract: (await prisma.contract.findFirst({ orderBy: { id: "asc" }, select: { id: true } }))?.id ?? null,
  };

  assert.ok(counts.skills > 0 && counts.featureFlags > 0 && counts.subscriptionPlans > 0, "Authoritative reference seed data is missing.");
  if (requireRepresentativeRecords) {
    for (const [name, value] of Object.entries(representativeIds)) {
      assert.ok(value, `Representative ${name} record is missing.`);
    }
  }

  return {
    serverVersion: versionRows[0]?.server_version ?? "unknown",
    migrationCount: migrationNames.length,
    counts,
    representativeIds,
  };
}

const expectedMigrations = await committedMigrations();
const source = client(sourceUrl);
let restored;
try {
  const sourceState = await inspect(source, expectedMigrations);
  if (!restoreUrl) {
    console.log(JSON.stringify({ result: "PASS", database: sourceState }, null, 2));
  } else {
    restored = client(restoreUrl);
    const restoredState = await inspect(restored, expectedMigrations);
    assert.deepEqual(restoredState.counts, sourceState.counts, "Restored representative table counts differ from the source backup.");
    assert.deepEqual(restoredState.representativeIds, sourceState.representativeIds, "Restored representative record identities differ from the source backup.");
    console.log(JSON.stringify({
      result: "PASS",
      source: sourceState,
      restored: restoredState,
      integrity: "migration history, representative counts, and representative identities match",
    }, null, 2));
  }
} finally {
  await Promise.allSettled([source.$disconnect(), restored?.$disconnect()]);
}
