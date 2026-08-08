import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase B extends the canonical Phase A profiles with additive visibility and ownership state", async () => {
  const [schema, migration] = await Promise.all([read("prisma/schema.prisma"), read("prisma/migrations/20260801150000_dual_profile_marketplace_phase_b/migration.sql")]);
  for (const model of ["ClientProfile", "FreelancerProfile", "CompanyProfile", "Education", "Certification", "ProfileSocialLink", "SavedProvider"]) assert.match(schema, new RegExp(`model ${model} \\{`));
  for (const state of ["DRAFT", "HIDDEN", "PUBLIC", "VERIFIED", "SUSPENDED", "ARCHIVED"]) assert.match(schema, new RegExp(`\\b${state}\\b`));
  assert.match(migration, /SavedProvider_exactly_one_target/);
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
});

test("client public profile uses an explicit privacy allowlist and live hiring aggregates", async () => {
  const service = await read("src/lib/services/public-profile.service.ts");
  const page = await read("src/app/u/[username]/client/page.tsx");
  assert.match(service, /client\(username: string\)/);
  assert.match(service, /showVerifiedSpend/);
  assert.match(service, /marketplaceListing\.count/);
  assert.match(service, /financialTransaction\.aggregate/);
  for (const privateField of ["passwordHash", "phoneNumber", "taxRegistrationNumber", "memberships", "auditEvents"]) assert.doesNotMatch(service.slice(service.indexOf("async client"), service.indexOf("async freelancer")), new RegExp(`${privateField}: true`));
  assert.match(page, /PublicProfileActions/);
});

test("freelancer public profile contains complete portfolio and credential sections without earnings", async () => {
  const [service, page] = await Promise.all([read("src/lib/services/public-profile.service.ts"), read("src/app/u/[username]/freelancer/page.tsx")]);
  for (const field of ["portfolioItems", "workExperiences", "educations", "certifications", "skills", "resumeUrl", "videoUrl", "githubUrl", "linkedinUrl"]) assert.match(service, new RegExp(field));
  assert.match(service, /ReputationService/);
  assert.match(service, /reviewsSummary: \{ value: reputation\.overall/);
  assert.doesNotMatch(service.slice(service.indexOf("async freelancer"), service.indexOf("async organization")), /financialTransaction|earnings/);
  for (const section of ["caseStudies", "publications", "research", "education", "certifications"]) assert.match(page, new RegExp(section));
});

test("profile content CRUD validates ownership, optimistic versions and soft deletion", async () => {
  const [service, collectionRoute, itemRoute] = await Promise.all([read("src/lib/services/profile-management.service.ts"), read("src/app/api/profile/content/[kind]/route.ts"), read("src/app/api/profile/content/[kind]/[id]/route.ts")]);
  for (const family of ["portfolioItem", "workExperience", "education", "certification", "profileSocialLink"]) assert.match(service, new RegExp(`prisma\\.${family}`));
  assert.match(service, /freelancerProfileId: profile\.id/);
  assert.match(service, /version: \{ increment: 1 \}/);
  assert.match(service, /deletedAt: new Date\(\), visibility: "ARCHIVED"/);
  assert.match(collectionRoute, /requireCsrfToken/);
  assert.match(itemRoute, /requireCsrfToken/);
});

test("personal client freelancer and organization settings persist validated audited changes", async () => {
  const [validation, service, client] = await Promise.all([read("src/lib/validation/profile.ts"), read("src/lib/services/profile-management.service.ts"), read("src/components/profile/ProfileSettingsClient.tsx")]);
  for (const section of ["personal", "client", "freelancer", "organization"]) assert.match(validation, new RegExp(`literal\\(\"${section}\"\\)`));
  assert.match(service, /profile\.personal\.updated/);
  assert.match(service, /profile\.client\.updated/);
  assert.match(service, /profile\.freelancer\.updated/);
  assert.match(service, /profile\.organization\.updated/);
  assert.match(service, /changed in another session/);
  assert.match(client, /\/api\/profile\/settings/);
});

test("profile completion is calculated from stored-field checks rather than stored percentages", async () => {
  const completion = await read("src/lib/profile/completion.ts");
  assert.match(completion, /Math\.round\(\(completed \/ checks\.length\) \* 100\)/);
  assert.match(completion, /missing: checks\.filter/);
  assert.doesNotMatch(completion, /percentage:\s*(25|50|75|100)\b/);
  for (const relation of ["skills", "portfolioItems", "workExperiences", "educations", "certifications"]) assert.match(completion, new RegExp(relation));
});

test("client and freelancer dashboards aggregate live tenant-scoped product data", async () => {
  const [service, clientRoute, freelancerRoute] = await Promise.all([read("src/lib/services/profile-dashboard.service.ts"), read("src/app/api/dashboard/client/route.ts"), read("src/app/api/dashboard/freelancer/route.ts")]);
  for (const source of ["marketplaceListing", "proposal", "contract", "financialTransaction", "chatChannelMember", "projectTask"]) assert.match(service, new RegExp(`prisma\\.${source}`));
  assert.match(service, /requireActivePersona\(context, \["CLIENT", "ORGANIZATION"\]\)/);
  assert.match(service, /requireActivePersona\(context, \["FREELANCER"\]\)/);
  assert.doesNotMatch(service, /demo|mock|sample/i);
  assert.match(clientRoute, /getAuthenticatedContext/);
  assert.match(freelancerRoute, /getAuthenticatedContext/);
});

test("organization public foundation exposes presentation data without RBAC or members", async () => {
  const [service, page] = await Promise.all([read("src/lib/services/public-profile.service.ts"), read("src/app/org/[slug]/page.tsx")]);
  const organizationSlice = service.slice(service.indexOf("async organization"));
  for (const field of ["logoUrl", "bannerUrl", "industry", "locations", "services", "technologies", "portfolio", "completedProjects"]) assert.match(organizationSlice, new RegExp(field));
  assert.doesNotMatch(organizationSlice, /memberships|roles|permissions|auditEvents/);
  assert.match(page, /PublicProfileActions/);
});

test("visibility governs public routes, share responses and search preparation", async () => {
  const [publicService, management] = await Promise.all([read("src/lib/services/public-profile.service.ts"), read("src/lib/services/profile-management.service.ts")]);
  assert.match(publicService, /const publicVisibility = \["PUBLIC", "VERIFIED"\]/);
  assert.match(publicService, /deletedAt: null/);
  assert.match(publicService, /persona\.status !== "ACTIVE"/);
  assert.match(management, /searchText: isPublished \? searchText : null/);
  assert.match(management, /Suspended and archived profile states are controlled by platform governance/);
});

test("Phase B UI is responsive dark bilingual RTL and handles loading empty conflict and retry states", async () => {
  const [css, settings, dashboard, en, ar] = await Promise.all([read("src/app/globals.css"), read("src/components/profile/ProfileSettingsClient.tsx"), read("src/components/profile/PhaseBDashboardClient.tsx"), read("messages/en-AE.json"), read("messages/ar-AE.json")]);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /\[dir="rtl"\]/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(settings, /CONFLICT|changed|enterprise-error|error/i);
  assert.match(dashboard, /resource\.refresh/);
  assert.deepEqual(Object.keys(JSON.parse(en).ProfilePhaseB).sort(), Object.keys(JSON.parse(ar).ProfilePhaseB).sort());
});
