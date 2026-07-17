import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Cross-platform project root
const root = fileURLToPath(new URL("../", import.meta.url));

const skipped = new Set([
  "node_modules",
  ".next",
  ".git",
  "migration-baseline",
]);

const allowed = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".sql",
  ".ps1",
  ".yml",
  ".yaml",
  ".example",
]);

async function walk(directory) {
  const output = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;

    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      output.push(...(await walk(fullPath)));
    } else if (
      allowed.has(extname(entry.name)) ||
      entry.name === ".env.example"
    ) {
      output.push(fullPath);
    }
  }

  return output;
}

const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9+/_=-]{24,}["']/i,
];

const files = await walk(root);

for (const fullPath of files) {
  const rel = relative(root, fullPath);

  if (
    /^\.env(?:\.[a-z0-9_-]+)?\.example$/i.test(basename(rel)) ||
    rel === "scripts/verify-secrets.mjs"
  ) {
    continue;
  }

  const text = await readFile(fullPath, "utf8");

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      throw new Error(`Potential secret detected in ${rel}.`);
    }
  }
}

console.log(
  `Secret scan passed (${files.length} text source files; example placeholders excluded).`
);