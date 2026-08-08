import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { prepareStandalone } from "../scripts/prepare-standalone.mjs";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const read = (relative) => readFile(path.join(root, relative), "utf8");

async function fixture() {
  const parent = path.join(root, "test-results");
  await mkdir(parent, { recursive: true });
  return mkdtemp(path.join(parent, "bugfix-readiness-"));
}

test("standalone start profile prepares public and static assets", async () => {
  const temporary = await fixture();
  try {
    await mkdir(path.join(temporary, ".next/standalone"), { recursive: true });
    await mkdir(path.join(temporary, ".next/static/chunks"), { recursive: true });
    await mkdir(path.join(temporary, "public/images"), { recursive: true });
    await writeFile(path.join(temporary, ".next/standalone/server.js"), "// server");
    await writeFile(path.join(temporary, ".next/static/chunks/app.js"), "static");
    await writeFile(path.join(temporary, "public/images/logo.jpg"), "public");
    const result = await prepareStandalone(temporary);
    assert.equal(await readFile(path.join(result.staticAssets, "chunks/app.js"), "utf8"), "static");
    assert.equal(await readFile(path.join(result.publicAssets, "images/logo.jpg"), "utf8"), "public");
    const manifest = JSON.parse(await read("package.json"));
    assert.equal(manifest.scripts.start, "node scripts/prepare-standalone.mjs && node .next/standalone/server.js");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Playwright profile requires an explicit healthy prestarted environment", async () => {
  const config = await read("playwright.config.ts");
  const setup = await read("tests/browser/global-setup.ts");
  assert.match(config, /PLAYWRIGHT_BASE_URL is required|Playwright environment is not configured/);
  assert.match(config, /globalSetup: "\.\/tests\/browser\/global-setup\.ts"/);
  assert.doesNotMatch(config, /webServer:/);
  assert.match(setup, /api\/health\/live/);
  assert.match(setup, /api\/health\/ready/);
  assert.match(setup, /timed out after 5 seconds/);
});

test("runtime harnesses use bounded cleanup and restore their starting repository state", async () => {
  const helper = await read("scripts/runtime-cleanup.mjs");
  assert.match(helper, /SIGTERM/);
  assert.match(helper, /SIGKILL/);
  assert.match(helper, /removeWithRetry/);
  assert.match(helper, /Runtime harness changed repository state/);
  for (const name of ["a", "b", "3", "4", "5", "6", "7", "8", "9", "10"]) {
    const file = name === "a" || name === "b"
      ? `scripts/verify-phase-${name}-runtime.mjs`
      : `scripts/verify-phase${name}-runtime.mjs`;
    const source = await read(file);
    assert.match(source, /captureRuntimeBaseline/);
    assert.match(source, /cleanupRuntime/);
  }
});

test("missing backup evidence returns actionable output without a raw ENOENT stack", async () => {
  const temporary = await fixture();
  try {
    const script = path.join(root, "scripts/verify-backup.mjs");
    await assert.rejects(
      execFileAsync(process.execPath, [script], { cwd: temporary }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Provide `--manifest \/path\/to\/manifest\.json`/);
        assert.doesNotMatch(error.stderr, /ENOENT|\n\s+at\s/);
        return true;
      },
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("backup verifier accepts a current encrypted artifact with a matching checksum", async () => {
  const temporary = await fixture();
  try {
    const artifact = Buffer.from("encrypted-backup-fixture");
    const digest = createHash("sha256").update(artifact).digest("hex");
    await writeFile(path.join(temporary, "backup.enc"), artifact);
    await writeFile(path.join(temporary, "manifest.json"), JSON.stringify({
      artifact: "backup.enc",
      sha256: digest,
      createdAt: new Date().toISOString(),
      region: "test-region",
      migration: "20260802100000_dual_profile_marketplace_phase_c",
      encrypted: true,
    }));
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      path.join(root, "scripts/verify-backup.mjs"),
      "--manifest", path.join(temporary, "manifest.json"),
    ], { cwd: temporary });
    assert.match(stdout, /Backup verification passed/);
    assert.equal(stderr, "");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Phase A report index points to the protected canonical architecture", async () => {
  const report = await read("DUAL_PROFILE_PHASE_A_REPORT.md");
  assert.match(report, /PHASE_A_DUAL_PROFILE_ARCHITECTURE\.md/);
  assert.match(report, /canonical and protected Phase A implementation report/);
  assert.match(await read("README.md"), /DUAL_PROFILE_PHASE_A_REPORT\.md/);
});
