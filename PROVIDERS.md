# External Provider Contracts

The application owns business state and exposes provider-neutral interfaces in `src/lib/providers/integrations.ts`. Credentials are read only from runtime environment variables and never stored in source or tenant JSON.

## Storage signing broker

Required: `STORAGE_PROVIDER_KEY`, `STORAGE_SIGNING_ENDPOINT`, `STORAGE_SIGNING_TOKEN`.

The broker implements `POST /v1/sign/upload` and `/v1/sign/download` and returns `{ url, method, headers, expiresAt }`. Upload intents store an opaque tenant-prefixed key and SHA-256 checksum. A separate scanner must update `FileVersion.scanStatus`; downloads fail until it is `CLEAN`.

## AI provider

Required: `AI_PROVIDER_KEY`, `AI_PROVIDER_BASE_URL`, `AI_PROVIDER_API_KEY` plus an enabled tenant `AiTenantConfig` and model.

The adapter uses the OpenAI-compatible `/chat/completions` contract. It can target any compatible private or managed provider. Runs require tenant policy, an allowed use case, optional human approval, monthly budget availability, and the internal worker. Inputs/outputs, usage, and audit remain tenant-scoped.

## Payment provider

Required: `PAYMENT_PROVIDER_KEY`, `PAYMENT_PROVIDER_BASE_URL`, `PAYMENT_PROVIDER_API_KEY`, `PAYMENT_WEBHOOK_SECRET`.

The broker implements `POST /v1/charges`, preserves the supplied idempotency key, and returns `{ providerReference, status, raw }`. Webhooks require `x-provider-event-id` and a lowercase/uppercase hexadecimal SHA-256 HMAC in `x-provider-signature`. Receipts are deduplicated by provider/event ID.

Provider credentials, merchant onboarding, KYC/AML approval, tax configuration, storage bucket policy, malware-scanner credentials, email/SMS credentials, and production DNS/TLS are external deployment requirements.
