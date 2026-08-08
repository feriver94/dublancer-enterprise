import { request, type APIRequestContext, type FullConfig } from "@playwright/test";

async function probe(context: APIRequestContext, path: string, label: string) {
  try {
    const response = await context.get(path, {
      headers: { accept: "application/json" },
      timeout: 5_000,
    });
    const body = await response.json().catch(() => null) as { status?: string } | null;
    if (!response.ok()) {
      throw new Error(`${label} returned HTTP ${response.status()}${body?.status ? ` (${body.status})` : ""}.`);
    }
    return body;
  } catch (error) {
    const detail = error instanceof Error && /timeout/i.test(error.message)
      ? "timed out after 5 seconds"
      : error instanceof Error
        ? error.message
        : "failed";
    throw new Error(`Playwright preflight failed: ${label} ${detail}`);
  }
}

export default async function globalSetup(config: FullConfig) {
  const configured = config.projects[0]?.use.baseURL;
  if (typeof configured !== "string") {
    throw new Error("Playwright preflight failed: PLAYWRIGHT_BASE_URL was not resolved.");
  }
  const baseUrl = configured.replace(/\/$/, "");
  const context = await request.newContext({
    baseURL: baseUrl,
    ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === "true",
  });
  try {
    const live = await probe(context, "/api/health/live", "liveness endpoint");
    if (live?.status !== "live") {
      throw new Error("Playwright preflight failed: liveness response is not the Dublancer live contract.");
    }
    const ready = await probe(context, "/api/health/ready", "readiness endpoint");
    if (ready?.status !== "ready") {
      throw new Error("Playwright preflight failed: PostgreSQL, Redis, or queue readiness is not healthy.");
    }
  } finally {
    await context.dispose();
  }
}
