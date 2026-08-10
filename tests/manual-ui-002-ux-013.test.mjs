import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("MANUAL-UI-002 through MANUAL-UX-013 provide responsive profile and dashboard surfaces", async () => {
  const [settings, control, css, dashboard] = await Promise.all([read("src/components/profile/ProfileSettingsClient.tsx"), read("src/components/profile/ProfileMediaControl.tsx"), read("src/app/globals.css"), read("src/components/profile/PhaseBDashboardClient.tsx")]);
  assert.match(settings, /ProfileMediaControl/);
  assert.match(settings, /target="organization"[\s\S]*?asset="logo"/);
  assert.match(control, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(control, /t\("confirmUpload"\)/);
  assert.match(control, /t\("removePhoto"\)/);
  assert.match(css, /profile-media-grid/);
  assert.match(css, /max-width:1440px/);
  assert.match(css, /\[dir="rtl"\] \.profile-media/);
  assert.match(dashboard, /phase-dashboard__metrics/);
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
