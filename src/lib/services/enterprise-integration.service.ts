import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import type { TenantContext } from "@/lib/tenancy/context";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-box";
import { withPerformanceProfile } from "@/lib/services/platform-reliability.service";
import { incrementMetric, observeMetric } from "@/lib/observability/metrics";
import { withSpan } from "@/lib/observability/telemetry";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function apiKeyPepper() {
  const configured = process.env.INTEGRATION_API_KEY_PEPPER;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("INTEGRATION_API_KEY_PEPPER is required in production.");
  }
  return "dublancer-development-integration-api-key-pepper";
}

function secretHash(secret: string) {
  return createHmac("sha256", apiKeyPepper()).update(secret).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parseApiKey(value: string) {
  const match = /^dpk_([a-f0-9]{12})\.([A-Za-z0-9_-]{32,})$/.exec(value);
  return match ? { prefix: match[1], secret: match[2] } : null;
}

function privateAddress(address: string) {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
  if (address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) {
    return true;
  }
  if (!isIP(address)) return false;
  const octets = address.split(".").map(Number);
  if (octets.length !== 4) return false;
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] === 0
  );
}

async function assertOutboundUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Integration URL is invalid.", 422);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Integration URLs must use HTTP or HTTPS.",
      422,
    );
  }
  if (process.env.INTEGRATION_ALLOW_PRIVATE_NETWORK === "true") return url;
  const hostname = url.hostname.toLocaleLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    privateAddress(hostname)
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Private-network integration endpoints require explicit deployment approval.",
      403,
    );
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Integration endpoint DNS resolution failed.",
      503,
    );
  }
  if (!addresses.length || addresses.some((row) => privateAddress(row.address))) {
    throw new AppError(
      "FORBIDDEN",
      "Integration endpoint resolved to a restricted network.",
      403,
    );
  }
  return url;
}

async function audit(
  organizationId: string,
  actorUserId: string | null,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: unknown,
) {
  await prisma.auditEvent.create({
    data: {
      organizationId,
      actorUserId,
      action,
      resourceType,
      resourceId,
      outcome: "SUCCESS",
      metadata: metadata === undefined ? undefined : json(metadata),
    },
  });
}

function encryptedJson(value?: Record<string, string>) {
  return value && Object.keys(value).length
    ? encryptSecret(JSON.stringify(value))
    : undefined;
}

function decryptedJson(value?: string | null) {
  if (!value) return {} as Record<string, string>;
  const parsed = JSON.parse(decryptSecret(value)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Encrypted integration configuration is invalid.");
  }
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string",
    ),
  );
}

function eventMatches(
  payload: unknown,
  filters: unknown,
) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return true;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const payloadRecord = payload as Record<string, unknown>;
  return Object.entries(filters).every(
    ([key, expected]) =>
      JSON.stringify(payloadRecord[key]) === JSON.stringify(expected),
  );
}

function responsePayload(raw: string, contentType: string | null) {
  const compact = raw.slice(0, 250_000);
  if (contentType?.includes("json")) {
    try {
      return json(JSON.parse(compact));
    } catch {}
  }
  return json({ body: compact });
}

export class EnterpriseIntegrationService {
  async dashboard(context: TenantContext) {
    await requirePermission(context, "integrations.read");
    return withPerformanceProfile(
      {
        operation: "phase9.integrations.dashboard",
        organizationId: context.organizationId,
      },
      async () => {
        const [
          connectors,
          apiKeys,
          oauth,
          webhooks,
          subscriptions,
          events,
          deliveries,
          runs,
          deliveryCounts,
          runCounts,
        ] = await Promise.all([
          prisma.integrationConnector.findMany({
            where: { organizationId: context.organizationId },
            select: {
              id: true,
              name: true,
              key: true,
              type: true,
              status: true,
              baseUrl: true,
              method: true,
              path: true,
              authType: true,
              requestTimeoutMs: true,
              maxAttempts: true,
              mapping: true,
              createdAt: true,
              updatedAt: true,
              _count: { select: { runs: true, subscriptions: true } },
            },
            orderBy: { updatedAt: "desc" },
          }),
          prisma.integrationApiKey.findMany({
            where: { organizationId: context.organizationId },
            select: {
              id: true,
              name: true,
              prefix: true,
              scopes: true,
              status: true,
              expiresAt: true,
              lastUsedAt: true,
              revokedAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          }),
          prisma.oAuthIntegration.findMany({
            where: { organizationId: context.organizationId },
            select: {
              id: true,
              connectorId: true,
              provider: true,
              name: true,
              clientId: true,
              authorizationUrl: true,
              tokenUrl: true,
              scopes: true,
              status: true,
              tokenExpiresAt: true,
              externalAccountReference: true,
              lastRefreshedAt: true,
              lastError: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
          }),
          prisma.integrationWebhookEndpoint.findMany({
            where: { organizationId: context.organizationId },
            select: {
              id: true,
              name: true,
              url: true,
              status: true,
              eventTypes: true,
              maxAttempts: true,
              timeoutMs: true,
              lastSuccessAt: true,
              lastFailureAt: true,
              createdAt: true,
              _count: { select: { subscriptions: true, deliveries: true } },
            },
            orderBy: { updatedAt: "desc" },
          }),
          prisma.integrationEventSubscription.findMany({
            where: { organizationId: context.organizationId },
            include: {
              endpoint: { select: { id: true, name: true, status: true } },
              connector: { select: { id: true, name: true, status: true } },
            },
            orderBy: { updatedAt: "desc" },
          }),
          prisma.integrationEvent.findMany({
            where: { organizationId: context.organizationId },
            include: { _count: { select: { deliveries: true } } },
            orderBy: { occurredAt: "desc" },
            take: 100,
          }),
          prisma.integrationWebhookDelivery.findMany({
            where: { organizationId: context.organizationId },
            include: {
              endpoint: { select: { id: true, name: true } },
              event: { select: { id: true, eventType: true, aggregateType: true } },
              deliveryAttempts: { orderBy: { attempt: "desc" }, take: 5 },
            },
            orderBy: { updatedAt: "desc" },
            take: 100,
          }),
          prisma.integrationRun.findMany({
            where: { organizationId: context.organizationId },
            include: {
              connector: { select: { id: true, name: true, type: true } },
              runAttempts: { orderBy: { attempt: "desc" }, take: 5 },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
          prisma.integrationWebhookDelivery.groupBy({
            by: ["status"],
            where: { organizationId: context.organizationId },
            _count: true,
          }),
          prisma.integrationRun.groupBy({
            by: ["status"],
            where: { organizationId: context.organizationId },
            _count: true,
          }),
        ]);
        return {
          connectors,
          apiKeys,
          oauth,
          webhooks,
          subscriptions,
          events,
          deliveries,
          runs,
          monitoring: { deliveryCounts, runCounts },
        };
      },
    );
  }

  async createConnector(
    context: TenantContext,
    input: {
      name: string;
      key: string;
      type: "REST" | "IMPORT" | "EXPORT";
      baseUrl: string;
      method: "GET" | "POST" | "PUT" | "PATCH";
      path: string;
      authType: "NONE" | "API_KEY" | "BEARER" | "BASIC" | "OAUTH2";
      authConfig?: Record<string, string>;
      defaultHeaders?: Record<string, string>;
      requestTimeoutMs: number;
      maxAttempts: number;
      mapping?: Record<string, unknown>;
      activate: boolean;
    },
  ) {
    await requirePermission(context, "integrations.manage");
    await assertOutboundUrl(new URL(input.path, input.baseUrl).toString());
    if (input.authType !== "NONE" && input.authType !== "OAUTH2" && !input.authConfig) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Connector authentication configuration is required.",
        422,
      );
    }
    const connector = await prisma.integrationConnector.create({
      data: {
        organizationId: context.organizationId,
        createdById: context.userId,
        name: input.name,
        key: input.key,
        type: input.type,
        status: input.activate ? "ACTIVE" : "DRAFT",
        baseUrl: input.baseUrl.replace(/\/$/, ""),
        method: input.method,
        path: input.path,
        authType: input.authType,
        authConfigEncrypted: encryptedJson(input.authConfig),
        defaultHeadersEncrypted: encryptedJson(input.defaultHeaders),
        requestTimeoutMs: input.requestTimeoutMs,
        maxAttempts: input.maxAttempts,
        mapping: input.mapping ? json(input.mapping) : undefined,
      },
      select: {
        id: true,
        name: true,
        key: true,
        type: true,
        status: true,
        baseUrl: true,
        method: true,
        path: true,
        authType: true,
        requestTimeoutMs: true,
        maxAttempts: true,
        mapping: true,
        createdAt: true,
      },
    });
    await audit(
      context.organizationId,
      context.userId,
      "integrations.connector.created",
      "IntegrationConnector",
      connector.id,
      { type: connector.type, authType: connector.authType },
    );
    return connector;
  }

  async createApiKey(
    context: TenantContext,
    input: { name: string; scopes: string[]; expiresAt?: string },
  ) {
    await requirePermission(context, "integrations.manage");
    const prefix = randomBytes(6).toString("hex");
    const secret = randomBytes(32).toString("base64url");
    const raw = `dpk_${prefix}.${secret}`;
    const apiKey = await prisma.integrationApiKey.create({
      data: {
        organizationId: context.organizationId,
        createdById: context.userId,
        name: input.name,
        prefix,
        secretHash: secretHash(secret),
        scopes: input.scopes,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    await audit(
      context.organizationId,
      context.userId,
      "integrations.api_key.created",
      "IntegrationApiKey",
      apiKey.id,
      { prefix, scopes: input.scopes },
    );
    return { apiKey, secret: raw };
  }

  async revokeApiKey(context: TenantContext, apiKeyId: string) {
    await requirePermission(context, "integrations.manage");
    const key = await prisma.integrationApiKey.findFirst({
      where: { id: apiKeyId, organizationId: context.organizationId },
      select: { id: true },
    });
    if (!key) throw new AppError("NOT_FOUND", "Integration API key not found.", 404);
    const revoked = await prisma.integrationApiKey.update({
      where: { id: key.id },
      data: { status: "REVOKED", revokedAt: new Date() },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        status: true,
        revokedAt: true,
      },
    });
    await audit(
      context.organizationId,
      context.userId,
      "integrations.api_key.revoked",
      "IntegrationApiKey",
      key.id,
    );
    return revoked;
  }

  async authenticateApiKey(request: Request, requiredScope: string) {
    const authorization = request.headers.get("authorization");
    const parsed = authorization?.startsWith("Bearer ")
      ? parseApiKey(authorization.slice(7))
      : null;
    if (!parsed) throw new AppError("UNAUTHORIZED", "Integration API key required.", 401);
    const key = await prisma.integrationApiKey.findUnique({
      where: { prefix: parsed.prefix },
    });
    const candidateHash = secretHash(parsed.secret);
    if (
      !key ||
      key.status !== "ACTIVE" ||
      (key.expiresAt && key.expiresAt <= new Date()) ||
      !safeEqual(key.secretHash, candidateHash) ||
      !key.scopes.includes(requiredScope)
    ) {
      throw new AppError("UNAUTHORIZED", "Integration API key is invalid.", 401);
    }
    await prisma.integrationApiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      apiKeyId: key.id,
      organizationId: key.organizationId,
      userId: key.createdById,
      scopes: key.scopes,
    };
  }

  async upsertOAuth(
    context: TenantContext,
    input: {
      oauthId?: string;
      connectorId?: string;
      provider: string;
      name: string;
      clientId: string;
      clientSecret?: string;
      authorizationUrl?: string;
      tokenUrl?: string;
      scopes: string[];
      accessToken?: string;
      refreshToken?: string;
      tokenExpiresAt?: string;
      externalAccountReference?: string;
    },
  ) {
    await requirePermission(context, "integrations.manage");
    if (input.connectorId) {
      const connector = await prisma.integrationConnector.findFirst({
        where: { id: input.connectorId, organizationId: context.organizationId },
        select: { id: true },
      });
      if (!connector) throw new AppError("NOT_FOUND", "Integration connector not found.", 404);
    }
    if (input.oauthId) {
      const existing = await prisma.oAuthIntegration.findFirst({
        where: { id: input.oauthId, organizationId: context.organizationId },
      });
      if (!existing) throw new AppError("NOT_FOUND", "OAuth integration not found.", 404);
      const updated = await prisma.oAuthIntegration.update({
        where: { id: existing.id },
        data: {
          connectorId: input.connectorId,
          provider: input.provider,
          name: input.name,
          clientId: input.clientId,
          clientSecretEncrypted: input.clientSecret
            ? encryptSecret(input.clientSecret)
            : existing.clientSecretEncrypted,
          authorizationUrl: input.authorizationUrl,
          tokenUrl: input.tokenUrl,
          scopes: input.scopes,
          accessTokenEncrypted: input.accessToken
            ? encryptSecret(input.accessToken)
            : existing.accessTokenEncrypted,
          refreshTokenEncrypted: input.refreshToken
            ? encryptSecret(input.refreshToken)
            : existing.refreshTokenEncrypted,
          tokenExpiresAt: input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : undefined,
          externalAccountReference: input.externalAccountReference,
          status: input.accessToken ? "ACTIVE" : existing.status,
          lastRefreshedAt: input.accessToken ? new Date() : existing.lastRefreshedAt,
          lastError: null,
        },
        select: {
          id: true,
          provider: true,
          name: true,
          clientId: true,
          scopes: true,
          status: true,
          tokenExpiresAt: true,
          externalAccountReference: true,
          updatedAt: true,
        },
      });
      await audit(
        context.organizationId,
        context.userId,
        "integrations.oauth.updated",
        "OAuthIntegration",
        updated.id,
      );
      return updated;
    }
    const created = await prisma.oAuthIntegration.create({
      data: {
        organizationId: context.organizationId,
        connectorId: input.connectorId,
        connectedById: context.userId,
        provider: input.provider,
        name: input.name,
        clientId: input.clientId,
        clientSecretEncrypted: input.clientSecret
          ? encryptSecret(input.clientSecret)
          : undefined,
        authorizationUrl: input.authorizationUrl,
        tokenUrl: input.tokenUrl,
        scopes: input.scopes,
        accessTokenEncrypted: input.accessToken
          ? encryptSecret(input.accessToken)
          : undefined,
        refreshTokenEncrypted: input.refreshToken
          ? encryptSecret(input.refreshToken)
          : undefined,
        tokenExpiresAt: input.tokenExpiresAt
          ? new Date(input.tokenExpiresAt)
          : undefined,
        externalAccountReference: input.externalAccountReference,
        status: input.accessToken ? "ACTIVE" : "PENDING",
        lastRefreshedAt: input.accessToken ? new Date() : undefined,
      },
      select: {
        id: true,
        provider: true,
        name: true,
        clientId: true,
        scopes: true,
        status: true,
        tokenExpiresAt: true,
        externalAccountReference: true,
        createdAt: true,
      },
    });
    await audit(
      context.organizationId,
      context.userId,
      "integrations.oauth.created",
      "OAuthIntegration",
      created.id,
    );
    return created;
  }

  async createWebhook(
    context: TenantContext,
    input: {
      name: string;
      url: string;
      eventTypes: string[];
      maxAttempts: number;
      timeoutMs: number;
    },
  ) {
    await requirePermission(context, "integrations.manage");
    await assertOutboundUrl(input.url);
    const secret = randomBytes(32).toString("base64url");
    const endpoint = await prisma.integrationWebhookEndpoint.create({
      data: {
        organizationId: context.organizationId,
        createdById: context.userId,
        name: input.name,
        url: input.url,
        secretEncrypted: encryptSecret(secret),
        eventTypes: [...new Set(input.eventTypes)],
        maxAttempts: input.maxAttempts,
        timeoutMs: input.timeoutMs,
      },
      select: {
        id: true,
        name: true,
        url: true,
        status: true,
        eventTypes: true,
        maxAttempts: true,
        timeoutMs: true,
        createdAt: true,
      },
    });
    await audit(
      context.organizationId,
      context.userId,
      "integrations.webhook.created",
      "IntegrationWebhookEndpoint",
      endpoint.id,
      { eventTypes: endpoint.eventTypes },
    );
    return { endpoint, secret };
  }

  async createSubscription(
    context: TenantContext,
    input: {
      eventType: string;
      endpointId?: string;
      connectorId?: string;
      filters?: Record<string, unknown>;
    },
  ) {
    await requirePermission(context, "integrations.manage");
    if (Boolean(input.endpointId) === Boolean(input.connectorId)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "An event subscription must target exactly one webhook or connector.",
        422,
      );
    }
    const [endpoint, connector] = await Promise.all([
      input.endpointId
        ? prisma.integrationWebhookEndpoint.findFirst({
            where: {
              id: input.endpointId,
              organizationId: context.organizationId,
              status: "ACTIVE",
            },
            select: { id: true, eventTypes: true },
          })
        : Promise.resolve(null),
      input.connectorId
        ? prisma.integrationConnector.findFirst({
            where: {
              id: input.connectorId,
              organizationId: context.organizationId,
              status: "ACTIVE",
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if ((input.endpointId && !endpoint) || (input.connectorId && !connector)) {
      throw new AppError("NOT_FOUND", "Active integration target not found.", 404);
    }
    if (
      endpoint &&
      !endpoint.eventTypes.includes("*") &&
      !endpoint.eventTypes.includes(input.eventType)
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Webhook endpoint does not allow this event type.",
        422,
      );
    }
    const duplicate = await prisma.integrationEventSubscription.findFirst({
      where: {
        organizationId: context.organizationId,
        eventType: input.eventType,
        endpointId: input.endpointId ?? null,
        connectorId: input.connectorId ?? null,
      },
      select: { id: true },
    });
    if (duplicate) throw new AppError("CONFLICT", "Event subscription already exists.", 409);
    const subscription = await prisma.integrationEventSubscription.create({
      data: {
        organizationId: context.organizationId,
        eventType: input.eventType,
        endpointId: input.endpointId,
        connectorId: input.connectorId,
        filters: input.filters ? json(input.filters) : undefined,
      },
    });
    await audit(
      context.organizationId,
      context.userId,
      "integrations.subscription.created",
      "IntegrationEventSubscription",
      subscription.id,
    );
    return subscription;
  }

  async publishEvent(
    context: TenantContext,
    input: {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
      correlationId?: string;
    },
  ) {
    await requirePermission(context, "integrations.execute");
    return this.publishAuthorizedEvent(
      context.organizationId,
      context.userId,
      input,
    );
  }

  async publishAuthorizedEvent(
    organizationId: string,
    actorUserId: string,
    input: {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
      correlationId?: string;
    },
  ) {
    const subscriptions = await prisma.integrationEventSubscription.findMany({
      where: {
        organizationId,
        enabled: true,
        eventType: { in: [input.eventType, "*"] },
        OR: [
          { endpoint: { status: "ACTIVE" } },
          { connector: { status: "ACTIVE" } },
        ],
      },
      include: { endpoint: true, connector: true },
    });
    const payload = json(input.payload);
    const matched = subscriptions.filter((subscription) =>
      eventMatches(payload, subscription.filters),
    );
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.integrationEvent.create({
        data: {
          organizationId,
          eventType: input.eventType,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          payload,
          correlationId: input.correlationId,
          status: matched.length ? "PENDING" : "DELIVERED",
          deliveredAt: matched.length ? undefined : new Date(),
        },
      });
      const endpoints = matched.flatMap((subscription) =>
        subscription.endpoint
          ? [{
              organizationId,
              eventId: created.id,
              endpointId: subscription.endpoint.id,
              maxAttempts: subscription.endpoint.maxAttempts,
            }]
          : [],
      );
      if (endpoints.length) {
        await tx.integrationWebhookDelivery.createMany({
          data: endpoints,
          skipDuplicates: true,
        });
      }
      for (const subscription of matched) {
        if (!subscription.connector) continue;
        await tx.integrationRun.create({
          data: {
            organizationId,
            connectorId: subscription.connector.id,
            requestedById: actorUserId,
            idempotencyKey: `event:${created.id}:${subscription.connector.id}`,
            direction: subscription.connector.type,
            requestPayload: json({
              eventId: created.id,
              eventType: input.eventType,
              aggregateType: input.aggregateType,
              aggregateId: input.aggregateId,
              payload: input.payload,
            }),
            maxAttempts: subscription.connector.maxAttempts,
          },
        });
      }
      return created;
    });
    await audit(
      organizationId,
      actorUserId,
      "integrations.event.published",
      "IntegrationEvent",
      event.id,
      { subscriptions: matched.length },
    );
    incrementMetric("dublancer_integration_events_total", {
      event_type: input.eventType,
      matched: matched.length ? "true" : "false",
    });
    return {
      event,
      subscriptionCount: matched.length,
      webhookCount: matched.filter((row) => row.endpoint).length,
      connectorCount: matched.filter((row) => row.connector).length,
    };
  }

  async executeConnector(
    context: TenantContext,
    input: {
      connectorId: string;
      idempotencyKey: string;
      payload?: Record<string, unknown>;
    },
  ) {
    await requirePermission(context, "integrations.execute");
    const connector = await prisma.integrationConnector.findFirst({
      where: {
        id: input.connectorId,
        organizationId: context.organizationId,
        status: "ACTIVE",
      },
    });
    if (!connector) throw new AppError("NOT_FOUND", "Active connector not found.", 404);
    const run = await prisma.integrationRun.upsert({
      where: {
        organizationId_idempotencyKey: {
          organizationId: context.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        organizationId: context.organizationId,
        connectorId: connector.id,
        requestedById: context.userId,
        idempotencyKey: input.idempotencyKey,
        direction: connector.type,
        requestPayload: input.payload ? json(input.payload) : undefined,
        maxAttempts: connector.maxAttempts,
      },
      update: {},
    });
    if (run.connectorId !== connector.id) {
      throw new AppError(
        "CONFLICT",
        "The idempotency key belongs to another connector execution.",
        409,
      );
    }
    return this.processRun(run.id);
  }

  private async connectorHeaders(
    connector: Prisma.IntegrationConnectorGetPayload<Record<string, never>>,
  ) {
    const headers: Record<string, string> = {
      accept: "application/json",
      ...decryptedJson(connector.defaultHeadersEncrypted),
    };
    const auth = decryptedJson(connector.authConfigEncrypted);
    if (connector.authType === "API_KEY") {
      const headerName = auth.headerName ?? "x-api-key";
      if (!auth.value) throw new Error("Connector API key is not configured.");
      headers[headerName] = auth.value;
    }
    if (connector.authType === "BEARER") {
      if (!auth.token) throw new Error("Connector bearer token is not configured.");
      headers.authorization = `Bearer ${auth.token}`;
    }
    if (connector.authType === "BASIC") {
      if (!auth.username || !auth.password) {
        throw new Error("Connector basic credentials are not configured.");
      }
      headers.authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`;
    }
    if (connector.authType === "OAUTH2") {
      const oauth = await prisma.oAuthIntegration.findFirst({
        where: {
          connectorId: connector.id,
          organizationId: connector.organizationId,
          status: "ACTIVE",
        },
        orderBy: { updatedAt: "desc" },
      });
      if (
        !oauth?.accessTokenEncrypted ||
        (oauth.tokenExpiresAt && oauth.tokenExpiresAt <= new Date())
      ) {
        throw new Error("Connector OAuth token is unavailable or expired.");
      }
      headers.authorization = `Bearer ${decryptSecret(oauth.accessTokenEncrypted)}`;
    }
    return headers;
  }

  private async processRun(runId: string) {
    const run = await prisma.integrationRun.findUnique({
      where: { id: runId },
      include: { connector: true },
    });
    if (!run) throw new AppError("NOT_FOUND", "Integration run not found.", 404);
    if (["SUCCEEDED", "CANCELLED"].includes(run.status)) return run;
    if (run.availableAt > new Date()) return run;
    const claimed = await prisma.integrationRun.updateMany({
      where: {
        id: run.id,
        status: { in: ["PENDING", "FAILED"] },
        availableAt: { lte: new Date() },
      },
      data: { status: "RUNNING", startedAt: run.startedAt ?? new Date() },
    });
    if (claimed.count !== 1) {
      return prisma.integrationRun.findUniqueOrThrow({ where: { id: run.id } });
    }
    const attempt = run.attempts + 1;
    const started = performance.now();
    await prisma.integrationRunAttempt.create({
      data: {
        runId: run.id,
        attempt,
        status: "STARTED",
        request: run.requestPayload ?? undefined,
      },
    });
    try {
      const target = await assertOutboundUrl(
        new URL(run.connector.path, `${run.connector.baseUrl}/`).toString(),
      );
      const headers = await this.connectorHeaders(run.connector);
      const hasBody = run.connector.method !== "GET";
      if (hasBody) headers["content-type"] = "application/json";
      const response = await withSpan(
        "phase9.integration.connector",
        {
          "dublancer.organization.id": run.organizationId,
          "dublancer.connector.id": run.connectorId,
          "dublancer.integration.run.id": run.id,
          "http.request.method": run.connector.method,
        },
        () =>
          fetch(target, {
            method: run.connector.method,
            headers,
            ...(hasBody
              ? { body: JSON.stringify(run.requestPayload ?? {}) }
              : {}),
            signal: AbortSignal.timeout(run.connector.requestTimeoutMs),
          }),
      );
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`Connector returned HTTP ${response.status}: ${raw.slice(0, 1_000)}`);
      }
      const result = responsePayload(raw, response.headers.get("content-type"));
      const durationMs = Math.round(performance.now() - started);
      await prisma.$transaction([
        prisma.integrationRunAttempt.update({
          where: { runId_attempt: { runId: run.id, attempt } },
          data: {
            status: "SUCCEEDED",
            response: result,
            responseCode: response.status,
            durationMs,
            completedAt: new Date(),
          },
        }),
        prisma.integrationRun.update({
          where: { id: run.id },
          data: {
            status: "SUCCEEDED",
            attempts: attempt,
            responsePayload: result,
            recordsRead: run.connector.type === "IMPORT" ? 1 : 0,
            recordsWritten: run.connector.type === "EXPORT" ? 1 : 0,
            completedAt: new Date(),
            lastError: null,
          },
        }),
      ]);
      observeMetric("dublancer_integration_duration_ms", durationMs, {
        connector_type: run.connector.type,
        outcome: "success",
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      const message =
        error instanceof Error ? error.message.slice(0, 2_000) : "Unknown connector error";
      const exhausted = attempt >= run.maxAttempts;
      await prisma.$transaction([
        prisma.integrationRunAttempt.update({
          where: { runId_attempt: { runId: run.id, attempt } },
          data: {
            status: "FAILED",
            durationMs,
            error: message,
            completedAt: new Date(),
          },
        }),
        prisma.integrationRun.update({
          where: { id: run.id },
          data: {
            status: exhausted ? "FAILED" : "PENDING",
            attempts: attempt,
            availableAt: exhausted
              ? new Date()
              : new Date(Date.now() + Math.min(300_000, 2 ** attempt * 1_000)),
            completedAt: exhausted ? new Date() : null,
            lastError: message,
          },
        }),
      ]);
      observeMetric("dublancer_integration_duration_ms", durationMs, {
        connector_type: run.connector.type,
        outcome: exhausted ? "failed" : "retry",
      });
    }
    return prisma.integrationRun.findUniqueOrThrow({
      where: { id: run.id },
      include: { runAttempts: { orderBy: { attempt: "asc" } } },
    });
  }

  private async processDelivery(deliveryId: string) {
    const delivery = await prisma.integrationWebhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { endpoint: true, event: true },
    });
    if (!delivery || delivery.status === "SUCCEEDED") return delivery;
    if (delivery.nextAttemptAt > new Date()) return delivery;
    const claimed = await prisma.integrationWebhookDelivery.updateMany({
      where: {
        id: delivery.id,
        status: { in: ["PENDING", "RETRYING", "FAILED"] },
        nextAttemptAt: { lte: new Date() },
      },
      data: { status: "PROCESSING" },
    });
    if (claimed.count !== 1) {
      return prisma.integrationWebhookDelivery.findUnique({ where: { id: delivery.id } });
    }
    const attempt = delivery.attempts + 1;
    const envelope = {
      id: delivery.event.id,
      type: delivery.event.eventType,
      aggregateType: delivery.event.aggregateType,
      aggregateId: delivery.event.aggregateId,
      occurredAt: delivery.event.occurredAt.toISOString(),
      payload: delivery.event.payload,
    };
    const raw = JSON.stringify(envelope);
    const signature = createHmac(
      "sha256",
      decryptSecret(delivery.endpoint.secretEncrypted),
    )
      .update(raw)
      .digest("hex");
    const started = performance.now();
    await prisma.integrationWebhookDeliveryAttempt.create({
      data: { deliveryId: delivery.id, attempt, status: "STARTED" },
    });
    try {
      await assertOutboundUrl(delivery.endpoint.url);
      const response = await withSpan(
        "phase9.integration.webhook",
        {
          "dublancer.organization.id": delivery.organizationId,
          "dublancer.integration.delivery.id": delivery.id,
          "dublancer.integration.event.type": delivery.event.eventType,
        },
        () =>
          fetch(delivery.endpoint.url, {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              "x-dublancer-event-id": delivery.event.id,
              "x-dublancer-event-type": delivery.event.eventType,
              "x-dublancer-signature-256": `sha256=${signature}`,
            },
            body: raw,
            signal: AbortSignal.timeout(delivery.endpoint.timeoutMs),
          }),
      );
      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`Webhook returned HTTP ${response.status}: ${responseText.slice(0, 1_000)}`);
      }
      const durationMs = Math.round(performance.now() - started);
      await prisma.$transaction([
        prisma.integrationWebhookDeliveryAttempt.update({
          where: { deliveryId_attempt: { deliveryId: delivery.id, attempt } },
          data: {
            status: "SUCCEEDED",
            responseCode: response.status,
            durationMs,
            completedAt: new Date(),
          },
        }),
        prisma.integrationWebhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "SUCCEEDED",
            attempts: attempt,
            responseCode: response.status,
            lastError: null,
            deliveredAt: new Date(),
          },
        }),
        prisma.integrationWebhookEndpoint.update({
          where: { id: delivery.endpointId },
          data: { lastSuccessAt: new Date() },
        }),
      ]);
      observeMetric("dublancer_webhook_delivery_duration_ms", durationMs, {
        outcome: "success",
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - started);
      const message =
        error instanceof Error ? error.message.slice(0, 2_000) : "Unknown webhook error";
      const exhausted = attempt >= delivery.maxAttempts;
      await prisma.$transaction([
        prisma.integrationWebhookDeliveryAttempt.update({
          where: { deliveryId_attempt: { deliveryId: delivery.id, attempt } },
          data: {
            status: "FAILED",
            durationMs,
            error: message,
            completedAt: new Date(),
          },
        }),
        prisma.integrationWebhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: exhausted ? "DEAD_LETTER" : "RETRYING",
            attempts: attempt,
            nextAttemptAt: exhausted
              ? new Date()
              : new Date(Date.now() + Math.min(300_000, 2 ** attempt * 1_000)),
            lastError: message,
          },
        }),
        prisma.integrationWebhookEndpoint.update({
          where: { id: delivery.endpointId },
          data: { lastFailureAt: new Date() },
        }),
      ]);
      observeMetric("dublancer_webhook_delivery_duration_ms", durationMs, {
        outcome: exhausted ? "dead_letter" : "retry",
      });
    }
    await this.reconcileEvent(delivery.eventId);
    return prisma.integrationWebhookDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
      include: { deliveryAttempts: { orderBy: { attempt: "asc" } } },
    });
  }

  private async reconcileEvent(eventId: string) {
    const event = await prisma.integrationEvent.findUnique({
      where: { id: eventId },
      include: { deliveries: { select: { status: true } } },
    });
    if (!event || !event.deliveries.length) return;
    const statuses = event.deliveries.map((row) => row.status);
    const terminal = statuses.every((status) =>
      ["SUCCEEDED", "DEAD_LETTER"].includes(status),
    );
    const eventStatus = statuses.every((status) => status === "SUCCEEDED")
      ? "DELIVERED"
      : terminal && statuses.some((status) => status === "SUCCEEDED")
        ? "PARTIAL"
        : terminal
          ? "DEAD_LETTER"
          : "PROCESSING";
    await prisma.integrationEvent.update({
      where: { id: event.id },
      data: {
        status: eventStatus,
        deliveredAt: terminal ? new Date() : null,
      },
    });
  }

  async processDeliveries(limit = 20) {
    const deliveries = await prisma.integrationWebhookDelivery.findMany({
      where: {
        status: { in: ["PENDING", "RETRYING", "FAILED"] },
        nextAttemptAt: { lte: new Date() },
        endpoint: { status: "ACTIVE" },
      },
      select: { id: true },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      take: limit,
    });
    const results = [];
    for (const delivery of deliveries) {
      results.push(await this.processDelivery(delivery.id));
    }
    return { processed: results.length, results };
  }

  async processRuns(limit = 20) {
    const runs = await prisma.integrationRun.findMany({
      where: {
        status: "PENDING",
        availableAt: { lte: new Date() },
        connector: { status: "ACTIVE" },
      },
      select: { id: true },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      take: limit,
    });
    const results = [];
    for (const run of runs) results.push(await this.processRun(run.id));
    return { processed: results.length, results };
  }

  async retryDelivery(context: TenantContext, deliveryId: string) {
    await requirePermission(context, "integrations.manage");
    const delivery = await prisma.integrationWebhookDelivery.findFirst({
      where: {
        id: deliveryId,
        organizationId: context.organizationId,
        status: { in: ["RETRYING", "FAILED", "DEAD_LETTER"] },
      },
    });
    if (!delivery) {
      throw new AppError("NOT_FOUND", "Retryable webhook delivery not found.", 404);
    }
    const retried = await prisma.integrationWebhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "PENDING",
        attempts: delivery.status === "DEAD_LETTER" ? 0 : delivery.attempts,
        nextAttemptAt: new Date(),
        lastError: null,
        deliveredAt: null,
      },
    });
    await audit(
      context.organizationId,
      context.userId,
      "integrations.delivery.retried",
      "IntegrationWebhookDelivery",
      delivery.id,
    );
    return retried;
  }
}
