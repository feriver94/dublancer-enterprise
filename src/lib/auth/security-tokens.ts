import { createHash, randomBytes } from "node:crypto";

export function createSecurityToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashSecurityToken(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}