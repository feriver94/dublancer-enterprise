import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function argument(name) {
  const exact = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseEnvironment(source) {
  return Object.fromEntries(
    source.split(/\r?\n/).flatMap((line) => {
      const normalized = line.trim();
      if (!normalized || normalized.startsWith("#")) return [];
      const separator = normalized.indexOf("=");
      if (separator < 1) return [];
      const key = normalized.slice(0, separator).trim();
      const value = normalized.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
      return [[key, value]];
    }),
  );
}

const file = argument("--file");
const profile = argument("--profile") ?? "production";
const source = file ? parseEnvironment(await readFile(resolve(file), "utf8")) : process.env;
const required = [
  "DATABASE_URL", "REDIS_URL", "APP_BASE_URL", "AUTH_SECRET",
  "INTERNAL_PUBLISHER_SECRET", "INTERNAL_NOTIFICATION_SECRET",
  "INTERNAL_EMAIL_SECRET", "INTERNAL_WORKER_SECRET",
  "IDENTITY_ENCRYPTION_KEY", "MFA_BACKUP_CODE_PEPPER",
  "INTEGRATION_API_KEY_PEPPER", "CACHE_INVALIDATION_SECRET",
  "OTEL_EXPORTER_OTLP_ENDPOINT", "DEPLOYMENT_REGION",
  "DEPLOYMENT_REGIONS", "DISASTER_RECOVERY_REGION", "APP_VERSION",
];
const errors = [];
for (const key of required) {
  if (!source[key]) errors.push(`${key} is required`);
}
for (const key of required.filter((key) => /SECRET|PEPPER/.test(key))) {
  if (source[key] && source[key].length < 32) errors.push(`${key} must contain at least 32 characters`);
}
for (const key of ["DATABASE_URL", "REDIS_URL", "APP_BASE_URL", "OTEL_EXPORTER_OTLP_ENDPOINT"]) {
  if (!source[key]) continue;
  try { new URL(source[key]); } catch { errors.push(`${key} must be a valid URL`); }
}
if (profile === "production") {
  if (source.NODE_ENV !== "production") errors.push("NODE_ENV must be production");
  if (source.DEPLOYMENT_ENVIRONMENT !== "production") errors.push("DEPLOYMENT_ENVIRONMENT must be production");
  if (source.APP_BASE_URL && !source.APP_BASE_URL.startsWith("https://")) errors.push("APP_BASE_URL must use HTTPS");
  if (source.WEBAUTHN_ORIGIN && !source.WEBAUTHN_ORIGIN.startsWith("https://")) errors.push("WEBAUTHN_ORIGIN must use HTTPS");
  if (source.EXPOSE_DEVELOPMENT_TOKENS === "true") errors.push("development tokens must be disabled");
}
const regions = (source.DEPLOYMENT_REGIONS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
if (regions.length < 2) errors.push("DEPLOYMENT_REGIONS must contain at least two regions");
if (source.DEPLOYMENT_REGION && !regions.includes(source.DEPLOYMENT_REGION)) errors.push("DEPLOYMENT_REGION must be listed in DEPLOYMENT_REGIONS");
if (source.DISASTER_RECOVERY_REGION === source.DEPLOYMENT_REGION) errors.push("DISASTER_RECOVERY_REGION must differ from DEPLOYMENT_REGION");
if (source.DISASTER_RECOVERY_REGION && !regions.includes(source.DISASTER_RECOVERY_REGION)) errors.push("DISASTER_RECOVERY_REGION must be listed in DEPLOYMENT_REGIONS");

if (errors.length) {
  console.error(`Environment validation failed (${errors.length} findings):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Environment validation passed for ${profile} (${required.length} required controls; ${regions.length} regions).`);
