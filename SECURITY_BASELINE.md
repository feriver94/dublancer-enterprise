# Dublancer Enterprise v1.0 Security Baseline

## Trust boundaries

Every business request is evaluated inside an authenticated user, organization, and permission context. Project resources add project-role checks. Internal workers and regional cache invalidation use dedicated constant-time secret authentication. Webhooks use provider-specific signatures and idempotency. Tenant identifiers received from clients do not replace server-resolved tenant context.

## Identity and session controls

- Password authentication uses Argon2 and protected reset/verification flows.
- OIDC discovery/JWKS/PKCE and SAML assertion validation are tenant-scoped.
- JIT and SCIM provisioning follow organization policy and are audited.
- TOTP secrets are encrypted, backup codes are hashed and single use, WebAuthn counters prevent replay, and passkey/device evidence is retained.
- Sessions carry authentication method/assurance, idle expiry, device state, rotation/revocation, and step-up/PAM controls.
- Privileged actions require the established permission model and, where configured, AAL2/PAM approval.

## Authorization and tenant isolation

- Central permission resolution and default enterprise roles are authoritative.
- Organization queries include the authenticated organization; project queries additionally enforce owner/membership role.
- Platform-admin behavior is explicit, not inferred from client input.
- Project owner access is immutable through member management; member role/removal actions require owner/manager access and create activity evidence.
- Search federation filters organization, required permission, project, file, locale, and entity type after validating provider responses.
- SCIM, CRM, talent, knowledge, integrations, files, commercial, AI, observability, and operations services preserve tenant boundaries.

## HTTP and application security

- Cookie-authenticated mutations require CSRF tokens.
- Cookies use secure attributes appropriate to production.
- Redirects are constrained to safe application paths.
- Inputs use bounded Zod validation; JSON/body/list limits are explicit.
- Internal endpoints are documented exemptions from cookie/CSRF checks and use dedicated shared-secret validation.
- SSRF-capable integration/federation destinations use protocol/host controls, bounded timeouts, and redirect refusal.
- Security headers, CSP, frame restrictions, content-type protection, referrer policy, and permissions policy are managed in the Next.js configuration.
- Upload/download, locks, checksums, signed intents, scan evidence, retention, and legal holds follow the governed file model.

## Cryptography and secrets

- Production secrets originate in an approved secret manager and are never committed.
- Required secrets/peppers contain at least 32 characters; encryption keys meet their algorithm-specific format/length.
- Identity/TOTP/integration credential material is encrypted or one-way hashed as appropriate.
- API keys, backup codes, webhook/payment signatures, and internal secrets are compared without timing-sensitive plaintext equality.
- Secret rotation includes current/next overlap where the provider/protocol requires it, session/key revocation, and audit evidence.
- Backup artifacts are encrypted before leaving the controlled runtime and stored independently by region.

## Infrastructure baseline

- Image runs as UID/GID 1001 with no privilege escalation and all Linux capabilities dropped.
- Root filesystem is read-only; only `/tmp` is writable.
- Service account token automount is disabled.
- NetworkPolicy limits ingress to the ingress namespace and egress to DNS, PostgreSQL, Redis, HTTPS, and OTLP ports.
- Pods spread across zones, use resource requests/limits, health probes, graceful termination, and disruption controls.
- Images are built from the release lockfile, scanned/signed, and deployed by digest.
- Production endpoints use TLS; regional internal/federation endpoints require HTTPS.

## Supply-chain baseline

- Node.js `>=24 <25`, npm `>=11 <12`, and `packageManager: npm@11.9.0`.
- Lockfile version 3; non-bundled packages resolve only from `https://registry.npmjs.org/` with SHA-512 integrity.
- Bundled package entries inherit the signed/integrity-covered parent package artifact.
- Install begins with `npm ci --ignore-scripts`; `scripts/verify-supply-chain.mjs` validates provenance/integrity and the exact lifecycle allowlist before `npm rebuild` executes reviewed scripts.
- Full and production npm audits contain zero advisories at the Phase 10 hardening checkpoint.
- Weekly Dependabot and scheduled supply-chain CI are enabled.
- Dependency overrides exist only for compatible patched transitive releases and are build/test verified.

## Logging, audit, and privacy

Structured logs and telemetry must not contain passwords, keys, tokens, assertion contents, MFA secrets, full payment credentials, or unnecessary personal data. Audit events capture security/business action metadata and actors while following retention policy. External audit exports are signed and monitored. Operators use least-privilege observability permissions.

## Security release gates

```bash
npm ci --ignore-scripts
npm run verify:supply-chain
npm rebuild
npm audit --audit-level=low
npm run verify:security
npm run verify:secrets
npm test
npm run typecheck
npm run lint
npm run build
```

In addition, run all migrations/seed and runtime isolation/permission regressions on a fresh database. Production acceptance requires image scan/signature verification, environment validation, secret-manager policy, network controls, alert delivery, backup restore evidence, and an approved change record.

## Vulnerability and incident handling

Triage critical/high findings immediately against exploitability and affected runtime paths. Prefer compatible upgrades; do not apply automated major/downgrade fixes without migration testing. Revoke exposed credentials, preserve evidence, assess tenant/customer impact, notify according to policy, and document corrective controls. Security exceptions require an owner, compensating control, expiry, and approval; v1.0 ships with no npm advisory exception.
