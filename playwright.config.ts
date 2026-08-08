import { defineConfig, devices } from "@playwright/test";

function browserBaseUrl() {
  const value = process.env.PLAYWRIGHT_BASE_URL?.trim();
  if (!value) {
    throw new Error(
      "Playwright environment is not configured. Set PLAYWRIGHT_BASE_URL to a prestarted Dublancer environment with healthy PostgreSQL and Redis; see TESTING.md.",
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PLAYWRIGHT_BASE_URL must be a valid absolute HTTP(S) URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("PLAYWRIGHT_BASE_URL must use HTTP(S) and must not contain credentials.");
  }
  return url.toString().replace(/\/$/, "");
}

const baseURL = browserBaseUrl();

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  outputDir: "test-results/playwright",
  globalSetup: "./tests/browser/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
});
