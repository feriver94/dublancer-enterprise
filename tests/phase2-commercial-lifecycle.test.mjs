import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("marketplace award is tenant-scoped, idempotent and atomic", async () => {
  const [service, route, schema] = await Promise.all([
    read("src/lib/services/product-platform.service.ts"),
    read("src/app/api/marketplace/proposals/[proposalId]/award/route.ts"),
    read("prisma/schema.prisma"),
  ]);
  assert.match(route, /requireCsrfToken/);
  assert.match(route, /awardProposalSchema/);
  assert.match(service, /isolationLevel: "Serializable"/);
  assert.match(service, /scope: "marketplace\.proposal\.award"/);
  assert.match(service, /status: "AWARDED"/);
  assert.match(service, /id: \{ not: proposal\.id \}/);
  assert.match(service, /status: "REJECTED"/);
  assert.match(schema, /listingId\s+String\?\s+@unique/);
  assert.match(schema, /providerOrganizationId\s+String\?/);
});

test("contract activation requires immutable acceptance evidence", async () => {
  const [service, route, schema, migration] = await Promise.all([
    read("src/lib/services/commercial-platform.service.ts"),
    read("src/app/api/contracts/[contractId]/acceptances/route.ts"),
    read("prisma/schema.prisma"),
    read("prisma/migrations/20260719090000_governed_commercial_settlement/migration.sql"),
  ]);
  assert.match(route, /requireCsrfToken/);
  assert.match(route, /getRequestMetadata/);
  assert.match(service, /hashContractTerms/);
  assert.match(service, /acceptanceCount === 2 \? "ACTIVE"/);
  assert.match(schema, /model ContractAcceptance/);
  assert.match(schema, /@@unique\(\[contractId, party\]\)/);
  assert.match(migration, /CREATE TABLE "ContractAcceptance"/);
});

test("milestone submission decisions are optimistic and immutable", async () => {
  const [service, route, schema] = await Promise.all([
    read("src/lib/services/commercial-platform.service.ts"),
    read("src/app/api/contracts/[contractId]/milestones/[milestoneId]/submissions/route.ts"),
    read("prisma/schema.prisma"),
  ]);
  assert.match(route, /milestoneSubmissionSchema/);
  assert.match(route, /milestoneDecisionSchema/);
  assert.match(service, /expectedMilestoneVersion/);
  assert.match(service, /expectedSubmissionVersion/);
  assert.match(service, /workSubmissionDecision\.create/);
  assert.match(schema, /model WorkSubmissionDecision/);
  assert.match(schema, /@@unique\(\[submissionId\]\)/);
});

test("invoice, charge, webhook and refund state machines are governed", async () => {
  const [service, invoiceRoute, refundRoute, webhookRoute] = await Promise.all([
    read("src/lib/services/product-platform.service.ts"),
    read("src/app/api/finance/invoices/[invoiceId]/route.ts"),
    read("src/app/api/finance/refunds/route.ts"),
    read("src/app/api/webhooks/payments/[providerKey]/route.ts"),
  ]);
  assert.match(invoiceRoute, /requireCsrfToken/);
  assert.match(refundRoute, /requireCsrfToken/);
  assert.match(webhookRoute, /x-provider-signature/);
  assert.match(service, /Only a draft invoice can be issued/);
  assert.match(service, /organizationId_idempotencyKey/);
  assert.match(service, /verifyWebhook/);
  assert.match(service, /processingStatus: "PROCESSED"/);
  assert.match(service, /settleCharge/);
  assert.match(service, /settleRefund/);
  assert.match(service, /reconciliationRecord\.upsert/);
});

test("Phase 2 product interfaces expose both counterparty workflows", async () => {
  const [marketplace, review, contract, payments] = await Promise.all([
    read("src/components/marketplace/MarketplaceClient.tsx"),
    read("src/components/marketplace/ProposalReviewClient.tsx"),
    read("src/components/contracts/ContractDetailClient.tsx"),
    read("src/components/payments/PaymentsClient.tsx"),
  ]);
  assert.match(marketplace, /t\("providerTracking"\)/);
  for (const action of ["shortlist", "reject", "awardProposal"]) assert.match(review, new RegExp(`(?:common|t)\\(\"${action}\"`));
  assert.match(contract, /t\("acceptAs"/);
  assert.match(contract, /t\("submitMilestone"/);
  assert.match(contract, /t\("recordDecision"/);
  assert.match(payments, /t\("issueInvoice"\)/);
  assert.match(payments, /t\("chargeOutstanding"\)/);
  assert.match(payments, /t\("requestRefund"\)/);
  assert.match(payments, /t\("providerBoundaryDescription"\)/);
});

test("commercial database constraints prevent duplicate and invalid settlement records", async () => {
  const migration = await read("prisma/migrations/20260719090000_governed_commercial_settlement/migration.sql");
  assert.match(migration, /Contract_listingId_key/);
  assert.match(migration, /FinancialTransaction_providerKey_providerRef_key/);
  assert.match(migration, /Refund_organizationId_idempotencyKey_key/);
  assert.match(migration, /WorkSubmission_active_submission_key/);
  assert.match(migration, /Refund_amountMinor_check/);
  assert.match(migration, /PaymentSchedule_contractMilestoneId_key/);
});
