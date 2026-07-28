import { z } from "zod";

const slug = z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const httpsOrLocalUrl = z.string().url().max(2_000);
const assurance = z.enum(["AAL1", "AAL2", "AAL3"]);
const providerFields = {
  type: z.enum(["SAML", "OIDC"]),
  name: z.string().min(2).max(120),
  slug,
  issuer: z.string().min(3).max(1_000),
  entryPoint: httpsOrLocalUrl.optional(),
  callbackUrl: httpsOrLocalUrl,
  idpCertificate: z.string().min(20).max(50_000).optional(),
  oidcDiscoveryUrl: httpsOrLocalUrl.optional(),
  oidcClientId: z.string().min(1).max(500).optional(),
  oidcClientSecret: z.string().min(8).max(4_000).optional(),
  scopes: z.array(z.string().min(1).max(100)).min(1).max(20).optional(),
  requiredAcr: z.string().max(500).optional(),
  assuranceLevel: assurance.optional(),
  attributeMapping: z.record(z.string(), z.unknown()).optional(),
  allowedEmailDomains: z
    .array(z.string().min(3).max(253).toLowerCase())
    .max(100)
    .optional(),
  jitProvisioningEnabled: z.boolean().optional(),
  defaultRoleId: z.string().nullable().optional(),
  wantAssertionsSigned: z.boolean().optional(),
  wantAuthnResponseSigned: z.boolean().optional(),
  validateInResponseTo: z.boolean().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "DISABLED"]).optional(),
};

export const identityAdministrationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("provider.create"), ...providerFields }),
  z.object({
    action: z.literal("provider.update"),
    providerId: z.string().min(1),
    ...Object.fromEntries(
      Object.entries(providerFields).map(([key, value]) => [
        key,
        value.optional(),
      ]),
    ),
  }),
  z.object({
    action: z.literal("provider.delete"),
    providerId: z.string().min(1),
  }),
  z.object({
    action: z.literal("policy.update"),
    requireMfa: z.boolean().optional(),
    requireMfaForPrivileged: z.boolean().optional(),
    allowPasswordLogin: z.boolean().optional(),
    allowPasskeyLogin: z.boolean().optional(),
    requireTrustedDevice: z.boolean().optional(),
    jitProvisioningEnabled: z.boolean().optional(),
    allowedEmailDomains: z.array(z.string().min(3).max(253).toLowerCase()).max(100).optional(),
    defaultRoleId: z.string().nullable().optional(),
    sessionMaxAgeMinutes: z.number().int().min(15).max(43_200).optional(),
    sessionIdleMinutes: z.number().int().min(5).max(10_080).optional(),
    stepUpDurationMinutes: z.number().int().min(5).max(120).optional(),
    minimumAssuranceLevel: assurance.optional(),
  }),
  z.object({
    action: z.literal("scim.token.create"),
    name: z.string().min(2).max(120),
    providerId: z.string().nullable().optional(),
    scopes: z.array(z.enum(["Users.read", "Users.write"])).min(1).max(2).optional(),
    expiresAt: z.coerce.date().nullable().optional(),
  }),
  z.object({
    action: z.literal("scim.token.revoke"),
    tokenId: z.string().min(1),
  }),
]);

export const mfaActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("totp.setup"),
    label: z.string().min(1).max(120).optional(),
  }),
  z.object({
    action: z.literal("totp.verify"),
    factorId: z.string().min(1),
    code: z.string().regex(/^\d{6}$/),
  }),
  z.object({
    action: z.literal("challenge.verify"),
    challengeToken: z.string().min(20).max(500),
    method: z.enum(["TOTP", "BACKUP_CODE"]),
    code: z.string().min(6).max(64),
  }),
  z.object({
    action: z.literal("factor.revoke"),
    factorId: z.string().optional(),
    passkeyId: z.string().optional(),
  }).refine((value) => Boolean(value.factorId || value.passkeyId), {
    message: "A factorId or passkeyId is required.",
  }),
]);

export const passkeyActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("registration.options"),
    label: z.string().min(1).max(120).optional(),
  }),
  z.object({
    action: z.literal("registration.verify"),
    challengeId: z.string().min(1),
    response: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("authentication.options"),
    email: z.string().email().toLowerCase(),
    organizationId: z.string().optional(),
    deviceLabel: z.string().max(120).optional(),
  }),
  z.object({
    action: z.literal("authentication.verify"),
    challengeId: z.string().min(1),
    response: z.record(z.string(), z.unknown()),
  }),
]);

export const sessionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("session.revoke"), sessionId: z.string().min(1) }),
  z.object({ action: z.literal("sessions.revokeOthers") }),
  z.object({ action: z.literal("device.revoke"), deviceId: z.string().min(1) }),
]);

export const pamActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request"),
    permissions: z.array(z.string().min(1).max(120)).min(1).max(25),
    reason: z.string().min(10).max(1_000),
    requestedMinutes: z.number().int().min(5).max(240),
  }),
  z.object({
    action: z.literal("decide"),
    requestId: z.string().min(1),
    decision: z.enum(["APPROVE", "DENY"]),
    note: z.string().max(1_000).optional(),
  }),
  z.object({
    action: z.literal("revoke"),
    grantId: z.string().min(1),
    reason: z.string().min(5).max(1_000),
  }),
  z.object({
    action: z.literal("cancel"),
    requestId: z.string().min(1),
  }),
]);

export const reliabilityActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("slo.upsert"),
    key: slug,
    name: z.string().min(2).max(120),
    description: z.string().max(1_000).optional(),
    indicatorType: z.enum(["AVAILABILITY", "LATENCY", "ERROR_RATE", "QUEUE_AGE"]),
    service: z.string().min(1).max(120),
    target: z.number().positive(),
    latencyThresholdMs: z.number().int().positive().optional(),
    window: z.enum(["ROLLING_1H", "ROLLING_24H", "ROLLING_7D", "ROLLING_30D"]).optional(),
    alertThreshold: z.number().min(0).max(1).optional(),
  }),
  z.object({ action: z.literal("slo.evaluate") }),
  z.object({
    action: z.literal("alertHook.create"),
    name: z.string().min(2).max(120),
    type: z.enum(["WEBHOOK", "EMAIL"]),
    endpoint: httpsOrLocalUrl,
    secret: z.string().min(16).max(4_000).optional(),
    eventTypes: z.array(z.string().min(1).max(120)).max(50).optional(),
    maxAttempts: z.number().int().min(1).max(20).optional(),
  }),
  z.object({
    action: z.literal("auditDestination.create"),
    name: z.string().min(2).max(120),
    type: z.enum(["WEBHOOK", "OBJECT_STORAGE"]),
    endpoint: httpsOrLocalUrl,
    secret: z.string().min(16).max(4_000).optional(),
  }),
  z.object({
    action: z.literal("auditExport.run"),
    destinationId: z.string().min(1),
  }),
  z.object({
    action: z.literal("scalingPolicy.upsert"),
    queue: z.string().min(1).max(100),
    minWorkers: z.number().int().min(0).max(1_000),
    maxWorkers: z.number().int().min(1).max(1_000),
    targetJobsPerWorker: z.number().int().min(1).max(100_000),
    targetOldestJobAgeMs: z.number().int().min(100).max(86_400_000),
    scaleDownCooldownMs: z.number().int().min(1_000).max(86_400_000).optional(),
    enabled: z.boolean().optional(),
  }),
  z.object({ action: z.literal("scaling.evaluate") }),
  z.object({
    action: z.literal("loadTest.plan"),
    name: z.string().min(2).max(120),
    targetUrl: httpsOrLocalUrl,
    scenario: z.string().min(2).max(120),
    concurrency: z.number().int().min(1).max(500),
    durationSeconds: z.number().int().min(1).max(3_600),
  }),
]);
