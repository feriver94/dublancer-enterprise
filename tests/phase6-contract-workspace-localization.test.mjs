import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("Phase 6 contract execution has governed amendment, dispute, closeout, completion and review workflows", () => {
  const service = read("src/lib/services/phase6-contract.service.ts");
  const legacyService = read("src/lib/services/commercial-platform.service.ts");
  const schema = read("prisma/schema.prisma");
  for (const capability of ["decideAmendment", "transitionDispute", "closeMilestone", "complete", "createReview"]) assert.match(service, new RegExp(`async ${capability}\\(`));
  assert.match(service, /proposing party cannot decide its own amendment/i);
  assert.match(service, /disputeEvent/);
  assert.match(service, /Every milestone must be released or cancelled and closed out/);
  assert.match(service, /Reviews are available after final contract completion/);
  assert.match(legacyService, /Use the final contract completion workflow/);
  assert.match(schema, /model DisputeEvent \{/);
  for (const field of ["baseContractVersion", "completedById", "closeoutNote", "reviewerParty"]) assert.match(schema, new RegExp(field));
});

test("Phase 6 advanced delivery covers all requested production workspace operations", () => {
  const service = read("src/lib/services/phase6-workspace.service.ts");
  const validation = read("src/lib/validation/phase6.ts");
  const client = read("src/components/workspace/AdvancedDeliveryClient.tsx");
  for (const type of ["timeEntry", "timesheet", "deliverable", "dependency", "issue", "risk", "changeRequest", "resourceAllocation", "template", "health"]) {
    assert.match(validation, new RegExp(`literal\\(\"${type}\"\\)`));
  }
  assert.match(service, /dependency would create a task cycle/i);
  assert.match(service, /allocations cannot exceed 100 percent/i);
  assert.match(service, /calculateHealth/);
  assert.match(service, /completeProject/);
  assert.match(client, /Advanced delivery operations|deliveryTitle/);
});

test("Phase 6 localization, RTL and accessibility contracts are explicit", () => {
  const en = JSON.parse(read("messages/en-AE.json"));
  const ar = JSON.parse(read("messages/ar-AE.json"));
  const root = read("src/app/layout.tsx");
  const formatters = read("src/lib/locale/formatters.ts");
  const contracts = read("src/components/contracts/ContractDetailClient.tsx");
  const workspace = read("src/components/workspace/WorkspaceClient.tsx");
  assert.deepEqual(Object.keys(en.Contracts).sort(), Object.keys(ar.Contracts).sort());
  assert.deepEqual(Object.keys(en.Workspace).sort(), Object.keys(ar.Workspace).sort());
  assert.match(JSON.stringify(ar.Contracts), /[\u0600-\u06ff]/);
  assert.match(root, /dir=\{locale\.direction\}/);
  assert.match(root, /lang=\{locale\.locale\}/);
  assert.match(formatters, /Asia\/Dubai/);
  assert.match(formatters, /currency: UAE_CURRENCY/);
  assert.match(contracts, /useTranslations\(\"Contracts\"\)/);
  assert.match(workspace, /useTranslations\(\"Workspace\"\)/);
  assert.doesNotMatch(contracts, /toLocaleString\(\"en-AE\"|toLocaleDateString\(\"en-AE\"/);
  assert.doesNotMatch(workspace, /toLocaleString\(\"en-AE\"|toLocaleDateString\(\"en-AE\"/);
  assert.match(contracts, /role=\"alert\"/);
  assert.match(contracts, /role=\"status\"/);
  assert.match(clientSource(), /aria-labelledby/);
});

test("Phase 6 migration is chronological and additive", () => {
  const migration = read("prisma/migrations/20260722180000_contract_workspace_localization/migration.sql");
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DROP TYPE/);
  assert.match(migration, /CREATE TABLE "DisputeEvent"/);
  assert.match(migration, /ContractAmendment_one_proposed_per_contract_key/);
  assert.match(migration, /Review_rating_check/);
  assert.match(migration, /ResourceAllocation_percent_check/);
});

function clientSource() { return read("src/components/workspace/AdvancedDeliveryClient.tsx"); }
