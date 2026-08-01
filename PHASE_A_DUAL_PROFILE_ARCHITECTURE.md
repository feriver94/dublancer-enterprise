# Phase A — Dual-Profile Marketplace Foundation

## Outcome

Phase A establishes one secure Dublancer account that can operate through independently validated client, freelancer/provider, and organization personas. It is an additive identity and authorization foundation over the completed Phase 0-10 and Sprint 1 release.

```text
Dublancer account
├── Personal identity
├── Client persona → Client profile
├── Freelancer persona → Freelancer profile
└── Organization persona → Active membership + Organization profile
```

The account remains the authentication principal. A persona is an authorization and presentation context, never a second login account.

## Data architecture

- `PersonalIdentity` owns personal identity, locale, timezone, country and optional phone data independently of marketplace profiles.
- `OnboardingProgress` records guided-onboarding status, stage and selected persona types.
- `AccountPersona` is the canonical persona registry. Every persona belongs to exactly one user and one tenant organization context.
- `ClientProfile` is the account's personal hiring profile.
- The existing `FreelancerProfile` remains the provider profile and now has an optional unique `personaId` foundation link.
- An organization persona uses the existing `Organization`, `CompanyProfile` and active `Membership` records; organization identity is not duplicated.
- `PersonaEvent` records activation, reactivation, switching and onboarding-completion evidence.
- `AuthSession.activePersonaId` binds the active persona to the durable server-side session.

Database uniqueness provides one client and one freelancer persona per account, plus one organization persona per account/organization membership. The migration is additive and contains no destructive drop.

## Session and authorization rules

Access tokens contain both `organizationId` and `activePersonaId`. Every authenticated request verifies that both claims exactly match the live `AuthSession`. The active persona must:

1. belong to the authenticated user;
2. be `ACTIVE`;
3. use the session organization context; and
4. have a current active membership in an active organization.

Persona switching updates the session organization and persona together, issues a replacement access cookie, records `PersonaEvent` and `AuditEvent` evidence, and makes the previous access token fail the next server-side context check.

Persona capability is composed with existing RBAC. It never replaces an organization permission:

| Action | Allowed persona | Existing permission still required |
|---|---|---|
| Create marketplace listing | Client, Organization | `marketplace.listing.manage` |
| Submit/manage own proposal | Freelancer | `marketplace.proposal.manage` |
| Review/award proposal | Client, Organization | `marketplace.proposal.review` / governed award checks |
| Manage provider profile | Freelancer activation path | `marketplace.profile.manage` |

## Guided onboarding

`/onboarding` provides bilingual `en-AE` / `ar-AE` identity, persona-selection and profile steps. The API validates and saves bounded data, then validates every selected persona before activation. Completion can select a preferred active persona and immediately binds it to the session.

Activation readiness requires:

- completed personal identity;
- active organization membership;
- client display identity for a client persona;
- provider headline/profile for a freelancer persona; and
- legal organization profile for an organization persona.

`/account/personas` provides later activation and switching without creating another account. The authenticated navbar exposes the active persona and all available active personas on every authenticated page.

## API surface

- `GET /api/personas` — account, onboarding and available persona overview.
- `POST /api/personas/activate` — validate and activate an owned persona.
- `POST /api/personas/switch` — switch the live session to an active owned persona.
- `GET /api/onboarding` — guided-onboarding state.
- `PATCH /api/onboarding` — save identity, selections and profile foundations.
- `POST /api/onboarding/complete` — validate, activate, complete and switch.

Every browser mutation requires the existing session and CSRF protection. Cross-account persona identifiers return denial without changing the session.

## Migration and compatibility

Migration: `20260801090000_dual_profile_marketplace_phase_a`.

Existing accounts are backfilled as completed so deployment does not interrupt released workflows. Existing active memberships create active organization personas, existing users receive a client identity, and existing freelancer profiles receive active freelancer persona links. Existing sessions are not silently rebound; their current tokens remain compatible and receive a persona context through a new login/refresh or an explicit switch.

New registrations keep the existing starter organization, owner RBAC, subscription trial and security behavior. They also receive personal identity, guided-onboarding progress, a draft client persona/profile and an active starter-organization persona.

## Verification

- `npm test` includes Phase A schema, backfill, session-binding, onboarding, authorization and bilingual UI contracts.
- `npm run test:phase-a:runtime` applies all 19 migrations to a new PostgreSQL-compatible database, runs the real seed, boots the application and verifies one-account/three-persona onboarding, activation, switching, cross-account denial and persona-plus-RBAC marketplace behavior.
- Standard Prisma, migration, locale, security, secret, TypeScript, ESLint, production-build and prior-phase regression gates remain required before publication.

The final publication gate passed 73/73 static tests, Prisma validation/client generation, 19 ordered additive migrations, 1,465 bilingual messages per locale, 206-route API security review, a 1,297-file secret scan, TypeScript, ESLint, supply-chain integrity, zero-vulnerability full and production audits, the Phase 2-10 compatibility runtimes, and all 306 production-build generation units.

## Explicitly deferred

Phase A does not implement the full client dashboard, freelancer dashboard, public profile pages, reviews, contract persona workflows, AI profile features, marketplace redesign or expanded global search. Those product layers can consume this foundation in later phases.
