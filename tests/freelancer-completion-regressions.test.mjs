import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  majorAmountToMinor,
  MoneyInputError,
  nextInvoiceNumber,
  requestedInvoiceNumber,
} from "../src/lib/finance/invoice-input.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AED major-unit input converts exactly once to persisted minor units", () => {
  for (const [major, minor] of [
    ["1", 100n],
    ["10", 1_000n],
    ["100", 10_000n],
    ["123.45", 12_345n],
    ["5000", 500_000n],
  ]) assert.equal(majorAmountToMinor(major), minor);

  for (const invalid of ["", "-1", "1.001", "1,000", "Infinity", "NaN"]) {
    assert.throws(() => majorAmountToMinor(invalid), MoneyInputError);
  }
});

test("invoice numbering supports automatic annual sequences and intentional custom numbers", () => {
  assert.equal(requestedInvoiceNumber(undefined), null);
  assert.equal(requestedInvoiceNumber("INV-2026-"), null);
  assert.equal(requestedInvoiceNumber("CUSTOM-1042"), "CUSTOM-1042");
  assert.equal(nextInvoiceNumber(["INV-2026-000002", "INV-2025-999999", "CUSTOM-7"], 2026), "INV-2026-000003");
});

test("freelancer dashboard normalizes reputation fields and excludes self-owned recommendations", async () => {
  const [service, client] = await Promise.all([
    read("src/lib/services/profile-dashboard.service.ts"),
    read("src/components/profile/PhaseBDashboardClient.tsx"),
  ]);
  assert.match(service, /organizationId: \{ not: context\.organizationId \}/);
  assert.match(service, /average: reputation\.overall/);
  assert.match(service, /count: reputation\.reviewCount/);
  assert.match(client, /Number\.isFinite/);
  assert.match(client, /noReviewsYet/);
  assert.doesNotMatch(client, /profile-empty">—/);
});

test("release browser fixtures cancel published withdrawal listings before handoff", async () => {
  const browser = await read("tests/browser/authenticated-release.spec.ts");
  assert.match(browser, /withdrawalListingId/);
  assert.match(browser, /status: "CANCELLED"/);
  assert.match(browser, /dashboard\/freelancer/);
  assert.match(browser, /toHaveCount\(0\)/);
});

test("freelancer navigation stays focused on freelancer work and preserves server permission gates", async () => {
  const navigation = await read("src/components/layout/Navbar.tsx");
  const freelancer = navigation.slice(navigation.indexOf("const freelancerNavItems"), navigation.indexOf("export default async function Navbar"));
  assert.match(freelancer, /key: "workspace", href: "\/workspace", permission: "project\.read"/);
  assert.match(freelancer, /key: "proposals", href: "\/marketplace", permission: "marketplace\.proposal\.manage"/);
  assert.doesNotMatch(freelancer, /key: "deliveries"/);
  assert.match(navigation, /activePersonaType === "FREELANCER"[\s\S]*item\.key === "notifications"/);
});
