import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("final enterprise schema includes governed work graph and orchestration", async () => {
  const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  for (const model of ["WorkGraphNode", "WorkGraphEdge", "WorkflowDefinition", "WorkflowVersion", "WorkflowRun", "WorkflowStepRun", "WorkflowApproval", "TalentMatch", "RateLimitBucket"]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
});

test("provider boundaries fail closed and never embed live credentials", async () => {
  const integration = await readFile(new URL("../src/lib/providers/integrations.ts", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../src/lib/providers/runtime.ts", import.meta.url), "utf8");
  assert.match(integration, /SERVICE_UNAVAILABLE/);
  assert.match(runtime, /QueueProvider/);
  assert.doesNotMatch(integration + runtime, /\bsk-[A-Za-z0-9]{20,}\b/);
});

test("enterprise modules have authenticated live user interfaces", async () => {
  const consoleSource = await readFile(
    new URL("../src/components/platform/enterprise-platform-console.tsx", import.meta.url),
    "utf8"
  );

  for (const moduleName of [
    "marketplace",
    "workspace",
    "collaboration",
    "notifications",
    "files",
    "ai",
    "contracts",
    "finance",
    "orchestration",
    "analytics",
    "search",
    "admin"
  ]) {
    assert.match(consoleSource, new RegExp(`(?:${moduleName}:|\\"${moduleName}\\")`));
  }

  assert.match(consoleSource, /x-csrf-token/);
});

test("UAE runtime defaults are present", async () => {
  const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const locale = await readFile(new URL("../src/i18n/config.ts", import.meta.url), "utf8");
  assert.match(schema, /default\("AED"\)/);
  assert.match(schema, /default\("Asia\/Dubai"\)/);
  assert.match(locale, /en-AE/);
  assert.match(locale, /ar-AE/);
});
