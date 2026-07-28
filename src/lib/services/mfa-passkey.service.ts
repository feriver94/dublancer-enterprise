import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { TenantContext } from "@/lib/tenancy/context";
import { createTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-box";
import { AuthService } from "@/lib/services/auth.service";

type RequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const challengeTtlMs = 5 * 60_000;

function relyingParty() {
  const origin = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";
  const parsed = new URL(origin);
  return {
    origin,
    rpID: process.env.WEBAUTHN_RP_ID ?? parsed.hostname,
    rpName: process.env.WEBAUTHN_RP_NAME ?? "Dublancer Enterprise",
  };
}

function backupCodeHash(code: string) {
  const key =
    process.env.MFA_BACKUP_CODE_PEPPER ??
    (process.env.NODE_ENV === "production"
      ? null
      : "dublancer-development-backup-code-pepper");
  if (!key) {
    throw new Error("MFA_BACKUP_CODE_PEPPER is required in production.");
  }
  return createHmac("sha256", key)
    .update(code.replace(/-/g, "").toUpperCase())
    .digest("hex");
}

function newBackupCodes() {
  return Array.from({ length: 10 }, () => {
    const value = randomBytes(8).toString("hex").toUpperCase();
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12)}`;
  });
}

function parsePayload(payload: Prisma.JsonValue | null) {
  return (payload ?? {}) as Record<string, unknown>;
}

export class MfaPasskeyService {
  async setupTotp(context: TenantContext, label?: string) {
    await prisma.mfaFactor.updateMany({
      where: {
        userId: context.userId,
        type: "TOTP",
        status: "PENDING",
      },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const secret = createTotpSecret();
    const factor = await prisma.mfaFactor.create({
      data: {
        userId: context.userId,
        type: "TOTP",
        label: label?.trim() || "Authenticator app",
        secretCipher: encryptSecret(secret),
      },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: context.userId },
      select: { email: true },
    });
    const issuer = encodeURIComponent("Dublancer Enterprise");
    const account = encodeURIComponent(user.email);
    return {
      factorId: factor.id,
      secret,
      otpauthUrl: `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
      expiresInSeconds: 600,
    };
  }

  async verifyTotpEnrollment(
    context: TenantContext,
    factorId: string,
    code: string,
  ) {
    if (!context.sessionId) {
      throw new AppError("UNAUTHORIZED", "Authentication session is required.", 401);
    }
    const factor = await prisma.mfaFactor.findFirst({
      where: {
        id: factorId,
        userId: context.userId,
        type: "TOTP",
        status: "PENDING",
      },
    });
    if (!factor?.secretCipher) {
      throw new AppError("NOT_FOUND", "Pending TOTP enrollment not found.", 404);
    }
    if (!verifyTotp(decryptSecret(factor.secretCipher), code)) {
      throw new AppError("UNAUTHORIZED", "The authenticator code is invalid.", 401);
    }
    const codes = newBackupCodes();
    await prisma.$transaction([
      prisma.mfaFactor.update({
        where: { id: factor.id },
        data: {
          status: "ACTIVE",
          verifiedAt: new Date(),
          lastUsedAt: new Date(),
        },
      }),
      prisma.mfaBackupCode.deleteMany({
        where: { userId: context.userId, usedAt: null },
      }),
      prisma.mfaBackupCode.createMany({
        data: codes.map((backupCode) => ({
          userId: context.userId,
          factorId: factor.id,
          codeHash: backupCodeHash(backupCode),
        })),
      }),
      prisma.authSession.update({
        where: { id: context.sessionId },
        data: {
          assuranceLevel: "AAL2",
          mfaVerifiedAt: new Date(),
          stepUpExpiresAt: new Date(Date.now() + 15 * 60_000),
        },
      }),
    ]);
    return { factorId: factor.id, backupCodes: codes };
  }

  async createLoginChallenge(input: {
    userId: string;
    organizationId: string | null;
    authMethod: "PASSWORD" | "SAML" | "OIDC";
    metadata: RequestMetadata;
    deviceLabel?: string;
    trustedDeviceId?: string;
  }) {
    const raw = `${randomUUID()}${randomUUID()}`;
    const challenge = await prisma.authenticationChallenge.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        type: "LOGIN_MFA",
        challengeHash: hash(raw),
        expiresAt: new Date(Date.now() + challengeTtlMs),
        payload: json({
          authMethod: input.authMethod,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
          deviceLabel: input.deviceLabel,
          trustedDeviceId: input.trustedDeviceId,
        }),
      },
    });
    const methods = await this.availableMethods(input.userId);
    return {
      challengeId: challenge.id,
      challengeToken: raw,
      methods,
      expiresAt: challenge.expiresAt,
    };
  }

  async verifyLoginChallenge(input: {
    challengeToken: string;
    method: "TOTP" | "BACKUP_CODE";
    code: string;
  }) {
    const challenge = await prisma.authenticationChallenge.findFirst({
      where: {
        challengeHash: hash(input.challengeToken),
        type: "LOGIN_MFA",
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge) {
      throw new AppError(
        "UNAUTHORIZED",
        "The MFA challenge is invalid or expired.",
        401,
      );
    }

    let authenticationMethod: "PASSWORD" | "BACKUP_CODE" = "PASSWORD";
    if (input.method === "TOTP") {
      const factors = await prisma.mfaFactor.findMany({
        where: {
          userId: challenge.userId,
          type: "TOTP",
          status: "ACTIVE",
        },
      });
      const factor = factors.find(
        (row) =>
          row.secretCipher &&
          verifyTotp(decryptSecret(row.secretCipher), input.code),
      );
      if (!factor) {
        await this.recordFailedChallenge(challenge.id);
        throw new AppError("UNAUTHORIZED", "The authenticator code is invalid.", 401);
      }
      await prisma.mfaFactor.update({
        where: { id: factor.id },
        data: { lastUsedAt: new Date() },
      });
    } else {
      const codeHash = backupCodeHash(input.code);
      const code = await prisma.mfaBackupCode.findFirst({
        where: {
          userId: challenge.userId,
          codeHash,
          usedAt: null,
        },
      });
      if (!code) {
        await this.recordFailedChallenge(challenge.id);
        throw new AppError("UNAUTHORIZED", "The backup code is invalid.", 401);
      }
      const consumed = await prisma.mfaBackupCode.updateMany({
        where: { id: code.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new AppError("CONFLICT", "The backup code was already used.", 409);
      }
      authenticationMethod = "BACKUP_CODE";
    }

    const payload = parsePayload(challenge.payload);
    const consumed = await prisma.authenticationChallenge.updateMany({
      where: { id: challenge.id, status: "PENDING" },
      data: {
        status: "CONSUMED",
        verifiedAt: new Date(),
        consumedAt: new Date(),
      },
    });
    if (consumed.count !== 1) {
      throw new AppError("CONFLICT", "The MFA challenge was already used.", 409);
    }
    return new AuthService().createAuthenticatedSession({
      userId: challenge.userId,
      organizationId: challenge.organizationId,
      authMethod: authenticationMethod,
      assuranceLevel: "AAL2",
      mfaVerifiedAt: new Date(),
      metadata: {
        ipAddress:
          typeof payload.ipAddress === "string" ? payload.ipAddress : null,
        userAgent:
          typeof payload.userAgent === "string" ? payload.userAgent : null,
      },
      deviceLabel:
        typeof payload.deviceLabel === "string" ? payload.deviceLabel : undefined,
      trustedDeviceId:
        typeof payload.trustedDeviceId === "string"
          ? payload.trustedDeviceId
          : undefined,
    });
  }

  async registrationOptions(context: TenantContext, label?: string) {
    const rp = relyingParty();
    const [user, credentials] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: context.userId },
        select: { email: true, displayName: true },
      }),
      prisma.webAuthnCredential.findMany({
        where: { userId: context.userId, revokedAt: null },
      }),
    ]);
    const options = await generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpID,
      userName: user.email,
      userDisplayName: user.displayName ?? user.email,
      userID: new TextEncoder().encode(context.userId),
      attestationType: "none",
      excludeCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as never[],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    const challenge = await prisma.authenticationChallenge.create({
      data: {
        userId: context.userId,
        organizationId: context.organizationId,
        type: "WEBAUTHN_REGISTRATION",
        challengeHash: hash(options.challenge),
        expiresAt: new Date(Date.now() + challengeTtlMs),
        payload: json({
          expectedChallenge: options.challenge,
          expectedOrigin: rp.origin,
          expectedRPID: rp.rpID,
          label: label?.trim() || "Passkey",
        }),
      },
    });
    return { challengeId: challenge.id, options };
  }

  async verifyRegistration(
    context: TenantContext,
    challengeId: string,
    response: RegistrationResponseJSON,
  ) {
    const challenge = await prisma.authenticationChallenge.findFirst({
      where: {
        id: challengeId,
        userId: context.userId,
        type: "WEBAUTHN_REGISTRATION",
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge) {
      throw new AppError("UNAUTHORIZED", "Passkey challenge expired.", 401);
    }
    const payload = parsePayload(challenge.payload);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: String(payload.expectedChallenge),
      expectedOrigin: String(payload.expectedOrigin),
      expectedRPID: String(payload.expectedRPID),
      requireUserVerification: true,
    });
    if (!verification.verified) {
      throw new AppError("UNAUTHORIZED", "Passkey attestation failed.", 401);
    }
    const info = verification.registrationInfo;
    const credential = await prisma.$transaction(async (tx) => {
      const consumed = await tx.authenticationChallenge.updateMany({
        where: { id: challenge.id, status: "PENDING" },
        data: {
          status: "CONSUMED",
          verifiedAt: new Date(),
          consumedAt: new Date(),
        },
      });
      if (consumed.count !== 1) {
        throw new AppError("CONFLICT", "Passkey challenge was already used.", 409);
      }
      const created = await tx.webAuthnCredential.create({
        data: {
          userId: context.userId,
          credentialId: info.credential.id,
          publicKey: Buffer.from(info.credential.publicKey),
          counter: BigInt(info.credential.counter),
          transports: info.credential.transports ?? [],
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
          aaguid: info.aaguid,
          label: String(payload.label ?? "Passkey"),
        },
      });
      await tx.mfaFactor.create({
        data: {
          userId: context.userId,
          type: "PASSKEY",
          status: "ACTIVE",
          label: created.label,
          verifiedAt: new Date(),
        },
      });
      return created;
    });
    return {
      id: credential.id,
      label: credential.label,
      deviceType: credential.deviceType,
      backedUp: credential.backedUp,
    };
  }

  async authenticationOptions(input: {
    email: string;
    organizationId?: string;
    metadata: RequestMetadata;
    deviceLabel?: string;
  }) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          select: { organizationId: true },
        },
        webAuthnCredentials: {
          where: { revokedAt: null },
        },
      },
    });
    if (!user || user.webAuthnCredentials.length === 0) {
      throw new AppError("NOT_FOUND", "No passkey is available for this account.", 404);
    }
    const organizationId =
      input.organizationId ?? user.memberships[0]?.organizationId ?? null;
    if (
      organizationId &&
      !user.isPlatformAdmin &&
      !user.memberships.some((row) => row.organizationId === organizationId)
    ) {
      throw new AppError("FORBIDDEN", "Organization access denied.", 403);
    }
    const rp = relyingParty();
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      userVerification: "required",
      allowCredentials: user.webAuthnCredentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as never[],
      })),
    });
    const challenge = await prisma.authenticationChallenge.create({
      data: {
        userId: user.id,
        organizationId,
        type: "WEBAUTHN_AUTHENTICATION",
        challengeHash: hash(options.challenge),
        expiresAt: new Date(Date.now() + challengeTtlMs),
        payload: json({
          expectedChallenge: options.challenge,
          expectedOrigin: rp.origin,
          expectedRPID: rp.rpID,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
          deviceLabel: input.deviceLabel,
        }),
      },
    });
    return { challengeId: challenge.id, options };
  }

  async verifyAuthentication(
    challengeId: string,
    response: AuthenticationResponseJSON,
  ) {
    const challenge = await prisma.authenticationChallenge.findFirst({
      where: {
        id: challengeId,
        type: "WEBAUTHN_AUTHENTICATION",
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge) {
      throw new AppError("UNAUTHORIZED", "Passkey challenge expired.", 401);
    }
    const credential = await prisma.webAuthnCredential.findFirst({
      where: {
        credentialId: response.id,
        userId: challenge.userId,
        revokedAt: null,
      },
    });
    if (!credential) {
      throw new AppError("UNAUTHORIZED", "Passkey credential not found.", 401);
    }
    const payload = parsePayload(challenge.payload);
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: String(payload.expectedChallenge),
      expectedOrigin: String(payload.expectedOrigin),
      expectedRPID: String(payload.expectedRPID),
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports as never[],
      },
      requireUserVerification: true,
    });
    if (!result.verified) {
      throw new AppError("UNAUTHORIZED", "Passkey assertion failed.", 401);
    }
    const consumed = await prisma.authenticationChallenge.updateMany({
      where: { id: challenge.id, status: "PENDING" },
      data: {
        status: "CONSUMED",
        verifiedAt: new Date(),
        consumedAt: new Date(),
      },
    });
    if (consumed.count !== 1) {
      throw new AppError("CONFLICT", "Passkey challenge was already used.", 409);
    }
    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(result.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
        backedUp: result.authenticationInfo.credentialBackedUp,
        deviceType: result.authenticationInfo.credentialDeviceType,
      },
    });
    return new AuthService().createAuthenticatedSession({
      userId: challenge.userId,
      organizationId: challenge.organizationId,
      authMethod: "PASSKEY",
      assuranceLevel: "AAL2",
      mfaVerifiedAt: new Date(),
      metadata: {
        ipAddress:
          typeof payload.ipAddress === "string" ? payload.ipAddress : null,
        userAgent:
          typeof payload.userAgent === "string" ? payload.userAgent : null,
      },
      deviceLabel:
        typeof payload.deviceLabel === "string" ? payload.deviceLabel : undefined,
    });
  }

  async list(context: TenantContext) {
    const [factors, passkeys, backupCodeCount] = await Promise.all([
      prisma.mfaFactor.findMany({
        where: { userId: context.userId, status: { not: "REVOKED" } },
        select: {
          id: true,
          type: true,
          status: true,
          label: true,
          verifiedAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
      }),
      prisma.webAuthnCredential.findMany({
        where: { userId: context.userId, revokedAt: null },
        select: {
          id: true,
          label: true,
          deviceType: true,
          backedUp: true,
          lastUsedAt: true,
          createdAt: true,
        },
      }),
      prisma.mfaBackupCode.count({
        where: { userId: context.userId, usedAt: null },
      }),
    ]);
    return { factors, passkeys, backupCodeCount };
  }

  async revoke(context: TenantContext, input: {
    factorId?: string;
    passkeyId?: string;
  }) {
    if (input.factorId) {
      await prisma.mfaFactor.updateMany({
        where: { id: input.factorId, userId: context.userId },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
    }
    if (input.passkeyId) {
      await prisma.webAuthnCredential.updateMany({
        where: { id: input.passkeyId, userId: context.userId },
        data: { revokedAt: new Date() },
      });
    }
    return this.list(context);
  }

  private async availableMethods(userId: string) {
    const [totp, backupCodes, passkeys] = await Promise.all([
      prisma.mfaFactor.count({
        where: { userId, type: "TOTP", status: "ACTIVE" },
      }),
      prisma.mfaBackupCode.count({ where: { userId, usedAt: null } }),
      prisma.webAuthnCredential.count({
        where: { userId, revokedAt: null },
      }),
    ]);
    return [
      ...(totp ? ["TOTP"] : []),
      ...(passkeys ? ["PASSKEY"] : []),
      ...(backupCodes ? ["BACKUP_CODE"] : []),
    ];
  }

  private async recordFailedChallenge(challengeId: string) {
    const updated = await prisma.authenticationChallenge.update({
      where: { id: challengeId },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (updated.attempts >= 5) {
      await prisma.authenticationChallenge.update({
        where: { id: challengeId },
        data: { status: "EXPIRED" },
      });
    }
  }
}

export function safeEqualHash(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
