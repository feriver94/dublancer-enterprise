import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase A models one account with personal, client, freelancer and organization personas", async () => {
  const [schema, migration] = await Promise.all([
    read("prisma/schema.prisma"),
    read("prisma/migrations/20260801090000_dual_profile_marketplace_phase_a/migration.sql"),
  ]);
  for (const model of ["PersonalIdentity", "OnboardingProgress", "AccountPersona", "ClientProfile", "PersonaEvent"]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
  for (const type of ["CLIENT", "FREELANCER", "ORGANIZATION"]) assert.match(schema, new RegExp(type));
  assert.match(schema, /activePersonaId\s+String\?/);
  assert.match(schema, /personaId\s+String\?\s+@unique/);
  assert.match(migration, /AccountPersona_one_client_per_account_key/);
  assert.match(migration, /AccountPersona_one_freelancer_per_account_key/);
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
});

test("Phase A registration and migration preserve existing accounts while creating new onboarding foundations", async () => {
  const [auth, migration] = await Promise.all([
    read("src/lib/services/auth.service.ts"),
    read("prisma/migrations/20260801090000_dual_profile_marketplace_phase_a/migration.sql"),
  ]);
  assert.match(auth, /personalIdentity:\s*\{/);
  assert.match(auth, /onboardingProgress:\s*\{/);
  assert.match(auth, /type: "CLIENT"/);
  assert.match(auth, /type: "ORGANIZATION"/);
  assert.match(auth, /activePersonaId/);
  assert.match(migration, /Existing accounts are marked complete/);
  assert.match(migration, /FROM "Membership"/);
  assert.match(migration, /UPDATE "FreelancerProfile"/);
});

test("Phase A binds persona context to signed sessions and rejects stale persona tokens", async () => {
  const [tokens, session, service, route] = await Promise.all([
    read("src/lib/auth/tokens.ts"),
    read("src/lib/auth/session.ts"),
    read("src/lib/services/persona.service.ts"),
    read("src/app/api/personas/switch/route.ts"),
  ]);
  assert.match(tokens, /activePersonaId/);
  assert.match(session, /claims\.activePersonaId !== session\.activePersonaId/);
  assert.match(session, /activePersona\.status !== "ACTIVE"/);
  assert.match(service, /authSession\.updateMany/);
  assert.match(service, /persona\.switched/);
  assert.match(route, /setAccessCookie/);
  assert.match(route, /requireCsrfToken/);
});

test("Phase A onboarding validates identity, membership and persona-specific profiles", async () => {
  const [service, validation, completeRoute] = await Promise.all([
    read("src/lib/services/persona.service.ts"),
    read("src/lib/validation/persona.ts"),
    read("src/app/api/onboarding/complete/route.ts"),
  ]);
  assert.match(service, /Complete personal identity before activating a persona/);
  assert.match(service, /Active organization membership required/);
  assert.match(service, /Complete the client profile before activation/);
  assert.match(service, /Complete the freelancer profile before activation/);
  assert.match(service, /Complete the organization profile before activation/);
  assert.match(validation, /selectedPersonaTypes/);
  assert.match(completeRoute, /completeOnboarding/);
  assert.match(completeRoute, /switchPersona/);
});

test("Phase A marketplace authorization composes persona capability and existing RBAC", async () => {
  const [policy, listings, proposals, profile] = await Promise.all([
    read("src/lib/authorization/persona-policy.ts"),
    read("src/app/api/marketplace/listings/route.ts"),
    read("src/app/api/marketplace/proposals/route.ts"),
    read("src/app/api/marketplace/profile/route.ts"),
  ]);
  assert.match(policy, /requireActivePersona/);
  assert.match(policy, /requirePermission/);
  assert.match(policy, /PERSONA_REQUIRED/);
  assert.match(listings, /\["CLIENT", "ORGANIZATION"\]/);
  assert.match(proposals, /\["FREELANCER"\]/);
  assert.match(profile, /personas\.activate/);
  assert.match(profile, /personas\.switchPersona/);
});

test("Phase A exposes bilingual guided onboarding, activation and global persona switching", async () => {
  const [client, navbar, en, ar] = await Promise.all([
    read("src/components/account/PersonaCenterClient.tsx"),
    read("src/components/layout/NavbarClient.tsx"),
    read("messages/en-AE.json"),
    read("messages/ar-AE.json"),
  ]);
  assert.match(client, /\/api\/onboarding\/complete/);
  assert.match(client, /\/api\/personas\/activate/);
  assert.match(navbar, /\/api\/personas\/switch/);
  assert.match(navbar, /managePersonas/);
  assert.deepEqual(Object.keys(JSON.parse(en).Persona).sort(), Object.keys(JSON.parse(ar).Persona).sort());
});
