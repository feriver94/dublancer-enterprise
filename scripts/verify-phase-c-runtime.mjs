import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = process.cwd();
const database = new PGlite();
let failure;

async function rows(sql, params = []) {
  return (await database.query(sql, params)).rows;
}

try {
  await database.waitReady;
  const migrations = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(migrations.at(-1), "20260802100000_dual_profile_marketplace_phase_c");
  for (const migration of migrations) {
    await database.exec(await readFile(path.join(root, "prisma/migrations", migration, "migration.sql"), "utf8"));
    process.stdout.write(`Applied migration ${migration}\n`);
  }

  const tables = await rows(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name`, [["ProfileFollow", "MarketplaceInvitation", "Review", "Contract"]]);
  assert.deepEqual(tables.map((row) => row.table_name), ["Contract", "MarketplaceInvitation", "ProfileFollow", "Review"]);

  const contractColumns = await rows(`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Contract' AND column_name = ANY($1::text[]) ORDER BY column_name`, [["clientAccountId", "clientProfileId", "providerProfileId", "clientPersonaId", "providerPersonaId", "clientPersonaType", "providerPersonaType"]]);
  assert.equal(contractColumns.length, 7);
  assert.ok(contractColumns.every((column) => column.is_nullable === "YES"), "legacy contract compatibility columns must remain nullable");

  const acceptanceColumns = await rows(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ContractAcceptance' AND column_name = ANY($1::text[])`, [["personaId", "personaType", "membershipId"]]);
  assert.equal(acceptanceColumns.length, 3);

  const reviewColumns = await rows(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Review' AND column_name = ANY($1::text[])`, [["directionKey", "quality", "communication", "delivery", "expertise", "professionalism", "hiringClarity", "paymentReliability", "professionalConduct"]]);
  assert.equal(reviewColumns.length, 9);

  const constraints = await rows(`SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[]) ORDER BY conname`, [["ProfileFollow_exactly_one_target", "MarketplaceInvitation_exactly_one_target", "Review_dimension_ranges"]]);
  assert.deepEqual(constraints.map((row) => row.conname), ["MarketplaceInvitation_exactly_one_target", "ProfileFollow_exactly_one_target", "Review_dimension_ranges"]);

  const indexes = await rows(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[]) ORDER BY indexname`, [["ProfileFollow_userId_organizationId_targetKey_key", "MarketplaceInvitation_listingId_targetKey_key", "Review_directionKey_key", "Contract_providerPersonaId_status_idx"]]);
  assert.equal(indexes.length, 4);

  await database.exec(`
    INSERT INTO "User" ("id", "email", "displayName", "updatedAt") VALUES
      ('phase-c-client', 'phase-c-client@example.test', 'Phase C Client', CURRENT_TIMESTAMP),
      ('phase-c-provider', 'phase-c-provider@example.test', 'Phase C Provider', CURRENT_TIMESTAMP);
    INSERT INTO "Organization" ("id", "name", "slug", "updatedAt") VALUES
      ('phase-c-client-org', 'Phase C Client Org', 'phase-c-client-org', CURRENT_TIMESTAMP),
      ('phase-c-provider-org', 'Phase C Provider Org', 'phase-c-provider-org', CURRENT_TIMESTAMP);
    INSERT INTO "AccountPersona" ("id", "userId", "organizationId", "type", "status", "label", "updatedAt") VALUES
      ('phase-c-client-persona', 'phase-c-client', 'phase-c-client-org', 'CLIENT', 'ACTIVE', 'Client', CURRENT_TIMESTAMP),
      ('phase-c-provider-persona', 'phase-c-provider', 'phase-c-provider-org', 'FREELANCER', 'ACTIVE', 'Provider', CURRENT_TIMESTAMP);
    INSERT INTO "FreelancerProfile" ("id", "userId", "personaId", "headline", "visibility", "updatedAt") VALUES
      ('phase-c-provider-profile', 'phase-c-provider', 'phase-c-provider-persona', 'Runtime Provider', 'PUBLIC', CURRENT_TIMESTAMP);
    INSERT INTO "MarketplaceListing" ("id", "organizationId", "postedById", "actingPersonaId", "title", "description", "status", "visibility", "engagementType", "updatedAt") VALUES
      ('phase-c-listing', 'phase-c-client-org', 'phase-c-client', 'phase-c-client-persona', 'Runtime marketplace listing', 'Runtime migration and identity evidence.', 'PUBLISHED', 'PUBLIC', 'FIXED_PRICE', CURRENT_TIMESTAMP);
    INSERT INTO "ProfileFollow" ("id", "userId", "organizationId", "targetKey", "freelancerProfileId") VALUES
      ('phase-c-follow', 'phase-c-client', 'phase-c-client-org', 'FREELANCER:phase-c-provider-profile', 'phase-c-provider-profile');
    INSERT INTO "MarketplaceInvitation" ("id", "listingId", "clientOrganizationId", "invitedById", "targetKey", "freelancerProfileId", "updatedAt") VALUES
      ('phase-c-invitation', 'phase-c-listing', 'phase-c-client-org', 'phase-c-client', 'FREELANCER:phase-c-provider-profile', 'phase-c-provider-profile', CURRENT_TIMESTAMP);
  `);
  assert.equal((await rows(`SELECT count(*)::int AS count FROM "ProfileFollow" WHERE "targetKey" = 'FREELANCER:phase-c-provider-profile'`))[0].count, 1);
  assert.equal((await rows(`SELECT count(*)::int AS count FROM "MarketplaceInvitation" WHERE status = 'PENDING'`))[0].count, 1);

  await assert.rejects(
    database.exec(`INSERT INTO "ProfileFollow" ("id", "userId", "organizationId", "targetKey") VALUES ('invalid-follow', 'phase-c-client', 'phase-c-client-org', 'INVALID')`),
    /ProfileFollow_exactly_one_target|check constraint/i,
  );
  await assert.rejects(
    database.exec(`INSERT INTO "MarketplaceInvitation" ("id", "listingId", "clientOrganizationId", "invitedById", "targetKey", "updatedAt") VALUES ('invalid-invite', 'phase-c-listing', 'phase-c-client-org', 'phase-c-client', 'INVALID', CURRENT_TIMESTAMP)`),
    /MarketplaceInvitation_exactly_one_target|check constraint/i,
  );

  console.log(JSON.stringify({ result: "PASS", migrations: migrations.length, freshDatabase: true, additiveCompatibility: true, personaEvidence: true, followTargetGuard: true, invitationTargetGuard: true, reviewDimensionGuard: true }, null, 2));
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  await database.close().catch(() => undefined);
}

if (failure) process.exitCode = 1;
