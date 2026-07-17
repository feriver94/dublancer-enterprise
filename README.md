# Dublancer Final Enterprise Release

Dublancer is a bilingual, UAE-ready enterprise work platform. This repository is the complete coordinated source tree: secure identity and tenancy, marketplace, projects, collaboration, files, contracts, finance, governed AI, durable orchestration, analytics, search, moderation, compliance and administration are integrated in one Next.js and PostgreSQL application.

## Product capabilities

- Signed secure sessions, refresh rotation, account recovery, CSRF, lockout controls, organizations, invitations, RBAC, audit and tenant isolation.
- Marketplace opportunities, profiles, skills, proposals and revisions, saved listings, talent pools, vendor onboarding and explainable matching.
- Project rooms with members, tasks, dependencies, milestones, comments, attachments, time, deliverables, change requests, risk and activity.
- Realtime channels, threads, mentions, reactions, read state, presence, notifications, Redis pub/sub, SSE and transactional outbox delivery.
- Versioned enterprise files, signed transfer boundaries, malware scan states, locks, grants, retention and legal hold.
- Contracts, amendments, milestones, disputes, AED invoices, transactions, refunds, subscriptions, usage, reconciliation, escrow and payment-provider boundaries.
- Governed AI configuration, prompt versions, budgets, approvals, queued runs, usage accounting, knowledge sources and provider-neutral execution.
- Versioned acyclic workflows, idempotent/concurrency-limited runs, step locking/retries, human approvals, work graph and worker authentication.
- Universal tenant search, analytics, security events, feature flags, branding, support, exports, moderation, retention and operations health.
- Complete `en-AE` / `ar-AE` parity, runtime language direction, responsive RTL, `Asia/Dubai` timezone and AED formatting.

Primary authenticated interfaces are available at `/platform`, `/marketplace`, `/workspace`, `/communications/chat`, `/notifications`, `/files`, `/ai-copilot`, `/contracts`, `/payments`, `/billing`, `/orchestration`, `/analytics`, `/search` and `/admin-control`.

## Windows installation

Requirements: Node.js 22+, Docker Desktop, PostgreSQL 15+ and Redis 7+.

```powershell
Expand-Archive .\Dublancer_Final_Enterprise_Release.zip -DestinationPath .\DublancerFinal
Set-Location .\DublancerFinal\dublancer-enterprise
Copy-Item .env.example .env
# Set DATABASE_URL, REDIS_URL and new high-entropy internal/authentication secrets in .env.
npm.cmd ci
npx.cmd prisma validate
npx.cmd prisma generate
npx.cmd prisma migrate deploy
npx.cmd prisma db seed
npm.cmd run dev
```

Open `http://localhost:3000/register`. Registration creates the user's initial UAE-default organization and Owner role.

Run the complete deterministic verifier:

```powershell
.\VERIFY_FINAL_RELEASE.ps1
```

Apply migrations and seed during verification when a disposable PostgreSQL database is configured:

```powershell
.\VERIFY_FINAL_RELEASE.ps1 -ApplyMigration -Seed
```

Provider credentials are not required to compile or start the core platform. Storage transfer, malware scanning, AI completion, payment settlement and outbound notification operations fail closed until their real provider credentials are configured. See `PROVIDERS.md`, `DEPLOYMENT.md`, `FINAL_PRODUCT_STATUS.md` and `VERIFICATION_RESULTS.md`.
