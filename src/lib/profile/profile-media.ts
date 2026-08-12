import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors/app-error";

export const PROFILE_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ProfileMediaType = (typeof PROFILE_MEDIA_TYPES)[number];
export type ProfileMediaTarget = "client" | "freelancer" | "organization";
export type ProfileMediaAsset = "avatar" | "logo" | "banner";

export type ProfileMediaIntent = {
  purpose: "profile-media-upload";
  userId: string;
  organizationId: string;
  personaId: string;
  target: ProfileMediaTarget;
  asset: ProfileMediaAsset;
  mimeType: ProfileMediaType;
  sizeBytes: number;
  checksumSha256: string;
  storageKey: string;
  expiresAt: number;
};

export type ProfileMediaReference = {
  purpose: "profile-media-reference";
  organizationId: string;
  storageKey: string;
  mimeType: ProfileMediaType;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new AppError("SERVICE_UNAVAILABLE", "Profile media signing is not configured.", 503);
  return value;
}

export function signProfileMediaToken(payload: ProfileMediaIntent | ProfileMediaReference) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyProfileMediaToken<T extends ProfileMediaIntent | ProfileMediaReference>(token: string, purpose: T["purpose"]): T {
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) throw new AppError("NOT_FOUND", "Profile media reference is invalid.", 404);
  const expected = createHmac("sha256", secret()).update(encoded).digest();
  const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AppError("NOT_FOUND", "Profile media reference is invalid.", 404);
  let value: unknown;
  try { value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { throw new AppError("NOT_FOUND", "Profile media reference is invalid.", 404); }
  if (!value || typeof value !== "object" || (value as { purpose?: string }).purpose !== purpose) throw new AppError("NOT_FOUND", "Profile media reference is invalid.", 404);
  return value as T;
}

export function checksum(buffer: Buffer) { return createHash("sha256").update(buffer).digest("hex"); }

export function assertImageBytes(buffer: Buffer, mimeType: ProfileMediaType) {
  const jpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (!((mimeType === "image/jpeg" && jpeg) || (mimeType === "image/png" && png) || (mimeType === "image/webp" && webp))) {
    throw new AppError("VALIDATION_ERROR", "The selected file content does not match its image type.", 422);
  }
}
