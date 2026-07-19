import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const baseUrl = process.env.COMMERCIAL_TEST_BASE_URL ?? "http://127.0.0.1:3100";
const providerPort = Number(process.env.COMMERCIAL_TEST_PROVIDER_PORT ?? 4110);
const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET ?? "phase2-webhook-secret";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the commercial runtime verification.");

class CookieJar {
  cookies = new Map();
  absorb(response) {
    const values = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const first = value.split(";", 1)[0];
      const index = first.indexOf("=");
      if (index > 0) this.cookies.set(first.slice(0, index), first.slice(index + 1));
    }
  }
  header() { return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "); }
}

async function request(jar, path, { method = "GET", body, expected = [200], csrf = method !== "GET" } = {}) {
  let token;
  if (csrf) {
    const response = await fetch(`${baseUrl}/api/auth/csrf`, { headers: { cookie: jar.header() } });
    jar.absorb(response);
    const envelope = await response.json();
    assert.equal(response.status, 200, `CSRF bootstrap failed: ${JSON.stringify(envelope)}`);
    token = envelope.data.csrfToken;
  }
  const cookieHeader = jar.header();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { "x-csrf-token": token } : {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      origin: baseUrl,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  jar.absorb(response);
  const envelope = await response.json().catch(() => ({}));
  assert.ok(expected.includes(response.status), `${method} ${path}: expected ${expected}, received ${response.status}: ${JSON.stringify(envelope)}`);
  return { status: response.status, data: envelope.data, error: envelope.error };
}

async function actor(label) {
  const jar = new CookieJar();
  const email = `phase2-${label}-${randomUUID()}@example.test`;
  const password = "Phase2!Enterprise123";
  const registration = await request(jar, "/api/auth/register", { method: "POST", expected: [201], body: { email, displayName: `Phase 2 ${label}`, password } });
  await request(jar, "/api/auth/login", { method: "POST", body: { email, password, organizationId: registration.data.organizationId } });
  return { jar, email, userId: registration.data.id, organizationId: registration.data.organizationId };
}

let providerSequence = 0;
const providerOperations = [];
const provider = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  const type = req.url === "/v1/refunds" ? "refund" : "charge";
  const operation = { type, body, providerReference: `phase2-${type}-${++providerSequence}` };
  providerOperations.push(operation);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ providerReference: operation.providerReference, status: "PROCESSING", raw: { testProvider: true } }));
});

const listen = () => new Promise((resolve, reject) => { provider.once("error", reject); provider.listen(providerPort, "127.0.0.1", resolve); });
const close = () => new Promise((resolve) => provider.close(resolve));

function sign(raw) { return createHmac("sha256", webhookSecret).update(raw).digest("hex"); }
async function webhook(eventId, body, expected = [202]) {
  const raw = JSON.stringify(body);
  const response = await fetch(`${baseUrl}/api/webhooks/payments/payment-broker`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-provider-event-id": eventId, "x-provider-signature": sign(raw) },
    body: raw,
  });
  const envelope = await response.json();
  assert.ok(expected.includes(response.status), `Webhook ${eventId}: ${response.status} ${JSON.stringify(envelope)}`);
  return { status: response.status, data: envelope.data };
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  await listen();
  const [client, providerA, providerB] = await Promise.all([actor("client"), actor("provider-a"), actor("provider-b")]);

  for (const actorRow of [providerA, providerB]) {
    await request(actorRow.jar, "/api/marketplace/profile", { method: "PUT", body: {
      headline: `Verified provider ${actorRow.userId}`, bio: "Runtime commercial lifecycle provider.",
      hourlyRateMinor: "25000", currency: "AED", availability: "AVAILABLE", timezone: "Asia/Dubai",
      countryCode: "AE", locale: "en-AE", yearsExperience: 8, isPublic: true,
    } });
  }

  const listing = (await request(client.jar, "/api/marketplace/listings", { method: "POST", expected: [201], body: {
    title: "Phase 2 governed commercial delivery", description: "Runtime verification listing for atomic proposal award and settlement.",
    engagementType: "FIXED_PRICE", experienceLevel: "EXPERT", budgetMinMinor: "100000", budgetMaxMinor: "500000",
    currency: "AED", visibility: "PUBLIC", remoteAllowed: true, publish: true, skillIds: [],
  } })).data;

  const proposalPayload = (bidMinor) => ({ listingId: listing.id, coverLetter: "A complete governed delivery proposal with traceable milestones and evidence.", bidMinor, currency: "AED", estimatedDays: 30, submit: true });
  const [proposalA, proposalB] = await Promise.all([
    request(providerA.jar, "/api/marketplace/proposals", { method: "POST", expected: [201], body: proposalPayload("200000") }).then((row) => row.data),
    request(providerB.jar, "/api/marketplace/proposals", { method: "POST", expected: [201], body: proposalPayload("225000") }).then((row) => row.data),
  ]);

  const forbiddenAward = await request(providerB.jar, `/api/marketplace/proposals/${proposalA.id}/award`, { method: "POST", expected: [404], body: {
    idempotencyKey: randomUUID(), expectedListingVersion: listing.version, expectedProposalVersion: proposalA.version,
    title: "Unauthorized award", terms: {}, taxRateBasisPoints: 0, platformFeeBasisPoints: 0,
  } });
  assert.equal(forbiddenAward.status, 404, "A non-owning tenant must not discover or award the proposal.");

  const awardInput = (proposal, key) => ({ idempotencyKey: key, expectedListingVersion: listing.version, expectedProposalVersion: proposal.version, title: "Governed delivery contract", taxRateBasisPoints: 500, platformFeeBasisPoints: 1000, terms: { scope: "Phase 2 runtime verified", payment: "milestone" } });
  const keyA = randomUUID();
  const keyB = randomUUID();
  const concurrentAwards = await Promise.all([
    request(client.jar, `/api/marketplace/proposals/${proposalA.id}/award`, { method: "POST", expected: [201, 409], body: awardInput(proposalA, keyA) }),
    request(client.jar, `/api/marketplace/proposals/${proposalB.id}/award`, { method: "POST", expected: [201, 409], body: awardInput(proposalB, keyB) }),
  ]);
  assert.deepEqual(concurrentAwards.map((item) => item.status).sort(), [201, 409], "Exactly one concurrent award must succeed.");
  const winnerIndex = concurrentAwards.findIndex((item) => item.status === 201);
  const winner = winnerIndex === 0 ? { actor: providerA, proposal: proposalA, key: keyA } : { actor: providerB, proposal: proposalB, key: keyB };
  const loser = winnerIndex === 0 ? { actor: providerB, proposal: proposalB } : { actor: providerA, proposal: proposalA };
  const contract = concurrentAwards[winnerIndex].data;

  const listingAfter = (await request(client.jar, `/api/marketplace/listings/${listing.id}`)).data;
  assert.equal(listingAfter.status, "AWARDED");
  assert.equal(listingAfter.proposals.find((item) => item.id === winner.proposal.id).status, "ACCEPTED");
  assert.equal(listingAfter.proposals.find((item) => item.id === loser.proposal.id).status, "REJECTED");
  assert.equal(listingAfter.contracts.length, 1);
  const replay = await request(client.jar, `/api/marketplace/proposals/${winner.proposal.id}/award`, { method: "POST", expected: [201], body: awardInput(winner.proposal, winner.key) });
  assert.equal(replay.data.id, contract.id);
  await request(loser.actor.jar, `/api/contracts/${contract.id}`, { expected: [404] });

  let clientContract = (await request(client.jar, `/api/contracts/${contract.id}`)).data;
  await request(client.jar, `/api/contracts/${contract.id}/acceptances`, { method: "POST", expected: [201], body: { expectedVersion: clientContract.version, party: "CLIENT", method: "CLICKWRAP", termsHash: clientContract.termsHash } });
  let providerContract = (await request(winner.actor.jar, `/api/contracts/${contract.id}`)).data;
  await request(winner.actor.jar, `/api/contracts/${contract.id}/acceptances`, { method: "POST", expected: [201], body: { expectedVersion: providerContract.version, party: "PROVIDER", method: "CLICKWRAP", termsHash: providerContract.termsHash } });
  clientContract = (await request(client.jar, `/api/contracts/${contract.id}`)).data;
  assert.equal(clientContract.status, "ACTIVE");
  assert.equal(clientContract.acceptances.length, 2);

  const milestone = (await request(client.jar, `/api/contracts/${contract.id}/milestones`, { method: "POST", expected: [201], body: { title: "Accepted commercial deliverable", description: "Runtime verified deliverable.", amountMinor: contract.valueMinor, currency: "AED" } })).data;
  providerContract = (await request(winner.actor.jar, `/api/contracts/${contract.id}`)).data;
  const providerMilestone = providerContract.milestones.find((item) => item.id === milestone.id);
  const submissionAttempts = await Promise.all([
    request(winner.actor.jar, `/api/contracts/${contract.id}/milestones/${milestone.id}/submissions`, { method: "POST", expected: [201, 409], body: { note: "First concurrent delivery evidence.", expectedMilestoneVersion: providerMilestone.version } }),
    request(winner.actor.jar, `/api/contracts/${contract.id}/milestones/${milestone.id}/submissions`, { method: "POST", expected: [201, 409], body: { note: "Second concurrent delivery evidence.", expectedMilestoneVersion: providerMilestone.version } }),
  ]);
  assert.deepEqual(submissionAttempts.map((item) => item.status).sort(), [201, 409], "Exactly one concurrent submission must succeed.");
  clientContract = (await request(client.jar, `/api/contracts/${contract.id}`)).data;
  const submittedMilestone = clientContract.milestones.find((item) => item.id === milestone.id);
  const submission = submittedMilestone.submissions[0];
  await request(client.jar, `/api/contracts/${contract.id}/milestones/${milestone.id}/submissions`, { method: "PATCH", body: { submissionId: submission.id, decision: "APPROVED", note: "Accepted after client review.", expectedMilestoneVersion: submittedMilestone.version, expectedSubmissionVersion: submission.version } });
  clientContract = (await request(client.jar, `/api/contracts/${contract.id}`)).data;
  const acceptedMilestone = clientContract.milestones.find((item) => item.id === milestone.id);
  assert.equal(acceptedMilestone.status, "ACCEPTED");
  assert.equal(acceptedMilestone.submissions[0].decisions.length, 1);

  const dueAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
  let invoice = (await request(client.jar, "/api/finance/invoices", { method: "POST", expected: [201], body: { number: `PH2-${randomUUID()}`, contractId: contract.id, contractMilestoneId: milestone.id, currency: "AED", dueAt, lines: [{ description: "Accepted commercial deliverable", quantity: 1, unitAmountMinor: contract.valueMinor, taxRateBasisPoints: 0 }] } })).data;
  await request(client.jar, "/api/finance/invoices", { method: "POST", expected: [409], body: { number: `PH2-DUP-${randomUUID()}`, contractId: contract.id, contractMilestoneId: milestone.id, currency: "AED", dueAt, lines: [{ description: "Duplicate milestone invoice", quantity: 1, unitAmountMinor: contract.valueMinor, taxRateBasisPoints: 0 }] } });
  invoice = (await request(client.jar, `/api/finance/invoices/${invoice.id}`, { method: "PATCH", body: { action: "ISSUE", expectedVersion: invoice.version, dueAt } })).data;
  assert.equal(invoice.status, "ISSUED");
  const chargeKeys = [randomUUID(), randomUUID()];
  const chargeAttempts = await Promise.all(chargeKeys.map((idempotencyKey) => request(client.jar, "/api/finance/charges", { method: "POST", expected: [202, 409], body: { invoiceId: invoice.id, idempotencyKey } })));
  assert.deepEqual(chargeAttempts.map((item) => item.status).sort(), [202, 409], "Exactly one concurrent charge may reserve the invoice balance.");
  const chargeIndex = chargeAttempts.findIndex((item) => item.status === 202);
  const charge = chargeAttempts[chargeIndex].data;
  assert.equal(charge.status, "PROCESSING");
  const chargeReplay = await request(client.jar, "/api/finance/charges", { method: "POST", expected: [202], body: { invoiceId: invoice.id, idempotencyKey: chargeKeys[chargeIndex] } });
  assert.equal(chargeReplay.data.id, charge.id);
  const chargeOperation = providerOperations.find((item) => item.type === "charge" && item.providerReference === charge.providerRef);
  assert.ok(chargeOperation);
  const chargeEvent = { type: "charge.succeeded", organizationId: client.organizationId, providerReference: charge.providerRef, amountMinor: charge.amountMinor, currency: charge.currency };
  await webhook(`charge-${randomUUID()}`, chargeEvent);
  const duplicateEventId = `charge-duplicate-${randomUUID()}`;
  await webhook(duplicateEventId, chargeEvent);
  await webhook(duplicateEventId, chargeEvent);
  invoice = (await request(client.jar, `/api/finance/invoices/${invoice.id}`)).data;
  assert.equal(invoice.status, "PAID");
  assert.equal(invoice.paymentSchedules[0].status, "RELEASED");

  await request(winner.actor.jar, `/api/finance/invoices/${invoice.id}`, { expected: [200] });
  await request(loser.actor.jar, `/api/finance/invoices/${invoice.id}`, { expected: [404] });
  await request(winner.actor.jar, "/api/finance/charges", { method: "POST", expected: [404], body: { invoiceId: invoice.id, idempotencyKey: randomUUID() } });

  const refundAmount = (BigInt(charge.amountMinor) * BigInt(3) / BigInt(4)).toString();
  const refundAttempts = await Promise.all([randomUUID(), randomUUID()].map((idempotencyKey) => request(client.jar, "/api/finance/refunds", { method: "POST", expected: [202, 409], body: { transactionId: charge.id, amountMinor: refundAmount, reason: "Runtime verified bounded concurrent refund.", idempotencyKey } })));
  assert.deepEqual(refundAttempts.map((item) => item.status).sort(), [202, 409], "Concurrent refunds must not exceed the remaining refundable balance.");
  let refund = refundAttempts.find((item) => item.status === 202).data;
  assert.equal(refund.status, "PROCESSING");
  const refundEvent = { type: "refund.succeeded", organizationId: client.organizationId, providerReference: refund.providerRef, amountMinor: refund.amountMinor, currency: charge.currency };
  const refundEventId = `refund-${randomUUID()}`;
  await webhook(refundEventId, refundEvent);
  const replayMismatch = { ...refundEvent, amountMinor: "49999" };
  await webhook(refundEventId, replayMismatch, [409]);
  const refunds = (await request(client.jar, "/api/finance/refunds")).data;
  refund = refunds.find((item) => item.id === refund.id);
  assert.equal(refund.status, "COMPLETED");

  const reconciliation = await prisma.reconciliationRecord.findFirst({ where: { organizationId: client.organizationId, providerKey: "payment-broker" } });
  assert.ok(reconciliation);
  assert.equal(reconciliation.status, "MATCHED");
  assert.equal(reconciliation.expectedMinor, reconciliation.actualMinor);
  assert.equal(reconciliation.eventCount, 2, "Only one charge and one refund settlement may affect reconciliation.");

  console.log(JSON.stringify({
    result: "PASS", tenants: 3, listingId: listing.id, contractId: contract.id,
    proposalAward: "1 of 2 concurrent requests succeeded", contractAcceptances: 2,
    milestoneSubmission: "1 of 2 concurrent requests succeeded", immutableDecisions: 1,
    chargeReservation: "1 of 2 concurrent requests succeeded", refundReservation: "1 of 2 bounded concurrent requests succeeded",
    invoiceStatus: invoice.status, refundStatus: refund.status, reconciliationEvents: reconciliation.eventCount,
    tenantIsolation: "verified", permissions: "verified", webhookReplay: "verified",
  }, null, 2));
} finally {
  await prisma.$disconnect();
  await close().catch(() => undefined);
}
