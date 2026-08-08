import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function argument(name, fallback) {
  const exact = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
async function exists(target) {
  try { await stat(target); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function verify() {
  const manifestPath = resolve(argument("--manifest", "backup-manifest.json"));
  const maxAgeHours = Number(argument("--max-age-hours", "26"));
  if (!(await exists(manifestPath))) {
    throw new Error("Backup manifest was not found. Provide `--manifest /path/to/manifest.json` after generating or downloading the encrypted backup artifact and manifest described in DISASTER_RECOVERY.md.");
  }
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    throw new Error("`--max-age-hours` must be a positive number.");
  }
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error("Backup manifest is not valid JSON.");
    throw error;
  }
  for (const key of ["artifact", "sha256", "createdAt", "region", "migration", "encrypted"]) {
    if (!(key in manifest)) throw new Error(`Backup manifest is missing ${key}.`);
  }
  if (manifest.encrypted !== true) throw new Error("Backup artifact is not marked as encrypted.");
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) throw new Error("Backup checksum is invalid.");
  const createdAt = new Date(manifest.createdAt);
  const ageHours = (Date.now() - createdAt.getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < 0 || ageHours > maxAgeHours) throw new Error(`Backup age ${ageHours.toFixed(2)}h exceeds ${maxAgeHours}h.`);
  const artifactPath = resolve(dirname(manifestPath), manifest.artifact);
  if (!(await exists(artifactPath))) {
    throw new Error("Backup artifact referenced by the manifest was not found. Place the encrypted artifact beside the manifest or correct its `artifact` path.");
  }
  const digest = createHash("sha256").update(await readFile(artifactPath)).digest("hex");
  if (digest !== manifest.sha256) throw new Error("Backup checksum verification failed.");
  console.log(`Backup verification passed (${manifest.region}; migration ${manifest.migration}; age ${ageHours.toFixed(2)}h).`);
}

try {
  await verify();
} catch (error) {
  console.error(`Backup verification failed: ${error instanceof Error ? error.message : "Unknown verification error."}`);
  if (process.env.BACKUP_VERIFY_DEBUG === "1" && error instanceof Error) console.error(error.stack);
  process.exitCode = 1;
}
