import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const lockSource = await readFile(new URL("../package-lock.json", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(lockSource);
if (lock.lockfileVersion !== 3) throw new Error("package-lock.json must use lockfile version 3.");
if (manifest.packageManager !== "npm@11.9.0") throw new Error("The audited npm release is not pinned.");
if (manifest.engines?.node !== ">=24 <25") throw new Error("The production Node release line is not pinned.");

const packages = Object.entries(lock.packages).filter(([path]) => Boolean(path));
let bundledPackages = 0;
for (const [path, record] of packages) {
  if (record.link) throw new Error(`Local package link is not allowed in the release lockfile: ${path}`);
  if (record.inBundle) {
    bundledPackages += 1;
    continue;
  }
  if (!record.resolved?.startsWith("https://registry.npmjs.org/")) {
    throw new Error(`Non-registry package source is not allowed: ${path}`);
  }
  if (!/^sha512-[A-Za-z0-9+/=]+$/.test(record.integrity ?? "")) {
    throw new Error(`SHA-512 integrity is missing or malformed: ${path}`);
  }
}

const installScriptAllowlist = new Set([
  "@parcel/watcher",
  "@prisma/engines",
  "@swc/core",
  "argon2",
  "fsevents",
  "prisma",
  "protobufjs",
  "unrs-resolver",
]);
const installScripts = packages
  .filter(([, record]) => record.hasInstallScript)
  .map(([path]) => path.split("node_modules/").at(-1))
  .sort();
for (const name of installScripts) {
  if (!installScriptAllowlist.has(name)) {
    throw new Error(`Unreviewed dependency install script: ${name}`);
  }
}
for (const name of installScriptAllowlist) {
  if (!installScripts.includes(name)) {
    throw new Error(`Reviewed install script is no longer present; update the allowlist intentionally: ${name}`);
  }
}

for (const [name, range] of Object.entries({
  ...manifest.dependencies,
  ...manifest.devDependencies,
})) {
  if (range === "latest" || /^(?:git|https?):/.test(range)) {
    throw new Error(`Dependency ${name} must use a registry semver range, not ${range}.`);
  }
}

const expectedOverrides = {
  postcss: "8.5.25",
  sharp: "0.35.3",
};
for (const [name, version] of Object.entries(expectedOverrides)) {
  if (manifest.overrides?.[name] !== version) {
    throw new Error(`Security override ${name}@${version} is required.`);
  }
}
const prohibited = new Set([
  "postcss@8.4.31",
  "sharp@0.34.5",
  "fast-uri@3.1.3",
  "brace-expansion@1.1.15",
  "brace-expansion@5.0.6",
]);
for (const [path, record] of packages) {
  const name = path.split("node_modules/").at(-1);
  if (prohibited.has(`${name}@${record.version}`)) {
    throw new Error(`Known vulnerable dependency remains locked: ${name}@${record.version}`);
  }
}

const digest = createHash("sha256").update(lockSource).digest("hex");
console.log(
  `Supply-chain verification passed (${packages.length - bundledPackages} registry packages and ${bundledPackages} integrity-covered bundled packages; SHA-512 integrity complete; ${installScripts.length} reviewed install scripts; lock SHA-256 ${digest}).`,
);
