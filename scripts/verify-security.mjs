import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });

  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(join(root, entry.name))
        : [join(root, entry.name)]
    )
  );

  return nested.flat();
}

// Convert file URL to a proper Windows/Linux filesystem path
const apiRoot = fileURLToPath(new URL("../src/app/api", import.meta.url));

const routes = (await files(apiRoot)).filter((filePath) =>
  filePath.endsWith("route.ts")
);

for (const filePath of routes) {
  const source = await readFile(filePath, "utf8");

  if (source.includes("getTenantContextFromRequest")) {
    throw new Error(
      `Spoofable tenant headers remain in ${filePath}.`
    );
  }
}

const protectedProductRoutes = routes.filter((filePath) =>
  /[\\/](marketplace|contracts|files|ai|finance|admin|projects)[\\/]/.test(filePath)
);

for (const filePath of protectedProductRoutes) {
  const source = await readFile(filePath, "utf8");

  if (
    /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/.test(source) &&
    !source.includes("requireCsrfToken") &&
    !filePath.includes(`${join("internal")}${join("")}`.slice(0, -1))
  ) {
    throw new Error(`CSRF guard missing in ${filePath}.`);
  }
}

console.log(`Security route checks passed (${routes.length} API route files).`);