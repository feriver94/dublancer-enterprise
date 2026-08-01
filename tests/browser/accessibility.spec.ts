import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/login", "/register", "/pricing"];

for (const route of publicRoutes) {
  test(`${route} has no serious accessibility violations`, async ({ page }) => {
    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.status()).toBeLessThan(400);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const material = scan.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );
    expect(material, JSON.stringify(material, null, 2)).toEqual([]);
  });

  test(`${route} remains within the responsive viewport`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
}

test("primary public navigation supports keyboard focus", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  await expect(focused).not.toHaveAttribute("tabindex", "-1");
});
