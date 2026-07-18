import { readFile, readdir } from "node:fs/promises";
import { relative, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(join(root, entry.name))
        : [join(root, entry.name)],
    ),
  );
  return nested.flat();
}

const apiRoot = fileURLToPath(new URL("../src/app/api", import.meta.url));
const routes = (await files(apiRoot)).filter((filePath) =>
  filePath.endsWith("route.ts"),
);
const mutationPattern = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/;
const exemptions = new Map([
  ["internal/chat/retention/route.ts", "internal"],
  ["internal/notifications/create/route.ts", "internal"],
  ["internal/notifications/process/route.ts", "internal"],
  ["internal/notifications/route.ts", "internal"],
  ["internal/workers/ai/route.ts", "internal"],
  ["internal/workers/orchestration/route.ts", "internal"],
  ["realtime/publish/route.ts", "internal"],
  ["webhooks/file-scan/[providerKey]/route.ts", "webhook"],
  ["webhooks/payments/[providerKey]/route.ts", "webhook"],
]);

for (const filePath of routes) {
  const source = await readFile(filePath, "utf8");
  const route = relative(apiRoot, filePath).split(sep).join("/");

  if (
    source.includes("getTenantContextFromRequest") ||
    /headers\.get\(["']x-(organization-id|user-id|platform-admin)["']\)/.test(
      source,
    )
  ) {
    throw new Error(`Spoofable browser tenant context remains in ${route}.`);
  }

  if (!mutationPattern.test(source)) continue;

  const exemption = exemptions.get(route);
  if (!exemption) {
    if (!source.includes("requireCsrfToken")) {
      throw new Error(`CSRF guard missing in mutation route ${route}.`);
    }
    continue;
  }

  if (source.includes("requireCsrfToken")) {
    throw new Error(`Exempt route ${route} unexpectedly uses browser CSRF.`);
  }

  if (
    exemption === "internal" &&
    !source.includes("requireInternalHeader") &&
    !source.includes("requireInternalSecret")
  ) {
    throw new Error(`Shared internal authentication missing in ${route}.`);
  }

  if (
    exemption === "webhook" &&
    !/verify|signature|webhook/i.test(source)
  ) {
    throw new Error(`Webhook signature verification missing in ${route}.`);
  }
}

const mutationRoutes = await Promise.all(
  routes.map(async (filePath) => ({
    route: relative(apiRoot, filePath).split(sep).join("/"),
    source: await readFile(filePath, "utf8"),
  })),
);
const actualExemptions = mutationRoutes
  .filter(({ source }) => mutationPattern.test(source))
  .filter(({ source }) => !source.includes("requireCsrfToken"))
  .map(({ route }) => route)
  .sort();
const expectedExemptions = [...exemptions.keys()].sort();

if (JSON.stringify(actualExemptions) !== JSON.stringify(expectedExemptions)) {
  throw new Error(
    `Mutation exemption drift detected. Expected ${expectedExemptions.join(", ")}; received ${actualExemptions.join(", ")}.`,
  );
}

console.log(
  `Security route checks passed (${routes.length} API route files; ${expectedExemptions.length} explicit non-cookie exemptions).`,
);
