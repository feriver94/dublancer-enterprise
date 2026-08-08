# Dual-Profile Marketplace Architecture — Phase B

## Outcome

Phase B adds production public identities, persona dashboards, complete profile settings, owned professional content, profile completion and privacy enforcement to the protected Phase A account/persona foundation.

The implementation is additive over Phase 0–10, Sprint 1 and Phase A. Authentication still belongs to `User`; operating context still belongs to `AccountPersona`; organization access still requires an active `Membership`; and marketplace mutations still compose persona capability with existing RBAC.

## Delivered routes

Public presentation routes are `/u/[username]/client`, `/u/[username]/freelancer` and `/org/[slug]`. Their APIs are `GET /api/public/users/[username]/client`, `GET /api/public/users/[username]/freelancer` and `GET /api/public/organizations/[slug]`.

Authenticated routes are `/dashboard/client`, `/dashboard/freelancer` and `/settings/profiles`. Their APIs include both dashboard GET endpoints, `GET|PATCH /api/profile/settings`, collection and item profile-content CRUD, follow, share preparation and report operations.

Public queries use explicit Prisma `select` allowlists. They never select or serialize email, phone, password, billing configuration, private contract terms, memberships, role assignments, permissions, audit events or internal identity evidence. All browser mutations require the existing CSRF boundary, session-bound persona authorization, ownership and server validation.

## Public profiles

The client profile exposes presentation fields, verification badges, public organization association, response/hiring preferences, social links and live hiring aggregates. Open, active and completed projects, active contracts, hires and repeat-hire rate are derived from stored marketplace/project/contract records. Verified spend is returned only when `showVerifiedSpend` is enabled and is aggregated only from successful financial transactions. Client rating remains a non-scoring Phase C placeholder.

The freelancer profile exposes the requested hero, rate and availability data, services, industries, skills and verified skills, portfolio, case studies, experience, education, certifications, publications, research, resume, social links and video-introduction state. Private earnings and withdrawals are structurally absent. The public reviews summary is deliberately a non-scoring placeholder. Existing published review records are read only on the authenticated dashboard; Phase B adds no review workflow or reputation system.

The organization foundation reuses `Organization.slug` and `CompanyProfile`. It exposes logo, banner, public name, description, industry, website, locations, portfolio, services, technologies, completed-project count and verification state, without selecting RBAC or internal members.

## Database-backed dashboards

The client dashboard derives listing status, proposal pipeline, vendor invitations, contracts, pending signatures, successful/pending payments, upcoming milestones, unread channel sequences, saved freelancers/agencies and hiring analytics from existing tenant-scoped tables.

The freelancer dashboard derives recommended work, proposals, invitations, provider contracts, milestones, assigned tasks, successful escrow releases, pending payouts, unread messages, calendar records, existing published review summaries, dynamic completion, content counts and skill verification from stored data. No widget uses demo or sample values.

## Settings and professional content

`/settings/profiles` separates personal account, client profile, freelancer/provider profile, organization identity and owned content.

Portfolio, case studies, publications and research reuse `PortfolioItem` with `ProfileContentType`. Experience reuses `WorkExperience`. Phase B adds `Education`, `Certification` and `ProfileSocialLink` because no equivalent canonical model existed. Resume and video URLs persist on `FreelancerProfile`.

Updates use integer versions and ownership-scoped `updateMany` predicates. Stale or cross-owner writes return HTTP 409. Delete is a soft archive: `deletedAt` is set, visibility becomes `ARCHIVED`, and the version increments. Sensitive changes create `AuditEvent` evidence containing field names, not copied private values.

## Completion and privacy

`ProfileCompletionService` evaluates named checks against current stored account, profile, skill and content records. Percentage is calculated as completed checks divided by total checks on every request. No score is stored and no static percentage is returned.

Visibility states are `DRAFT`, `HIDDEN`, `PUBLIC`, `VERIFIED`, `SUSPENDED` and `ARCHIVED`.

- Only `PUBLIC` and `VERIFIED` records with no `deletedAt` value can appear publicly.
- The associated Phase A persona must also be `ACTIVE`.
- All non-public states return the normal 404 envelope, preventing publication-state enumeration.
- Freelancer search preparation exists only while the profile is public or verified; hidden states clear `searchText`.
- Users cannot self-assign suspended or archived governance states.
- Verified visibility requires existing verified evidence.
- Public read models never reuse authenticated settings objects.

## Prisma migration

Migration: `20260801150000_dual_profile_marketplace_phase_b`.

The complete `prisma/schema.prisma` is included. The migration adds `ProfileVisibility`, `ProfileContentType`, unique search-ready `User.username` values with compatibility backfill, public presentation/version/soft-delete fields, `Education`, `Certification`, `ProfileSocialLink` and `SavedProvider`, target XOR validation, partial uniqueness, foreign keys and access indexes. Five legacy indexes are replaced with visibility-aware equivalents. There are no table, column or type drops.

## Verification

`npm run test:phase-b:runtime` creates a new PostgreSQL-compatible database, applies all 20 migration SQL files chronologically, executes exact `npm run seed`, starts the application and verifies fresh two-account/three-persona onboarding, client/freelancer/organization publication, public privacy, public-to-hidden 404s, all eight content families, dynamic completion, optimistic conflicts, cross-account ownership denial, tenant/persona authorization, both dashboards, saved providers, reports and soft archive.

The container has no native PostgreSQL server, `postgres`, `initdb`, `pg_ctl` or `psql`. Exact `prisma migrate deploy` was run against the available PGlite socket: Prisma loaded the configuration and datasource, then returned `Error: Schema engine error`. This is a Prisma schema-engine/provider limitation, not a migration SQL failure; the same 20 ordered SQL files passed the fresh database replay.

The final release gate also covers Prisma validate/generate, 83 static tests, TypeScript, ESLint, locale parity, API security, migration chronology, secret scan, production build and aggregate release verification.

## Deferred Phase C scope

Phase B does not add reviews/reputation workflows, reputation calculations, marketplace workflow redesign, contract-persona integration, global-search expansion, AI profile assistance, provider matching or contract review workflows.
