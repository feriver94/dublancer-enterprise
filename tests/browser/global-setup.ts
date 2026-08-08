import type { FullConfig } from "@playwright/test";

async function probe(url: string, label: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as { status?: string } | null;
    if (!response.ok) {
      throw new Error(`${label} returned HTTP ${response.status}${body?.status ? ` (${body.status})` : ""}.`);
    }
    return body;
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? "timed out after 5 seconds"
      : error instanceof Error
        ? error.message
        : "failed";
    throw new Error(`Playwright preflight failed: ${label} ${detail}`);
  } finally {
    clearTimeout(timeout);
  }
}

export default async function globalSetup(config: FullConfig) {
  const configured = config.projects[0]?.use.baseURL;
  if (typeof configured !== "string") {
    throw new Error("Playwright preflight failed: PLAYWRIGHT_BASE_URL was not resolved.");
  }
  const baseUrl = configured.replace(/\/$/, "");
  const live = await probe(`${baseUrl}/api/health/live`, "liveness endpoint");
  if (live?.status !== "live") {
    throw new Error("Playwright preflight failed: liveness response is not the Dublancer live contract.");
  }
  const ready = await probe(`${baseUrl}/api/health/ready`, "readiness endpoint");
  if (ready?.status !== "ready") {
    throw new Error("Playwright preflight failed: PostgreSQL, Redis, or queue readiness is not healthy.");
  }
}
