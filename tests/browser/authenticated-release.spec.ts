import { createHmac } from "node:crypto";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

type ApiResult<T> = { status: number; data: T; error?: { code?: string; message?: string } };
type Persona = { id: string; type: "CLIENT" | "FREELANCER" | "ORGANIZATION"; status: string };
type PersonaOverview = { activePersonaId: string | null; account: { accountPersonas: Persona[] } };
type Proposal = { id: string; status: string; version: number; coverLetter: string; listing?: { id: string; title: string }; contract?: { id: string } | null };
type Submission = { id: string; status: string; version: number };
type Milestone = { id: string; status: string; version: number; submissions: Submission[] };
type ContractView = { id: string; title: string; status: string; version: number; valueMinor: string; currency: string; viewerParty: "CLIENT" | "PROVIDER"; termsHash: string; milestones: Milestone[] };
type Invoice = { id: string; status: string; version: number; paymentSchedules: Array<{ status: string }> };
type Charge = { id: string; status: string; organizationId: string; providerRef: string; amountMinor: string; currency: string };

function suffix(testInfo: TestInfo) {
  return `${testInfo.project.name.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

async function csrf(page: Page) {
  const response = await page.context().request.get("/api/auth/csrf");
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json() as { data: { csrfToken: string } };
  return body.data.csrfToken;
}

async function api<T = Record<string, unknown>>(
  page: Page,
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown; expected?: number[] } = {},
): Promise<ApiResult<T>> {
  const method = options.method ?? "GET";
  const token = method === "GET" ? undefined : await csrf(page);
  const response = await page.context().request.fetch(path, {
    method,
    headers: {
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { "x-csrf-token": token } : {}),
      origin: new URL(page.url() === "about:blank" ? test.info().project.use.baseURL as string : page.url()).origin,
    },
    ...(options.body === undefined ? {} : { data: options.body }),
  });
  const envelope = await response.json().catch(() => ({})) as { data: T; error?: { code?: string; message?: string } };
  const expected = options.expected ?? [200];
  expect(expected, `${method} ${path}: HTTP ${response.status()} ${JSON.stringify(envelope.error ?? {})}`).toContain(response.status());
  return { status: response.status(), data: envelope.data, error: envelope.error };
}

async function registerThroughUi(page: Page, email: string, displayName: string, password: string) {
  await page.goto("/register");
  await page.locator('input[name="displayName"]').fill(displayName);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login\?registered=1/);
}

async function loginThroughUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(onboarding|dashboard)/);
}

async function saveProfileForm(page: Page, form: Locator) {
  const saved = page.waitForResponse((response) =>
    response.request().method() === "PATCH" && new URL(response.url()).pathname === "/api/profile/settings");
  await form.getByRole("button", { name: "Save changes" }).click();
  const response = await saved;
  expect(response.status(), await response.text()).toBe(200);
  await expect(page.getByRole("status")).toContainText("Changes saved");
}

async function completeOnboarding(page: Page, selected: Array<Persona["type"]>, label: string) {
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Set up how you work on Dublancer" })).toBeVisible();
  const labels: Record<Persona["type"], RegExp> = {
    CLIENT: /^Client/,
    FREELANCER: /^Freelancer \/ provider/,
    ORGANIZATION: /^Organization/,
  };
  for (const type of Object.keys(labels) as Array<Persona["type"]>) {
    const button = page.getByRole("button", { name: labels[type] });
    const pressed = await button.getAttribute("aria-pressed") === "true";
    if (pressed !== selected.includes(type)) await button.click();
  }
  await page.locator('input[name="displayName"]').fill(label);
  await page.locator('input[name="countryCode"]').fill("AE");
  await page.locator('input[name="timezone"]').fill("Asia/Dubai");
  await page.locator('select[name="locale"]').selectOption("en-AE");
  if (selected.includes("CLIENT")) {
    await page.locator('input[name="clientDisplayName"]').fill(`${label} Client`);
    await page.locator('input[name="clientHeadline"]').fill("Release-ready hiring team");
  }
  if (selected.includes("FREELANCER")) {
    await page.locator('input[name="freelancerHeadline"]').fill("Release readiness engineer");
    await page.locator('input[name="yearsExperience"]').fill("8");
    await page.locator('textarea[name="freelancerBio"]').fill("Deterministic browser release fixture provider.");
  }
  if (selected.includes("ORGANIZATION")) {
    await page.locator('input[name="legalName"]').fill(`${label} LLC`);
    await page.locator('input[name="tradingName"]').fill(`${label} Studio`);
  }
  await page.locator('button[value="complete"]').click();
  await expect(page).toHaveURL(/\/dashboard\/(client|freelancer)|\/dashboard/);
}

async function personas(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/personas", { credentials: "same-origin", cache: "no-store" });
    const envelope = await response.json() as { data?: PersonaOverview; error?: { code?: string; message?: string } };
    if (!response.ok || !envelope.data) {
      throw new Error(`GET /api/personas: HTTP ${response.status} ${JSON.stringify(envelope.error ?? {})}`);
    }
    return envelope.data;
  });
}

async function switchPersona(page: Page, type: Persona["type"]) {
  const overview = await personas(page);
  const target = overview.account.accountPersonas.find((item) => item.type === type && item.status === "ACTIVE");
  expect(target, `${type} persona must be active`).toBeTruthy();
  if (overview.activePersonaId === target?.id) return;
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "User profile" }).click();
  const switcher = page.getByLabel("Switch persona");
  const switched = page.waitForResponse((response) => response.url().includes("/api/personas/switch") && response.request().method() === "POST");
  await switcher.getByRole("button").filter({ hasText: new RegExp(`^.*${type} ·`) }).click();
  expect((await switched).ok()).toBeTruthy();
  await expect.poll(async () => (await personas(page)).activePersonaId, { timeout: 15_000 }).toBe(target?.id);
}

async function createListing(page: Page, title: string) {
  return (await api<{ id: string; title: string; version: number }>(page, "/api/marketplace/listings", {
    method: "POST",
    expected: [201],
    body: {
      title,
      description: "Deterministic authenticated browser release workflow listing.",
      engagementType: "FIXED_PRICE",
      experienceLevel: "EXPERT",
      budgetMaxMinor: "500000",
      currency: "AED",
      visibility: "PUBLIC",
      remoteAllowed: true,
      publish: true,
      skillIds: [],
    },
  })).data;
}

async function createProposal(page: Page, listingId: string, submit = true) {
  return (await api<Proposal>(page, "/api/marketplace/proposals", {
    method: "POST",
    expected: [201],
    body: {
      listingId,
      coverLetter: "A deterministic provider proposal for authenticated browser release verification.",
      bidMinor: "420000",
      currency: "AED",
      estimatedDays: 12,
      submit,
    },
  })).data;
}

async function awardProposal(page: Page, listing: { id: string; version: number; title: string }, proposal: Proposal, key: string) {
  const shortlisted = (await api<Proposal>(page, `/api/marketplace/proposals/${proposal.id}`, {
    method: "PATCH",
    body: { status: "SHORTLISTED", expectedVersion: proposal.version, note: "Browser release shortlist" },
  })).data;
  return (await api<{ id: string; title: string }>(page, `/api/marketplace/proposals/${proposal.id}/award`, {
    method: "POST",
    expected: [201],
    body: {
      idempotencyKey: `browser-award-${key}`,
      expectedListingVersion: listing.version,
      expectedProposalVersion: shortlisted.version,
      title: `${listing.title} contract`,
      taxRateBasisPoints: 0,
      platformFeeBasisPoints: 500,
      terms: { scope: "Authenticated browser release verification" },
    },
  })).data;
}

async function acceptContract(page: Page, contractId: string) {
  const view = (await api<ContractView>(page, `/api/contracts/${contractId}`)).data;
  await api(page, `/api/contracts/${contractId}/acceptances`, {
    method: "POST",
    expected: [201],
    body: {
      expectedVersion: view.version,
      party: view.viewerParty,
      method: "CLICKWRAP",
      termsHash: view.termsHash,
    },
  });
}

test("authenticated release-critical journey", async ({ browser, page }, testInfo) => {
  test.setTimeout(240_000);
  const run = suffix(testInfo);
  const password = "Browser!Release12345";
  const clientEmail = `browser-client-${run}@example.test`;
  const providerEmail = `browser-provider-${run}@example.test`;
  const providerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string });
  const providerPage = await providerContext.newPage();
  const outsiderContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string });
  const outsiderPage = await outsiderContext.newPage();

  try {
    await test.step("register, login, persist the session, navigate, log out and log in again", async () => {
      await registerThroughUi(page, clientEmail, `Browser Client ${run}`, password);
      await loginThroughUi(page, clientEmail, password);
      await completeOnboarding(page, ["CLIENT", "FREELANCER", "ORGANIZATION"], `Browser Client ${run}`);
      await switchPersona(page, "CLIENT");
      await page.reload();
      await expect(page.getByRole("button", { name: "User profile" })).toBeVisible();
      await page.goto("/marketplace");
      await expect(page.getByRole("heading", { name: "Marketplace" })).toBeVisible();
      await page.getByRole("button", { name: "User profile" }).click();
      await page.getByRole("button", { name: "Log out" }).click();
      await expect(page).toHaveURL(/\/login/);
      await loginThroughUi(page, clientEmail, password);
      await switchPersona(page, "CLIENT");

      await registerThroughUi(providerPage, providerEmail, `Browser Provider ${run}`, password);
      await loginThroughUi(providerPage, providerEmail, password);
      await completeOnboarding(providerPage, ["FREELANCER"], `Browser Provider ${run}`);
      await switchPersona(providerPage, "FREELANCER");
    });

    await test.step("validate the complete owned avatar lifecycle", async () => {
      await switchPersona(page, "CLIENT");
      await page.goto("/settings/profiles");
      await page.getByRole("button", { name: "Client profile" }).click();
      const media = page.getByRole("region", { name: "Avatar or logo URL" });
      const input = media.locator('input[type="file"]');
      await input.setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
      await expect(media.getByRole("alert")).toContainText("JPEG, PNG, or WebP");
      await input.setInputFiles({ name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
      await expect(media.getByRole("alert")).toContainText("5 MB or smaller");
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
      await input.setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
      await expect(media.getByRole("button", { name: "Confirm upload" })).toBeVisible();
      await media.getByRole("button", { name: "Confirm upload" }).click();
      await expect(media.getByRole("button", { name: "Change photo" })).toBeVisible();
      await page.getByRole("button", { name: "User profile" }).click();
      await expect(page.getByRole("dialog", { name: "User profile" }).locator('[style*="profile/media"]')).toBeVisible();
      await page.keyboard.press("Escape");
      await page.reload();
      await page.getByRole("button", { name: "Client profile" }).click();
      const persisted = page.getByRole("region", { name: "Avatar or logo URL" });
      await expect(persisted.getByRole("button", { name: "Change photo" })).toBeVisible();
      await persisted.locator('input[type="file"]').setInputFiles({ name: "avatar-changed.png", mimeType: "image/png", buffer: png });
      await persisted.getByRole("button", { name: "Confirm upload" }).click();
      await expect(persisted.getByRole("button", { name: "Remove photo" })).toBeVisible();
      await persisted.getByRole("button", { name: "Remove photo" }).click();
      await expect(persisted.getByRole("button", { name: "Upload photo" })).toBeVisible();
      await page.getByRole("button", { name: "User profile" }).click();
      await expect(page.getByRole("dialog", { name: "User profile" }).getByText("BC", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    });

    let primaryListing: { id: string; title: string; version: number };
    let milestoneContractId = "";
    await test.step("publish and browse a project, submit, shortlist and award a proposal", async () => {
      const title = `Browser milestone ${run}`;
      await page.goto("/marketplace");
      const form = page.locator("form.enterprise-form").filter({ has: page.locator('input[name="title"]') });
      await form.locator('input[name="title"]').fill(title);
      await form.locator('textarea[name="description"]').fill("A release-critical browser project with deterministic governed milestone coverage.");
      await form.locator('input[name="budget"]').fill("5000");
      await form.getByRole("button", { name: "Publish listing" }).click();
      const link = page.getByRole("link", { name: new RegExp(title) });
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href).toMatch(/^\/marketplace\/project\//);
      const id = href?.split("/").at(-1) ?? "";
      primaryListing = (await api<{ id: string; title: string; version: number }>(page, `/api/marketplace/listings/${id}`)).data;

      await providerPage.goto("/marketplace");
      await providerPage.locator("#marketplace-search").fill(title);
      await providerPage.locator("#marketplace-search").press("Enter");
      await providerPage.getByRole("link", { name: new RegExp(title) }).click();
      await expect(providerPage.getByRole("heading", { name: title })).toBeVisible();
      await providerPage.getByRole("link", { name: "Create proposal" }).click();
      await providerPage.locator('textarea[name="coverLetter"]').fill("A complete authenticated browser proposal with governed delivery evidence and deterministic scope.");
      await providerPage.locator('input[name="bid"]').fill("4200");
      await providerPage.locator('input[name="estimatedDays"]').fill("12");
      await providerPage.getByRole("button", { name: "Submit proposal" }).click();
      await expect(providerPage.getByText("Proposal submitted successfully.")).toBeVisible();

      await page.goto(`/marketplace/project/${primaryListing.id}`);
      const proposalCard = page.locator("article").filter({ hasText: `Browser Provider ${run}` });
      await proposalCard.getByRole("button", { name: "Shortlist" }).click();
      await expect(page.getByRole("status")).toContainText("Proposal shortlisted.");
      const awardForm = proposalCard.locator("form");
      await awardForm.locator('input[name="title"]').fill(`${title} contract`);
      page.once("dialog", (dialog) => dialog.accept());
      await awardForm.getByRole("button", { name: "Award proposal" }).click();
      await expect(page.getByRole("status")).toContainText("Award completed.");
      const proposals = (await api<Proposal[]>(page, `/api/marketplace/proposals?listingId=${primaryListing.id}`)).data;
      milestoneContractId = proposals.find((item) => item.contract)?.contract?.id ?? "";
      expect(milestoneContractId).not.toBe("");
    });

    await test.step("edit and withdraw a proposal with optimistic concurrency protection", async () => {
      const listing = await createListing(page, `Browser withdrawal ${run}`);
      const draft = await createProposal(providerPage, listing.id, false);
      const edited = (await api<Proposal>(providerPage, `/api/marketplace/proposals/${draft.id}`, {
        method: "PATCH",
        body: {
          coverLetter: "An edited deterministic draft proposal that preserves provider input before withdrawal.",
          bidMinor: "410000",
          currency: "AED",
          estimatedDays: 10,
          submit: false,
          expectedVersion: draft.version,
        },
      })).data;
      const token = await csrf(providerPage);
      const concurrent = await Promise.all([
        "first concurrent browser edit",
        "second concurrent browser edit",
      ].map((description) => providerPage.context().request.patch(`/api/marketplace/proposals/${draft.id}`, {
        headers: { "content-type": "application/json", "x-csrf-token": token, origin: new URL(providerPage.url()).origin },
        data: {
          coverLetter: `${description} with enough governed content for validation.`,
          bidMinor: "405000",
          currency: "AED",
          estimatedDays: 9,
          submit: false,
          expectedVersion: edited.version,
        },
      })));
      expect(concurrent.map((response) => response.status()).sort()).toEqual([200, 409]);

      await providerPage.goto("/marketplace");
      const proposalCard = providerPage.locator("article").filter({ hasText: listing.title });
      await expect(proposalCard).toBeVisible();
      providerPage.once("dialog", (dialog) => dialog.accept());
      await proposalCard.getByRole("button", { name: "Withdraw" }).click();
      await expect.poll(async () => {
        const rows = (await api<Proposal[]>(providerPage, "/api/marketplace/proposals")).data;
        return rows.find((item) => item.id === draft.id)?.status;
      }).toBe("WITHDRAWN");
    });

    await test.step("enforce persona sides, accept on both sides and expose milestones", async () => {
      await page.goto(`/contracts/${milestoneContractId}`);
      await expect(page.getByRole("heading", { name: primaryListing.title + " contract" })).toBeVisible();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /Accept as client/i }).click();
      await expect(page.getByRole("status")).toContainText("Acceptance evidence recorded.");

      await providerPage.goto(`/contracts/${milestoneContractId}`);
      await expect(providerPage.getByRole("heading", { name: primaryListing.title + " contract" })).toBeVisible();
      providerPage.once("dialog", (dialog) => dialog.accept());
      await providerPage.getByRole("button", { name: /Accept as provider/i }).click();
      await expect(providerPage.getByRole("status")).toContainText("Acceptance evidence recorded.");

      const milestoneTitle = `Browser milestone evidence ${run}`;
      await page.reload();
      const milestoneForm = page.locator("form.enterprise-form").filter({ has: page.locator('input[name="amount"]') });
      await milestoneForm.locator('input[name="title"]').fill(milestoneTitle);
      await milestoneForm.locator('input[name="amount"]').fill("1000");
      await milestoneForm.getByRole("button", { name: "Create milestone" }).click();
      await expect(page.getByText(milestoneTitle)).toBeVisible();
      await providerPage.reload();
      await expect(providerPage.getByText(milestoneTitle)).toBeVisible();

      const premature = await api(page, `/api/contracts/${milestoneContractId}/reviews`, {
        method: "POST",
        expected: [409],
        body: { overall: 5, quality: 5, communication: 5, delivery: 5, expertise: 5, professionalism: 5, body: "Not yet eligible." },
      });
      expect(premature.error?.code).toBe("CONFLICT");

      await switchPersona(page, "FREELANCER");
      await api(page, `/api/contracts/${milestoneContractId}`, { expected: [403, 404] });
      await api(page, `/api/contracts/${milestoneContractId}/reviews`, {
        method: "POST",
        expected: [403, 404],
        body: { overall: 5, hiringClarity: 5, communication: 5, paymentReliability: 5, professionalConduct: 5, body: "Wrong persona denied." },
      });
      await switchPersona(page, "CLIENT");
    });

    let completedContractId = "";
    await test.step("complete an eligible contract and protect directional reviews", async () => {
      const listing = await createListing(page, `Browser review ${run}`);
      const proposal = await createProposal(providerPage, listing.id, true);
      const contract = await awardProposal(page, listing, proposal, run);
      completedContractId = contract.id;
      await acceptContract(page, completedContractId);
      await acceptContract(providerPage, completedContractId);

      let clientContract = (await api<ContractView>(page, `/api/contracts/${completedContractId}`)).data;
      const milestone = (await api<Milestone>(page, `/api/contracts/${completedContractId}/milestones`, {
        method: "POST",
        expected: [201],
        body: {
          title: `Browser settlement ${run}`,
          description: "Release-certified governed delivery and settlement evidence.",
          amountMinor: clientContract.valueMinor,
          currency: clientContract.currency,
        },
      })).data;
      const providerContract = (await api<ContractView>(providerPage, `/api/contracts/${completedContractId}`)).data;
      const providerMilestone = providerContract.milestones.find((item) => item.id === milestone.id);
      expect(providerMilestone).toBeTruthy();
      await api<Submission>(providerPage, `/api/contracts/${completedContractId}/milestones/${milestone.id}/submissions`, {
        method: "POST",
        expected: [201],
        body: { note: "Authenticated browser delivery evidence.", expectedMilestoneVersion: providerMilestone?.version },
      });
      clientContract = (await api<ContractView>(page, `/api/contracts/${completedContractId}`)).data;
      const submittedMilestone = clientContract.milestones.find((item) => item.id === milestone.id);
      const submission = submittedMilestone?.submissions[0];
      expect(submittedMilestone?.status).toBe("SUBMITTED");
      expect(submission).toBeTruthy();
      await api(page, `/api/contracts/${completedContractId}/milestones/${milestone.id}/submissions`, {
        method: "PATCH",
        body: {
          submissionId: submission?.id,
          decision: "APPROVED",
          note: "Authenticated browser delivery accepted.",
          expectedMilestoneVersion: submittedMilestone?.version,
          expectedSubmissionVersion: submission?.version,
        },
      });

      const dueAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
      let invoice = (await api<Invoice>(page, "/api/finance/invoices", {
        method: "POST",
        expected: [201],
        body: {
          number: `BROWSER-${run}`,
          contractId: completedContractId,
          contractMilestoneId: milestone.id,
          currency: clientContract.currency,
          dueAt,
          lines: [{ description: "Authenticated browser settlement", quantity: 1, unitAmountMinor: clientContract.valueMinor, taxRateBasisPoints: 0 }],
        },
      })).data;
      invoice = (await api<Invoice>(page, `/api/finance/invoices/${invoice.id}`, {
        method: "PATCH",
        body: { action: "ISSUE", expectedVersion: invoice.version, dueAt },
      })).data;
      const charge = (await api<Charge>(page, "/api/finance/charges", {
        method: "POST",
        expected: [202],
        body: { invoiceId: invoice.id, idempotencyKey: `browser-charge-${run}` },
      })).data;
      expect(charge.status).toBe("PROCESSING");
      const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
      expect(webhookSecret, "PAYMENT_WEBHOOK_SECRET must be configured for release settlement").toBeTruthy();
      const webhookBody = JSON.stringify({
        type: "charge.succeeded",
        organizationId: charge.organizationId,
        providerReference: charge.providerRef,
        amountMinor: charge.amountMinor,
        currency: charge.currency,
      });
      const webhook = await page.context().request.post("/api/webhooks/payments/payment-broker", {
        headers: {
          "content-type": "application/json",
          "x-provider-event-id": `browser-charge-${run}`,
          "x-provider-signature": createHmac("sha256", webhookSecret ?? "").update(webhookBody).digest("hex"),
        },
        data: webhookBody,
      });
      expect(webhook.status(), await webhook.text()).toBe(202);
      invoice = (await api<Invoice>(page, `/api/finance/invoices/${invoice.id}`)).data;
      expect(invoice.status).toBe("PAID");
      expect(invoice.paymentSchedules[0]?.status).toBe("RELEASED");
      clientContract = (await api<ContractView>(page, `/api/contracts/${completedContractId}`)).data;
      const releasedMilestone = clientContract.milestones.find((item) => item.id === milestone.id);
      expect(releasedMilestone?.status).toBe("RELEASED");
      await api(page, `/api/contracts/${completedContractId}/milestones/${milestone.id}/closeout`, {
        method: "POST",
        body: { note: "Payment and authenticated browser evidence reconciled.", expectedVersion: releasedMilestone?.version },
      });

      const premature = await api(page, `/api/contracts/${completedContractId}/reviews`, {
        method: "POST",
        expected: [409],
        body: { overall: 5, quality: 5, communication: 5, delivery: 5, expertise: 5, professionalism: 5, body: "Premature review denied." },
      });
      expect(premature.status).toBe(409);

      await page.goto(`/contracts/${completedContractId}`);
      const completion = page.locator("form.enterprise-form").filter({ has: page.locator('textarea[name="note"]') }).filter({ hasText: "Confirm milestone closeout" });
      await completion.locator('textarea[name="note"]').fill("All deterministic browser contract obligations are complete.");
      await completion.locator('input[name="confirmed"]').check();
      page.once("dialog", (dialog) => dialog.accept());
      await completion.getByRole("button", { name: "Complete contract and linked project" }).click();
      await expect(page.getByRole("status")).toContainText("Contract and linked project completed.");

      await api(page, `/api/contracts/${completedContractId}/reviews`, {
        method: "POST",
        expected: [422],
        body: { overall: 6, quality: 5, communication: 5, delivery: 5, expertise: 5, professionalism: 5, body: "Invalid rating denied." },
      });
      await api(page, `/api/contracts/${completedContractId}/reviews`, {
        method: "POST",
        expected: [422],
        body: { overall: 5, hiringClarity: 5, communication: 5, paymentReliability: 5, professionalConduct: 5, body: "Wrong directional dimensions denied." },
      });

      const reviewToken = await csrf(page);
      const reviewBody = { overall: 5, quality: 5, communication: 5, delivery: 5, expertise: 5, professionalism: 5, title: "Browser verified provider", body: "The provider completed the authenticated browser engagement." };
      const concurrent = await Promise.all([1, 2].map(() => page.context().request.post(`/api/contracts/${completedContractId}/reviews`, {
        headers: { "content-type": "application/json", "x-csrf-token": reviewToken, origin: new URL(page.url()).origin },
        data: reviewBody,
      })));
      expect(concurrent.map((response) => response.status()).sort()).toEqual([201, 409]);
      await page.reload();
      await expect(page.getByText("Browser verified provider")).toBeVisible();
      await api(page, `/api/contracts/${completedContractId}/reviews`, { method: "POST", expected: [409], body: reviewBody });

      await providerPage.goto(`/contracts/${completedContractId}`);
      const reviewForm = providerPage.locator("form.enterprise-form").filter({ has: providerPage.locator('textarea[name="body"]') });
      await reviewForm.locator('input[name="title"]').fill("Browser verified client");
      await reviewForm.locator('textarea[name="body"]').fill("The client supplied clear requirements and reliable governed decisions.");
      await reviewForm.getByRole("button", { name: "Write review" }).click();
      await expect(providerPage.getByRole("status")).toContainText("Review published.");

      await registerThroughUi(outsiderPage, `browser-outsider-${run}@example.test`, `Browser Outsider ${run}`, password);
      await loginThroughUi(outsiderPage, `browser-outsider-${run}@example.test`, password);
      await completeOnboarding(outsiderPage, ["CLIENT"], `Browser Outsider ${run}`);
      await api(outsiderPage, `/api/contracts/${completedContractId}`, { expected: [404] });
      await api(outsiderPage, `/api/contracts/${completedContractId}/reviews`, {
        method: "POST",
        expected: [404],
        body: { overall: 5, quality: 5, communication: 5, delivery: 5, expertise: 5, professionalism: 5, body: "Cross-tenant review denied." },
      });
    });

    await test.step("transition profile visibility and protect the hidden public profile", async () => {
      const username = `pw${run.replace(/[^a-z0-9]/g, "").slice(0, 24)}`;
      await providerPage.goto("/settings/profiles");
      const personalForm = providerPage.locator("form.profile-form").filter({ has: providerPage.locator('input[name="username"]') });
      await personalForm.locator('input[name="username"]').fill(username);
      await saveProfileForm(providerPage, personalForm);
      await providerPage.getByRole("button", { name: "Freelancer profile" }).click();
      const freelancerForm = providerPage.locator("form.profile-form").filter({ has: providerPage.locator('select[name="visibility"]') });
      await freelancerForm.locator('select[name="visibility"]').selectOption("PUBLIC");
      await saveProfileForm(providerPage, freelancerForm);
      let response = await outsiderPage.goto(`/u/${username}/freelancer`);
      expect(response?.status()).toBe(200);

      await providerPage.getByRole("button", { name: "Freelancer profile" }).click();
      await freelancerForm.locator('select[name="visibility"]').selectOption("HIDDEN");
      await saveProfileForm(providerPage, freelancerForm);
      response = await outsiderPage.goto(`/u/${username}/freelancer`);
      expect(response?.status()).toBe(404);

      await providerPage.getByRole("button", { name: "Freelancer profile" }).click();
      await freelancerForm.locator('select[name="visibility"]').selectOption("PUBLIC");
      await saveProfileForm(providerPage, freelancerForm);
    });

    await test.step("verify both dashboards, global-search keyboard behavior, English, Arabic RTL and viewport bounds", async () => {
      await switchPersona(page, "CLIENT");
      await page.goto("/dashboard/client");
      await expect(page.getByRole("heading", { name: "Hiring command centre" })).toBeVisible();
      await switchPersona(providerPage, "FREELANCER");
      await providerPage.goto("/dashboard/freelancer");
      await expect(providerPage.getByRole("heading", { name: "Work command centre" })).toBeVisible();

      const projectTitle = `Sprint Audit ${run}`;
      const project = (await api<{ id: string }>(page, "/api/projects", {
        method: "POST",
        expected: [201],
        body: { title: projectTitle, slug: `sprint-audit-${run}`, description: "Exact global search browser fixture.", currency: "AED" },
      })).data;
      const searchProjects = async (actorPage: Page, query: string) => (
        await api<Array<{ entityId: string; title: string }>>(
          actorPage,
          `/api/search?q=${encodeURIComponent(query)}&entityType=project&take=10`,
        )
      ).data;
      for (const query of ["Sprint", "sprint", "Audit", projectTitle]) {
        expect((await searchProjects(page, query)).some((item) => item.entityId === project.id), `Search must find the exact project for ${query}`).toBe(true);
      }
      expect((await searchProjects(outsiderPage, projectTitle)).some((item) => item.entityId === project.id), "Search must preserve tenant isolation").toBe(false);

      await page.keyboard.press("Control+K");
      const dialog = page.getByRole("dialog", { name: "Search" });
      await expect(dialog).toBeVisible();
      const search = dialog.getByPlaceholder(/Search projects, tasks/);
      await search.fill(projectTitle);
      await expect(dialog.getByRole("button", { name: new RegExp(projectTitle) })).toBeVisible();
      await search.press("Tab");
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: new RegExp(projectTitle) })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`/workspace/project/${project.id}`));
      await page.keyboard.press("Control+K");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      const renamedTitle = `Renamed delivery ${run}`;
      await api(page, `/api/projects/${project.id}`, {
        method: "PATCH",
        body: { title: renamedTitle },
      });
      expect((await searchProjects(page, projectTitle)).some((item) => item.entityId === project.id), "The stale project title must leave search after rename").toBe(false);
      expect((await searchProjects(page, renamedTitle)).some((item) => item.entityId === project.id), "The renamed project must be searchable immediately").toBe(true);
      await api(page, `/api/projects/${project.id}`, { method: "DELETE" });
      expect((await searchProjects(page, renamedTitle)).some((item) => item.entityId === project.id), "Deleted projects must leave search immediately").toBe(false);
      const retainedProject = (await api<{ id: string }>(page, "/api/projects", {
        method: "POST",
        expected: [201],
        body: {
          title: `Backup restore evidence ${run}`,
          slug: `backup-restore-${run}`,
          description: "Representative project retained for encrypted backup and restore integrity verification.",
          currency: "AED",
        },
      })).data;
      expect(retainedProject.id).not.toBe("");

      await expect(page.locator("html")).toHaveAttribute("lang", "en-AE");
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      const baseURL = testInfo.project.use.baseURL as string;
      await page.context().addCookies([{ name: "dublancer_locale", value: "ar-AE", url: baseURL }]);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "ar-AE");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `${testInfo.project.name} must remain inside its viewport`).toBeLessThanOrEqual(dimensions.viewport + 1);
    });
  } finally {
    await Promise.allSettled([providerContext.close(), outsiderContext.close()]);
  }
});
