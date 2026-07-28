import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { SAML, ValidateInResponseTo } from "@node-saml/node-saml";
import type { CacheItem, CacheProvider } from "@node-saml/node-saml";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { requirePermission } from "@/lib/authorization/permission-resolver";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-box";
import { AuthService } from "@/lib/services/auth.service";
import { MfaPasskeyService } from "@/lib/services/mfa-passkey.service";

type ProviderInput = {
  type: "SAML" | "OIDC";
  name: string;
  slug: string;
  issuer: string;
  entryPoint?: string;
  callbackUrl: string;
  idpCertificate?: string;
  oidcDiscoveryUrl?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  scopes?: string[];
  requiredAcr?: string;
  assuranceLevel?: "AAL1" | "AAL2" | "AAL3";
  attributeMapping?: Record<string, unknown>;
  allowedEmailDomains?: string[];
  jitProvisioningEnabled?: boolean;
  defaultRoleId?: string | null;
  wantAssertionsSigned?: boolean;
  wantAuthnResponseSigned?: boolean;
  validateInResponseTo?: boolean;
  status?: "DRAFT" | "ACTIVE" | "DISABLED";
};

type RequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function safeReturnTo(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value.slice(0, 500);
}

function ensureProviderUrl(value: string, label: string) {
  const url = new URL(value);
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:"
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${label} must use HTTPS in production.`,
      422,
    );
  }
  return url;
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Provider returned HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

class PrismaSamlCache implements CacheProvider {
  constructor(
    private readonly providerId: string,
    private readonly attemptId?: string,
  ) {}

  async saveAsync(key: string, value: string): Promise<CacheItem | null> {
    if (!this.attemptId) return null;
    await prisma.identityLoginAttempt.update({
      where: { id: this.attemptId },
      data: { samlRequestId: key },
    });
    return { value, createdAt: Date.now() };
  }

  async getAsync(key: string): Promise<string | null> {
    const attempt = await prisma.identityLoginAttempt.findFirst({
      where: {
        providerId: this.providerId,
        samlRequestId: key,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    return attempt ? key : null;
  }

  async removeAsync(key: string | null): Promise<string | null> {
    return key;
  }
}

export class FederatedIdentityService {
  async dashboard(context: TenantContext) {
    await requirePermission(context, "identity.read");
    const [
      policy,
      providers,
      identities,
      sessions,
      scimTokens,
      pamRequests,
      pamGrants,
    ] = await Promise.all([
      prisma.organizationIdentityPolicy.findUnique({
        where: { organizationId: context.organizationId },
      }),
      prisma.identityProvider.findMany({
        where: { organizationId: context.organizationId },
        select: {
          id: true,
          type: true,
          status: true,
          name: true,
          slug: true,
          issuer: true,
          entryPoint: true,
          callbackUrl: true,
          oidcDiscoveryUrl: true,
          oidcClientId: true,
          scopes: true,
          requiredAcr: true,
          assuranceLevel: true,
          allowedEmailDomains: true,
          jitProvisioningEnabled: true,
          defaultRoleId: true,
          wantAssertionsSigned: true,
          wantAuthnResponseSigned: true,
          validateInResponseTo: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              externalIdentities: true,
              loginAttempts: true,
              scimTokens: true,
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.externalIdentity.findMany({
        where: {
          provider: { organizationId: context.organizationId },
        },
        select: {
          id: true,
          email: true,
          subject: true,
          lastAuthenticatedAt: true,
          provider: { select: { name: true, type: true } },
          user: { select: { id: true, displayName: true } },
        },
        orderBy: { lastAuthenticatedAt: "desc" },
        take: 100,
      }),
      prisma.authSession.findMany({
        where: {
          organizationId: context.organizationId,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          userId: true,
          authMethod: true,
          assuranceLevel: true,
          deviceLabel: true,
          ipAddress: true,
          lastSeenAt: true,
          expiresAt: true,
          trustedDeviceId: true,
          user: { select: { email: true, displayName: true } },
        },
        orderBy: { lastSeenAt: "desc" },
        take: 100,
      }),
      prisma.scimAccessToken.findMany({
        where: {
          organizationId: context.organizationId,
          revokedAt: null,
        },
        select: {
          id: true,
          name: true,
          tokenPrefix: true,
          scopes: true,
          expiresAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.privilegedAccessRequest.findMany({
        where: { organizationId: context.organizationId },
        include: {
          requestedBy: { select: { email: true, displayName: true } },
          reviewedBy: { select: { email: true, displayName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.privilegedAccessGrant.findMany({
        where: {
          organizationId: context.organizationId,
          status: "APPROVED",
          expiresAt: { gt: new Date() },
        },
        include: {
          user: { select: { email: true, displayName: true } },
          approvedBy: { select: { email: true, displayName: true } },
        },
        orderBy: { expiresAt: "asc" },
      }),
    ]);
    return {
      policy,
      providers,
      identities,
      sessions,
      scimTokens,
      pamRequests,
      pamGrants,
    };
  }

  async updatePolicy(
    context: TenantContext,
    input: {
      requireMfa?: boolean;
      requireMfaForPrivileged?: boolean;
      allowPasswordLogin?: boolean;
      allowPasskeyLogin?: boolean;
      requireTrustedDevice?: boolean;
      jitProvisioningEnabled?: boolean;
      allowedEmailDomains?: string[];
      defaultRoleId?: string | null;
      sessionMaxAgeMinutes?: number;
      sessionIdleMinutes?: number;
      stepUpDurationMinutes?: number;
      minimumAssuranceLevel?: "AAL1" | "AAL2" | "AAL3";
    },
  ) {
    await requirePermission(context, "identity.manage");
    if (input.requireMfa) {
      const membersWithoutMfa = await prisma.membership.count({
        where: {
          organizationId: context.organizationId,
          status: "ACTIVE",
          user: {
            mfaFactors: { none: { status: "ACTIVE" } },
            webAuthnCredentials: { none: { revokedAt: null } },
          },
        },
      });
      if (membersWithoutMfa > 0) {
        throw new AppError(
          "CONFLICT",
          "MFA enforcement cannot be enabled until every active member has an enrolled factor.",
          409,
          { membersWithoutMfa },
        );
      }
    }
    if (input.defaultRoleId) {
      const role = await prisma.role.findFirst({
        where: {
          id: input.defaultRoleId,
          organizationId: context.organizationId,
        },
      });
      if (!role) throw new AppError("NOT_FOUND", "Default role not found.", 404);
    }
    const policy = await prisma.organizationIdentityPolicy.upsert({
      where: { organizationId: context.organizationId },
      create: {
        organizationId: context.organizationId,
        ...input,
      },
      update: input,
    });
    await prisma.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "identity.policy.updated",
        resourceType: "OrganizationIdentityPolicy",
        resourceId: policy.id,
        outcome: "SUCCESS",
        metadata: json({ version: policy.updatedAt.toISOString() }),
      },
    });
    return policy;
  }

  async createProvider(context: TenantContext, input: ProviderInput) {
    await requirePermission(context, "identity.manage");
    this.validateProvider(input);
    const provider = await prisma.identityProvider.create({
      data: {
        organizationId: context.organizationId,
        type: input.type,
        name: input.name,
        slug: input.slug,
        issuer: input.issuer,
        entryPoint: input.entryPoint,
        callbackUrl: input.callbackUrl,
        idpCertificate: input.idpCertificate,
        oidcDiscoveryUrl: input.oidcDiscoveryUrl,
        oidcClientId: input.oidcClientId,
        oidcClientSecretCipher: input.oidcClientSecret
          ? encryptSecret(input.oidcClientSecret)
          : undefined,
        scopes: input.scopes,
        requiredAcr: input.requiredAcr,
        assuranceLevel: input.assuranceLevel,
        attributeMapping: input.attributeMapping
          ? json(input.attributeMapping)
          : undefined,
        allowedEmailDomains: input.allowedEmailDomains ?? [],
        jitProvisioningEnabled: input.jitProvisioningEnabled,
        defaultRoleId: input.defaultRoleId,
        wantAssertionsSigned: input.wantAssertionsSigned,
        wantAuthnResponseSigned: input.wantAuthnResponseSigned,
        validateInResponseTo: input.validateInResponseTo,
        status: input.status,
      },
    });
    await this.auditProvider(context, provider.id, "created");
    return this.providerWithoutSecret(provider.id, context.organizationId);
  }

  async updateProvider(
    context: TenantContext,
    providerId: string,
    input: Partial<ProviderInput>,
  ) {
    await requirePermission(context, "identity.manage");
    const current = await prisma.identityProvider.findFirst({
      where: { id: providerId, organizationId: context.organizationId },
    });
    if (!current) throw new AppError("NOT_FOUND", "Identity provider not found.", 404);
    this.validateProvider({
      type: input.type ?? current.type,
      name: input.name ?? current.name,
      slug: input.slug ?? current.slug,
      issuer: input.issuer ?? current.issuer,
      entryPoint: input.entryPoint ?? current.entryPoint ?? undefined,
      callbackUrl: input.callbackUrl ?? current.callbackUrl,
      idpCertificate:
        input.idpCertificate ?? current.idpCertificate ?? undefined,
      oidcDiscoveryUrl:
        input.oidcDiscoveryUrl ?? current.oidcDiscoveryUrl ?? undefined,
      oidcClientId: input.oidcClientId ?? current.oidcClientId ?? undefined,
      oidcClientSecret:
        input.oidcClientSecret ??
        (current.oidcClientSecretCipher ? "[UNCHANGED]" : undefined),
      status: input.status ?? current.status,
    });
    await prisma.identityProvider.update({
      where: { id: current.id },
      data: {
        type: input.type,
        name: input.name,
        slug: input.slug,
        issuer: input.issuer,
        entryPoint: input.entryPoint,
        callbackUrl: input.callbackUrl,
        idpCertificate: input.idpCertificate,
        oidcDiscoveryUrl: input.oidcDiscoveryUrl,
        oidcClientId: input.oidcClientId,
        oidcClientSecretCipher: input.oidcClientSecret
          ? encryptSecret(input.oidcClientSecret)
          : undefined,
        scopes: input.scopes,
        requiredAcr: input.requiredAcr,
        assuranceLevel: input.assuranceLevel,
        attributeMapping: input.attributeMapping
          ? json(input.attributeMapping)
          : undefined,
        allowedEmailDomains: input.allowedEmailDomains,
        jitProvisioningEnabled: input.jitProvisioningEnabled,
        defaultRoleId: input.defaultRoleId,
        wantAssertionsSigned: input.wantAssertionsSigned,
        wantAuthnResponseSigned: input.wantAuthnResponseSigned,
        validateInResponseTo: input.validateInResponseTo,
        status: input.status,
      },
    });
    await this.auditProvider(context, current.id, "updated");
    return this.providerWithoutSecret(current.id, context.organizationId);
  }

  async deleteProvider(context: TenantContext, providerId: string) {
    await requirePermission(context, "identity.manage");
    const provider = await prisma.identityProvider.findFirst({
      where: { id: providerId, organizationId: context.organizationId },
      include: { _count: { select: { externalIdentities: true } } },
    });
    if (!provider) throw new AppError("NOT_FOUND", "Identity provider not found.", 404);
    if (provider._count.externalIdentities > 0) {
      await prisma.identityProvider.update({
        where: { id: provider.id },
        data: { status: "DISABLED" },
      });
      await this.auditProvider(context, provider.id, "disabled");
      return { disabled: true, deleted: false };
    }
    await prisma.identityProvider.delete({ where: { id: provider.id } });
    await this.auditProvider(context, provider.id, "deleted");
    return { disabled: false, deleted: true };
  }

  async start(providerId: string, returnTo?: string | null) {
    const provider = await this.activeProvider(providerId);
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken(48);
    const attempt = await prisma.identityLoginAttempt.create({
      data: {
        providerId: provider.id,
        organizationId: provider.organizationId,
        stateHash: hash(state),
        nonceHash: hash(nonce),
        codeVerifierCipher:
          provider.type === "OIDC" ? encryptSecret(verifier) : undefined,
        returnTo: safeReturnTo(returnTo),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    if (provider.type === "SAML") {
      const saml = this.saml(provider, attempt.id);
      return {
        type: provider.type,
        authorizationUrl: await saml.getAuthorizeUrlAsync(state, undefined, {}),
        expiresAt: attempt.expiresAt,
      };
    }
    const discovery = await this.discovery(provider);
    const challenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.searchParams.set("client_id", provider.oidcClientId!);
    authorizationUrl.searchParams.set("redirect_uri", provider.callbackUrl);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", provider.scopes.join(" "));
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("code_challenge", challenge);
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    if (provider.requiredAcr) {
      authorizationUrl.searchParams.set("acr_values", provider.requiredAcr);
    }
    return {
      type: provider.type,
      authorizationUrl: authorizationUrl.toString(),
      expiresAt: attempt.expiresAt,
    };
  }

  async completeOidc(input: {
    providerId: string;
    state: string;
    code: string;
    metadata: RequestMetadata;
  }) {
    const provider = await this.activeProvider(input.providerId, "OIDC");
    const attempt = await this.pendingAttempt(provider.id, input.state);
    const discovery = await this.discovery(provider);
    const verifier = decryptSecret(attempt.codeVerifierCipher!);
    const tokenResponse = await fetchJson<{
      id_token?: string;
      access_token?: string;
      token_type?: string;
    }>(discovery.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        client_id: provider.oidcClientId!,
        client_secret: decryptSecret(provider.oidcClientSecretCipher!),
        redirect_uri: provider.callbackUrl,
        code_verifier: verifier,
      }),
    });
    if (!tokenResponse.id_token) {
      throw new AppError("UNAUTHORIZED", "OIDC ID token is missing.", 401);
    }
    const verified = await jwtVerify(
      tokenResponse.id_token,
      createRemoteJWKSet(ensureProviderUrl(discovery.jwks_uri, "OIDC JWKS URL")),
      {
        issuer: provider.issuer,
        audience: provider.oidcClientId!,
      },
    );
    const claims = verified.payload;
    if (
      !claims.nonce ||
      hash(String(claims.nonce)) !== attempt.nonceHash
    ) {
      throw new AppError("UNAUTHORIZED", "OIDC nonce validation failed.", 401);
    }
    if (provider.requiredAcr && claims.acr !== provider.requiredAcr) {
      throw new AppError(
        "FORBIDDEN",
        "The identity provider did not satisfy the required assurance context.",
        403,
      );
    }
    if (!claims.sub || !claims.email) {
      throw new AppError(
        "UNAUTHORIZED",
        "OIDC subject and email claims are required.",
        401,
      );
    }
    return this.finalizeFederatedLogin({
      provider,
      attemptId: attempt.id,
      subject: claims.sub,
      email: String(claims.email).toLowerCase(),
      displayName:
        typeof claims.name === "string" ? claims.name : String(claims.email),
      claims,
      metadata: input.metadata,
    });
  }

  async completeSaml(input: {
    providerId: string;
    state: string;
    samlResponse: string;
    metadata: RequestMetadata;
  }) {
    const provider = await this.activeProvider(input.providerId, "SAML");
    const attempt = await this.pendingAttempt(provider.id, input.state);
    const result = await this.saml(provider).validatePostResponseAsync({
      SAMLResponse: input.samlResponse,
    });
    if (!result.profile || result.loggedOut) {
      throw new AppError("UNAUTHORIZED", "SAML assertion is invalid.", 401);
    }
    const profile = result.profile;
    const email = String(
      profile.email ??
        profile.mail ??
        profile["urn:oid:0.9.2342.19200300.100.1.3"] ??
        "",
    ).toLowerCase();
    if (!email || !profile.nameID) {
      throw new AppError(
        "UNAUTHORIZED",
        "SAML NameID and email attributes are required.",
        401,
      );
    }
    return this.finalizeFederatedLogin({
      provider,
      attemptId: attempt.id,
      subject: profile.nameID,
      email,
      displayName:
        typeof profile.displayName === "string"
          ? profile.displayName
          : email,
      claims: profile,
      sessionIndex: profile.sessionIndex,
      metadata: input.metadata,
    });
  }

  metadata(providerId: string) {
    return this.activeProvider(providerId, "SAML").then((provider) =>
      this.saml(provider).generateServiceProviderMetadata(null),
    );
  }

  private async finalizeFederatedLogin(input: {
    provider: Awaited<ReturnType<FederatedIdentityService["activeProvider"]>>;
    attemptId: string;
    subject: string;
    email: string;
    displayName: string;
    claims: Record<string, unknown>;
    sessionIndex?: string;
    metadata: RequestMetadata;
  }) {
    this.assertAllowedEmail(input.provider, input.email);
    const result = await prisma.$transaction(async (tx) => {
      const linked = await tx.externalIdentity.findUnique({
        where: {
          providerId_subject: {
            providerId: input.provider.id,
            subject: input.subject,
          },
        },
        include: { user: true },
      });
      let user = linked?.user ?? null;
      if (!user) {
        user = await tx.user.findUnique({ where: { email: input.email } });
      }
      if (!user) {
        const policy = await tx.organizationIdentityPolicy.findUnique({
          where: { organizationId: input.provider.organizationId },
        });
        if (
          !input.provider.jitProvisioningEnabled &&
          !policy?.jitProvisioningEnabled
        ) {
          throw new AppError(
            "FORBIDDEN",
            "Just-in-Time provisioning is disabled.",
            403,
          );
        }
        user = await tx.user.create({
          data: {
            email: input.email,
            displayName: input.displayName,
            emailVerified: new Date(),
          },
        });
      }
      let membership = await tx.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: input.provider.organizationId,
          },
        },
      });
      if (!membership) {
        const roleId =
          input.provider.defaultRoleId ??
          (
            await tx.role.findFirst({
              where: {
                organizationId: input.provider.organizationId,
                name: "Member",
              },
              select: { id: true },
            })
          )?.id;
        membership = await tx.membership.create({
          data: {
            userId: user.id,
            organizationId: input.provider.organizationId,
            roleId,
            status: "ACTIVE",
          },
        });
      } else if (membership.status !== "ACTIVE") {
        throw new AppError(
          "FORBIDDEN",
          "The organization membership is not active.",
          403,
        );
      }
      const identity = await tx.externalIdentity.upsert({
        where: {
          providerId_subject: {
            providerId: input.provider.id,
            subject: input.subject,
          },
        },
        create: {
          providerId: input.provider.id,
          userId: user.id,
          subject: input.subject,
          email: input.email,
          claims: json(input.claims),
          sessionIndex: input.sessionIndex,
        },
        update: {
          email: input.email,
          claims: json(input.claims),
          sessionIndex: input.sessionIndex,
          lastAuthenticatedAt: new Date(),
        },
      });
      const consumed = await tx.identityLoginAttempt.updateMany({
        where: { id: input.attemptId, status: "PENDING" },
        data: { status: "COMPLETED", consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new AppError("CONFLICT", "SSO login attempt was already used.", 409);
      }
      await tx.auditEvent.create({
        data: {
          organizationId: input.provider.organizationId,
          actorUserId: user.id,
          action: "identity.sso.authenticated",
          resourceType: "ExternalIdentity",
          resourceId: identity.id,
          outcome: "SUCCESS",
          metadata: json({
            providerId: input.provider.id,
            providerType: input.provider.type,
            jitProvisioned: !linked,
          }),
        },
      });
      return { user, identity };
    });
    const policy = await prisma.organizationIdentityPolicy.findUnique({
      where: { organizationId: input.provider.organizationId },
    });
    if (policy?.requireMfa && input.provider.assuranceLevel === "AAL1") {
      const challenge = await new MfaPasskeyService().createLoginChallenge({
        userId: result.user.id,
        organizationId: input.provider.organizationId,
        authMethod: input.provider.type,
        metadata: input.metadata,
      });
      return {
        mfaRequired: true as const,
        ...challenge,
        returnTo: (
          await prisma.identityLoginAttempt.findUnique({
            where: { id: input.attemptId },
            select: { returnTo: true },
          })
        )?.returnTo,
      };
    }
    const session = await new AuthService().createAuthenticatedSession({
      userId: result.user.id,
      organizationId: input.provider.organizationId,
      authMethod: input.provider.type,
      assuranceLevel: input.provider.assuranceLevel,
      mfaVerifiedAt:
        input.provider.assuranceLevel === "AAL1" ? undefined : new Date(),
      metadata: input.metadata,
    });
    return {
      mfaRequired: false as const,
      ...session,
      returnTo: (
        await prisma.identityLoginAttempt.findUnique({
          where: { id: input.attemptId },
          select: { returnTo: true },
        })
      )?.returnTo,
    };
  }

  private async activeProvider(
    providerId: string,
    type?: "SAML" | "OIDC",
  ) {
    const provider = await prisma.identityProvider.findFirst({
      where: {
        id: providerId,
        status: "ACTIVE",
        ...(type ? { type } : {}),
      },
    });
    if (!provider) {
      throw new AppError("NOT_FOUND", "Active identity provider not found.", 404);
    }
    return provider;
  }

  private async pendingAttempt(providerId: string, state: string) {
    const attempt = await prisma.identityLoginAttempt.findFirst({
      where: {
        providerId,
        stateHash: hash(state),
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (!attempt) {
      throw new AppError(
        "UNAUTHORIZED",
        "SSO state is invalid, expired, or already used.",
        401,
      );
    }
    return attempt;
  }

  private async discovery(
    provider: Awaited<ReturnType<FederatedIdentityService["activeProvider"]>>,
  ) {
    if (!provider.oidcDiscoveryUrl) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "OIDC discovery URL is missing.",
        503,
      );
    }
    const discoveryUrl = ensureProviderUrl(
      provider.oidcDiscoveryUrl,
      "OIDC discovery URL",
    );
    const discovery = await fetchJson<OidcDiscovery>(discoveryUrl.toString());
    if (discovery.issuer !== provider.issuer) {
      throw new AppError("UNAUTHORIZED", "OIDC issuer mismatch.", 401);
    }
    ensureProviderUrl(discovery.authorization_endpoint, "OIDC authorization URL");
    ensureProviderUrl(discovery.token_endpoint, "OIDC token URL");
    ensureProviderUrl(discovery.jwks_uri, "OIDC JWKS URL");
    return discovery;
  }

  private saml(
    provider: Awaited<ReturnType<FederatedIdentityService["activeProvider"]>>,
    attemptId?: string,
  ) {
    if (!provider.entryPoint || !provider.idpCertificate) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "SAML entry point and IdP certificate are required.",
        503,
      );
    }
    ensureProviderUrl(provider.entryPoint, "SAML entry point");
    return new SAML({
      issuer: provider.issuer,
      callbackUrl: provider.callbackUrl,
      entryPoint: provider.entryPoint,
      idpCert: provider.idpCertificate,
      audience: provider.issuer,
      wantAssertionsSigned: provider.wantAssertionsSigned,
      wantAuthnResponseSigned: provider.wantAuthnResponseSigned,
      validateInResponseTo: provider.validateInResponseTo
        ? ValidateInResponseTo.always
        : ValidateInResponseTo.never,
      acceptedClockSkewMs: 120_000,
      requestIdExpirationPeriodMs: 10 * 60_000,
      cacheProvider: new PrismaSamlCache(provider.id, attemptId),
      disableRequestedAuthnContext: false,
    });
  }

  private validateProvider(input: Partial<ProviderInput>) {
    if (input.callbackUrl) ensureProviderUrl(input.callbackUrl, "Callback URL");
    if (input.type === "SAML") {
      if (!input.entryPoint || !input.idpCertificate) {
        throw new AppError(
          "VALIDATION_ERROR",
          "SAML entry point and IdP certificate are required.",
          422,
        );
      }
      ensureProviderUrl(input.entryPoint, "SAML entry point");
      if (
        input.status === "ACTIVE" &&
        process.env.NODE_ENV === "production" &&
        (input.wantAssertionsSigned === false ||
          input.wantAuthnResponseSigned === false)
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Active production SAML providers must require signed assertions and responses.",
          422,
        );
      }
    }
    if (input.type === "OIDC") {
      if (
        !input.oidcDiscoveryUrl ||
        !input.oidcClientId ||
        !input.oidcClientSecret
      ) {
        throw new AppError(
          "VALIDATION_ERROR",
          "OIDC discovery URL, client ID, and client secret are required.",
          422,
        );
      }
      ensureProviderUrl(input.oidcDiscoveryUrl, "OIDC discovery URL");
    }
  }

  private assertAllowedEmail(
    provider: Awaited<ReturnType<FederatedIdentityService["activeProvider"]>>,
    email: string,
  ) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (
      provider.allowedEmailDomains.length > 0 &&
      (!domain ||
        !provider.allowedEmailDomains
          .map((row) => row.toLowerCase())
          .includes(domain))
    ) {
      throw new AppError(
        "FORBIDDEN",
        "The asserted email domain is not allowed for this organization.",
        403,
      );
    }
  }

  private providerWithoutSecret(providerId: string, organizationId: string) {
    return prisma.identityProvider.findFirstOrThrow({
      where: { id: providerId, organizationId },
      select: {
        id: true,
        type: true,
        status: true,
        name: true,
        slug: true,
        issuer: true,
        entryPoint: true,
        callbackUrl: true,
        oidcDiscoveryUrl: true,
        oidcClientId: true,
        scopes: true,
        requiredAcr: true,
        assuranceLevel: true,
        allowedEmailDomains: true,
        jitProvisioningEnabled: true,
        defaultRoleId: true,
        wantAssertionsSigned: true,
        wantAuthnResponseSigned: true,
        validateInResponseTo: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  private auditProvider(
    context: TenantContext,
    providerId: string,
    action: string,
  ) {
    return prisma.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: `identity.provider.${action}`,
        resourceType: "IdentityProvider",
        resourceId: providerId,
        outcome: "SUCCESS",
      },
    });
  }
}
