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
  assert.doesNotMatch(panel, /Add funds|Withdraw funds|Upload photo/);
});
