import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("MANUAL-UI-002 through MANUAL-UX-013 provide responsive profile and dashboard surfaces", async () => {
  const [settings, controls, control, css, dashboard, analytics, analyticsPage, paymentsPage] = await Promise.all([read("src/components/profile/ProfileSettingsClient.tsx"), read("src/components/profile/ProfileFormControls.tsx"), read("src/components/profile/ProfileMediaControl.tsx"), read("src/app/globals.css"), read("src/components/profile/PhaseBDashboardClient.tsx"), read("src/components/analytics/AnalyticsDashboardClient.tsx"), read("src/app/analytics/page.tsx"), read("src/app/payments/page.tsx")]);
  assert.match(settings, /ProfileMediaControl/);
  assert.match(settings, /target="organization"[\s\S]*?asset="logo"/);
  assert.match(settings, /MultiValueField/);
  assert.match(settings, /LocationsEditor/);
  assert.match(settings, /PortfolioEditor/);
  assert.match(settings, /capabilities\.manageContent/);
  assert.match(settings, /contentEditingPermission/);
  assert.doesNotMatch(settings, /languagesCsv|servicesCsv|technologiesCsv|hiringPreferencesJson|locationsJson|portfolioJson/);
  assert.match(controls, /type="hidden" name="locations"/);
  assert.match(controls, /type="hidden" name="portfolio"/);
  assert.match(controls, /profile-tags-field/);
  assert.match(control, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(control, /t\("confirmUpload"\)/);
  assert.match(control, /t\("removePhoto"\)/);
  assert.match(control, /asset === "avatar" \|\| asset === "logo"/);
  assert.doesNotMatch(control, /dublancer-profile-media/);
  assert.match(css, /profile-media-grid/);
  assert.match(css, /max-width:1440px/);
  assert.match(css, /\[dir="rtl"\] \.profile-media/);
  assert.match(css, /phase-dashboard__metrics--summary/);
  assert.match(css, /profile-permission-state/);
  assert.match(css, /profile-structured-editor__row/);
  assert.match(dashboard, /phase-dashboard__metrics/);
  assert.match(dashboard, /formatCurrencyMinor/);
  assert.match(dashboard, /pendingSignatures/);
  assert.match(analytics, /xl:grid-cols-\[minmax\(0,1fr\)_360px\]/);
  assert.match(analyticsPage, /className="analytics-shell" maxWidth="1440px"/);
  assert.match(paymentsPage, /className="payments-shell" maxWidth="1440px"/);
});

test("normal-user profile surfaces humanize countries, preferences and technical values", async () => {
  const [countries, client, freelancer, organization, comparison, primitives, service] = await Promise.all([read("src/lib/locale/countries.ts"), read("src/app/u/[username]/client/page.tsx"), read("src/app/u/[username]/freelancer/page.tsx"), read("src/app/org/[slug]/page.tsx"), read("src/components/marketplace/ProviderComparisonClient.tsx"), read("src/components/profile/ProfilePrimitives.tsx"), read("src/lib/services/profile-management.service.ts")]);
  assert.match(countries, /Intl\.DisplayNames/);
  for (const surface of [client, freelancer, organization, comparison]) assert.match(surface, /formatCountryName/);
  assert.match(client, /StructuredDetails/);
  assert.doesNotMatch(client, /JSON\.stringify|profile-json/);
  assert.match(primitives, /humanize/);
  assert.match(service, /editOrganizationIds/);
  assert.match(service, /manageContent/);
});

test("profile media is signed, owned, integrity checked, proxied and CSRF protected", async () => {
  const [media, service, intent, upload, remove] = await Promise.all([read("src/lib/profile/profile-media.ts"), read("src/lib/services/profile-media.service.ts"), read("src/app/api/profile/media/intents/route.ts"), read("src/app/api/profile/media/uploads/[token]/route.ts"), read("src/app/api/profile/media/route.ts")]);
  assert.match(media, /timingSafeEqual/);
  assert.match(media, /assertImageBytes/);
  assert.match(service, /intent\.userId !== context\.userId/);
  assert.match(service, /storageProvider\.verifyUpload/);
  assert.match(service, /\/api\/profile\/media\/\$\{reference\}/);
  for (const route of [intent, upload, remove]) assert.match(route, /requireCsrfToken\(request\)/);
});
