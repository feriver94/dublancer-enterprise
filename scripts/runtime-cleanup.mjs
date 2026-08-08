import { execFile } from "node:child_process";
import { readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const generatedFiles = ["next-env.d.ts", "tsconfig.tsbuildinfo"];
const runtimeDirectoryPattern = /^\.phase(?:-[a-c]|(?:3|4|5|6|7|8|9|10))-runtime-/;

async function exists(target) {
  try { await stat(target); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function gitStatus(root) {
  const { stdout } = await execFileAsync("git", ["status", "--short"], {
    cwd: root,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout;
}

async function runtimeDirectories(root) {
  return (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && runtimeDirectoryPattern.test(entry.name))
    .map((entry) => path.join(root, entry.name));
}

export async function captureRuntimeBaseline(root) {
  const files = [];
  for (const relative of generatedFiles) {
    const target = path.join(root, relative);
    const present = await exists(target);
    files.push({ relative, present, contents: present ? await readFile(target) : null });
  }
  return { status: await gitStatus(root), files, runtimeDirectories: await runtimeDirectories(root) };
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.off("exit", exited); resolve(false); }, timeoutMs);
    function exited() { clearTimeout(timer); resolve(true); }
    child.once("exit", exited);
  });
}

function signalProcessTree(child, signal) {
  if (process.platform !== "win32" && child.pid) {
    try { process.kill(-child.pid, signal); return; }
    catch (error) { if (error?.code !== "ESRCH") throw error; }
  }
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
}

async function terminateChildren(children) {
  const active = [...children].filter((child) => child.exitCode === null && child.signalCode === null);
  for (const child of active) signalProcessTree(child, "SIGTERM");
  await Promise.all(active.map((child) => waitForExit(child, 1_500)));
  // A process-group leader can exit before its workers. Kill the original
  // isolated group even when the leader has already reported its exit.
  for (const child of active) signalProcessTree(child, "SIGKILL");
  const forced = await Promise.all(active.map((child) => waitForExit(child, 1_000)));
  if (forced.some((exited) => !exited)) {
    throw new Error("Runtime cleanup could not stop every child process.");
  }
}

async function removeWithRetry(target) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 75 });
      if (!(await exists(target))) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 100));
  }
  throw new Error(`Runtime cleanup could not remove ${path.basename(target)}.${lastError instanceof Error ? ` ${lastError.message}` : ""}`);
}

async function enforceQuietPaths(root, baseline, paths) {
  const preserved = new Set(baseline.runtimeDirectories);
  let absentRounds = 0;
  for (let round = 0; round < 25; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    let found = false;
    const generated = (await runtimeDirectories(root)).filter((target) => !preserved.has(target));
    for (const target of new Set([...paths, ...generated])) {
      if (await exists(target)) {
        found = true;
        await removeWithRetry(target);
      }
    }
    absentRounds = found ? 0 : absentRounds + 1;
    if (absentRounds >= 15) return;
  }
  const remaining = [];
  const generated = (await runtimeDirectories(root)).filter((target) => !preserved.has(target));
  for (const target of new Set([...paths, ...generated])) if (await exists(target)) remaining.push(path.basename(target));
  if (remaining.length) throw new Error(`Runtime paths reappeared after cleanup: ${remaining.join(", ")}.`);
}

async function restoreGeneratedFiles(root, files) {
  for (const file of files) {
    const target = path.join(root, file.relative);
    if (file.present) await writeFile(target, file.contents);
    else await rm(target, { force: true });
  }
}

export async function cleanupRuntime({ root, baseline, children, close = [], paths = [] }) {
  const failures = [];
  try { await terminateChildren(children); } catch (error) { failures.push(error); }
  for (const operation of close) {
    try { await operation(); } catch (error) { failures.push(error); }
  }
  for (const target of paths) {
    try { await removeWithRetry(target); } catch (error) { failures.push(error); }
  }
  try { await enforceQuietPaths(root, baseline, paths); } catch (error) { failures.push(error); }
  try { await restoreGeneratedFiles(root, baseline.files); } catch (error) { failures.push(error); }
  try {
    const current = await gitStatus(root);
    if (current !== baseline.status) {
      failures.push(new Error(`Runtime harness changed repository state.\nBefore:\n${baseline.status || "(clean)\n"}After:\n${current || "(clean)\n"}`));
    }
  } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, "Runtime cleanup did not restore its starting repository state.");
}
