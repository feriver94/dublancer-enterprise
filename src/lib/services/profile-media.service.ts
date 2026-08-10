import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import { storageProvider } from "@/lib/providers/integrations";
import type { getAuthenticatedContext } from "@/lib/auth/session";
import { assertImageBytes, checksum, PROFILE_MEDIA_MAX_BYTES, PROFILE_MEDIA_TYPES, signProfileMediaToken, verifyProfileMediaToken, type ProfileMediaAsset, type ProfileMediaIntent, type ProfileMediaReference, type ProfileMediaTarget, type ProfileMediaType } from "@/lib/profile/profile-media";

type Context = Awaited<ReturnType<typeof getAuthenticatedContext>>;
type IntentInput = { target: ProfileMediaTarget; asset: ProfileMediaAsset; mimeType: string; sizeBytes: number; checksumSha256: string };

function assertTarget(context: Context, target: ProfileMediaTarget, asset: ProfileMediaAsset) {
  const expected = target === "client" ? "CLIENT" : target === "freelancer" ? "FREELANCER" : "ORGANIZATION";
  if (!context.activePersonaId || context.activePersonaType !== expected) throw new AppError("FORBIDDEN", "Switch to the matching active persona before changing its media.", 403);
  if (target === "organization" ? !["logo", "banner"].includes(asset) : !["avatar", "banner"].includes(asset)) throw new AppError("VALIDATION_ERROR", "That media type is not supported for this profile.", 422);
}

async function persist(context: Context, target: ProfileMediaTarget, asset: ProfileMediaAsset, value: string | null) {
  assertTarget(context, target, asset);
  if (target === "client") {
    const changed = await prisma.clientProfile.updateMany({ where: { userId: context.userId, deletedAt: null }, data: asset === "avatar" ? { avatarUrl: value, version: { increment: 1 } } : { bannerUrl: value, version: { increment: 1 } } });
    if (!changed.count) throw new AppError("NOT_FOUND", "Client profile not found.", 404);
  } else if (target === "freelancer") {
    const changed = await prisma.freelancerProfile.updateMany({ where: { userId: context.userId, deletedAt: null }, data: asset === "avatar" ? { avatarUrl: value, version: { increment: 1 } } : { bannerUrl: value, version: { increment: 1 } } });
    if (!changed.count) throw new AppError("NOT_FOUND", "Freelancer profile not found.", 404);
  } else {
    const changed = await prisma.companyProfile.updateMany({ where: { organizationId: context.organizationId, deletedAt: null }, data: asset === "logo" ? { logoUrl: value, version: { increment: 1 } } : { bannerUrl: value, version: { increment: 1 } } });
    if (!changed.count) throw new AppError("NOT_FOUND", "Organization profile not found.", 404);
  }
}

export class ProfileMediaService {
  createIntent(context: Context, input: IntentInput) {
    assertTarget(context, input.target, input.asset);
    if (!PROFILE_MEDIA_TYPES.includes(input.mimeType as ProfileMediaType)) throw new AppError("VALIDATION_ERROR", "Use a JPEG, PNG, or WebP image.", 422);
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > PROFILE_MEDIA_MAX_BYTES) throw new AppError("VALIDATION_ERROR", "Profile images must be 5 MB or smaller.", 422);
    if (!/^[a-f0-9]{64}$/i.test(input.checksumSha256)) throw new AppError("VALIDATION_ERROR", "A valid SHA-256 checksum is required.", 422);
    const payload: ProfileMediaIntent = { purpose: "profile-media-upload", userId: context.userId, organizationId: context.organizationId, personaId: context.activePersonaId!, target: input.target, asset: input.asset, mimeType: input.mimeType as ProfileMediaType, sizeBytes: input.sizeBytes, checksumSha256: input.checksumSha256.toLowerCase(), storageKey: `profile-media/${context.organizationId}/${context.userId}/${randomUUID()}`, expiresAt: Date.now() + 5 * 60_000 };
    const token = signProfileMediaToken(payload);
    return { uploadUrl: `/api/profile/media/uploads/${token}`, method: "PUT" as const, expiresAt: new Date(payload.expiresAt).toISOString() };
  }

  async upload(context: Context, token: string, body: Buffer) {
    const intent = verifyProfileMediaToken<ProfileMediaIntent>(token, "profile-media-upload");
    if (intent.expiresAt < Date.now()) throw new AppError("CONFLICT", "The profile media upload expired.", 409);
    if (intent.userId !== context.userId || intent.organizationId !== context.organizationId || intent.personaId !== context.activePersonaId) throw new AppError("FORBIDDEN", "This profile media upload belongs to another account context.", 403);
    assertTarget(context, intent.target, intent.asset);
    if (body.length !== intent.sizeBytes || checksum(body) !== intent.checksumSha256) throw new AppError("CONFLICT", "Uploaded profile image does not match the signed intent.", 409);
    assertImageBytes(body, intent.mimeType);
    const operation = await storageProvider.createUpload({ organizationId: intent.organizationId, storageKey: intent.storageKey, mimeType: intent.mimeType, sizeBytes: intent.sizeBytes, checksumSha256: intent.checksumSha256 });
    const response = await fetch(operation.url, { method: "PUT", headers: operation.headers, body: new Uint8Array(body), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new AppError("SERVICE_UNAVAILABLE", "Profile image storage upload failed.", 503);
    const evidence = await storageProvider.verifyUpload({ organizationId: intent.organizationId, storageKey: intent.storageKey, expectedMimeType: intent.mimeType, expectedSizeBytes: intent.sizeBytes, expectedChecksumSha256: intent.checksumSha256 });
    if (evidence.mimeType !== intent.mimeType || evidence.sizeBytes !== intent.sizeBytes || evidence.checksumSha256 !== intent.checksumSha256) throw new AppError("CONFLICT", "Stored profile image failed integrity verification.", 409);
    const reference = signProfileMediaToken({ purpose: "profile-media-reference", organizationId: intent.organizationId, storageKey: intent.storageKey, mimeType: intent.mimeType });
    const url = `/api/profile/media/${reference}`;
    await persist(context, intent.target, intent.asset, url);
    return { url };
  }

  async remove(context: Context, target: ProfileMediaTarget, asset: ProfileMediaAsset) { await persist(context, target, asset, null); return { removed: true }; }

  async read(token: string) {
    const reference = verifyProfileMediaToken<ProfileMediaReference>(token, "profile-media-reference");
    const operation = await storageProvider.createDownload({ organizationId: reference.organizationId, storageKey: reference.storageKey, downloadName: "profile-image" });
    const response = await fetch(operation.url, { headers: operation.headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok || !response.body) throw new AppError("NOT_FOUND", "Profile image is unavailable.", 404);
    return { body: response.body, mimeType: reference.mimeType };
  }
}
