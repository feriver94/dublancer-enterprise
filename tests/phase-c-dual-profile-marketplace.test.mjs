import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase C migration is additive and records marketplace persona evidence", async () => {
  const [schema, migration] = await Promise.all([read("prisma/schema.prisma"), read("prisma/migrations/20260802100000_dual_profile_marketplace_phase_c/migration.sql")]);
  for (const model of ["ProfileFollow", "MarketplaceInvitation"]) assert.match(schema, new RegExp(`model ${model} \\{`));
  for (const field of ["clientPersonaId", "providerPersonaId", "clientPersonaType", "providerPersonaType", "clientProfileId", "providerProfileId"]) assert.match(schema, new RegExp(field));
  assert.match(migration, /Review_dimension_ranges/);
  assert.match(migration, /ProfileFollow_exactly_one_target/);
  assert.match(migration, /MarketplaceInvitation_exactly_one_target/);
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
});

test("save follow invite and comparison are distinct governed workflows", async () => {
  const [service, actions, compare] = await Promise.all([read("src/lib/services/phase-c-marketplace.service.ts"), read("src/components/profile/PublicProfileActions.tsx"), read("src/components/marketplace/ProviderComparisonClient.tsx")]);
  assert.match(service, /prisma\.savedProvider/);
  assert.match(service, /prisma\.profileFollow/);
  assert.match(service, /prisma\.marketplaceInvitation/);
  assert.match(service, /requirePersonaPermission/);
  assert.match(actions, /action: "SAVE"/);
  assert.match(actions, /action: "FOLLOW"/);
  assert.match(actions, /action: "INVITE"/);
  assert.match(compare, /comparisonExplanation/);
  assert.doesNotMatch(compare, /best provider|winner|recommended score/i);
});

test("contracts and reviews use immutable persona direction and real dimensions", async () => {
  const [commercial, contract, validation, reputation] = await Promise.all([read("src/lib/services/commercial-platform.service.ts"), read("src/lib/services/phase6-contract.service.ts"), read("src/lib/validation/phase-c.ts"), read("src/lib/services/reputation.service.ts")]);
  for (const source of [commercial, contract]) {
    assert.match(source, /activePersonaType/);
    assert.match(source, /CONTRACT_PERSONA_MISMATCH|marketplace persona recorded/);
  }
  for (const dimension of ["quality", "communication", "delivery", "expertise", "professionalism", "hiringClarity", "paymentReliability", "professionalConduct"]) assert.match(validation, new RegExp(dimension));
  assert.match(contract, /directionKey/);
  assert.match(contract, /status: "PUBLISHED"/);
  assert.match(reputation, /NOT_ENOUGH_DATA/);
  assert.doesNotMatch(reputation, /earnings|private/i);
});

test("search performs authoritative live read-through and project writes synchronize immediately", async () => {
  const [search, project] = await Promise.all([read("src/lib/services/search-index.service.ts"), read("src/lib/services/project.service.ts")]);
  assert.match(search, /liveReadThrough/);
  assert.match(search, /mode: "insensitive"/);
  for (const type of ["CLIENT_PROFILE", "FREELANCER_PROFILE", "PUBLIC_ORGANIZATION"]) assert.match(search, new RegExp(type));
  assert.match(project, /synchronizeEntity|synchronizeProject/);
});

test("persona-specific marketplace UI and navigation do not expose wrong-side primary actions", async () => {
  const [navbar, marketplace] = await Promise.all([read("src/components/layout/Navbar.tsx"), read("src/components/marketplace/MarketplaceClient.tsx")]);
  assert.match(navbar, /clientNavItems/);
  assert.match(navbar, /freelancerNavItems/);
  assert.match(navbar, /activePersonaType === "FREELANCER"/);
  assert.match(marketplace, /canHire/);
  assert.match(marketplace, /canProvide/);
  assert.match(marketplace, /PersonaRequired/);
});

test("AI profile help reuses governance and remains optional and non-applying", async () => {
  const [service, component] = await Promise.all([read("src/lib/services/phase-c-ai-assistance.service.ts"), read("src/components/profile/AiProfileAssistant.tsx")]);
  assert.match(service, /AiGovernanceService/);
  assert.match(service, /POLICY_OR_PROVIDER_UNAVAILABLE/);
  assert.match(service, /autoApplied: false/);
  assert.doesNotMatch(service, /profile\.(update|upsert)|clientProfile\.(update|upsert)|freelancerProfile\.(update|upsert)/);
  assert.match(component, /neverAutoPublish/);
});

test("stale conflicts preserve server context and form input", async () => {
  const [api, contract] = await Promise.all([read("src/lib/client/api-client.ts"), read("src/components/contracts/ContractDetailClient.tsx")]);
  assert.match(api, /code === "CONFLICT" && fallback/);
  assert.match(contract, /ApiClientError/);
  assert.match(contract, /status === 409/);
  assert.match(contract, /newerData/);
});
