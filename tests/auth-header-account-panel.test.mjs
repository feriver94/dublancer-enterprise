import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("MANUAL-UI-001 keeps primary navigation bounded and preserves active state", () => {
  const navbar = read("src/components/layout/NavbarClient.tsx");
  assert.match(navbar, /primaryItems = items\.slice\(0, 4\)/);
  assert.match(navbar, /overflowItems = items\.slice\(4\)/);
  assert.match(navbar, /min-w-0 flex-1/);
  assert.match(navbar, /aria-current=/);
  assert.match(navbar, /xl:hidden/);
  assert.doesNotMatch(navbar, /overflow-x-auto/);
});

test("account panel uses real secure account actions and accessible modal behavior", () => {
  const navbar = read("src/components/layout/NavbarClient.tsx");
  const panel = read("src/components/layout/AccountPanel.tsx");
  assert.match(navbar, /api\/auth\/logout/);
  assert.match(navbar, /api\/personas\/switch/);
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /event\.key !== "Tab"/);
  assert.match(panel, /dublancer-theme/);
  assert.match(panel, /profile\.avatarUrl/);
  assert.match(panel, /createPortal/);
  assert.match(panel, /document\.body/);
  assert.doesNotMatch(panel, /Add funds|Withdraw funds|Upload photo/);
});

test("persona browser assertions use the same cookie jar as the switching UI", () => {
  const browser = read("tests/browser/authenticated-release.spec.ts");
  assert.match(browser, /page\.evaluate\(async \(\) =>/);
  assert.match(browser, /fetch\("\/api\/personas", \{ credentials: "same-origin"/);
  assert.match(browser, /waitForResponse\(\(response\) => response\.url\(\)\.includes\("\/api\/personas\/switch"\)/);
  assert.match(browser, /expect\(\(await switched\)\.ok\(\)\)\.toBeTruthy\(\)/);
  assert.doesNotMatch(browser, /return \(await api<PersonaOverview>\(page, "\/api\/personas"\)\)\.data/);
});

test("persona switch binds the replacement access cookie to its exact response", () => {
  const route = read("src/app/api/personas/switch/route.ts");
  const cookies = read("src/lib/auth/cookies.ts");
  assert.match(route, /const response = apiSuccess/);
  assert.match(route, /setAccessCookieOnResponse\(response, result\.accessToken\)/);
  assert.match(cookies, /response\.cookies\.set\(AUTH_CONFIG\.sessionCookieName/);
  assert.match(cookies, /httpOnly: true/);
  assert.match(cookies, /sameSite: "lax"/);
});
