"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";

export type MarketplaceProposal = {
  id: string;
  status: string;
  version: number;
  coverLetter: string;
  bidMinor: string;
  currency: string;
  estimatedDays?: number | null;
  submittedAt?: string | null;
  submittedBy?: { id: string; displayName: string };
  freelancerProfile?: { headline: string; userId: string } | null;
  contract?: { id: string; status: string } | null;
  listing?: { id: string; title: string; organizationId: string; status: string; version: number };
};

const money = (minor: string, currency: string) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(Number(minor) / 100);

export default function ProposalReviewClient({
  listing,
  onChanged,
}: {
  listing: { id: string; title: string; status: string; version: number; proposals: MarketplaceProposal[] };
  onChanged: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function decide(proposal: MarketplaceProposal, status: "SHORTLISTED" | "REJECTED") {
    if (status === "REJECTED" && !window.confirm("Reject this proposal? This decision cannot be undone.")) return;
    setPending(`${proposal.id}:${status}`);
    setError("");
    setNotice("");
    try {
      await apiMutation(`/api/marketplace/proposals/${proposal.id}`, "PATCH", {
        status,
        expectedVersion: proposal.version,
        note: status === "SHORTLISTED" ? "Shortlisted by the listing owner." : "Rejected by the listing owner.",
      });
      setNotice(`Proposal ${status === "SHORTLISTED" ? "shortlisted" : "rejected"}.`);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The proposal decision could not be saved.");
    } finally {
      setPending("");
    }
  }

  async function award(event: FormEvent<HTMLFormElement>, proposal: MarketplaceProposal) {
    event.preventDefault();
    if (!window.confirm("Award this proposal? All competing proposals will be rejected atomically.")) return;
    const data = new FormData(event.currentTarget);
    setPending(`${proposal.id}:AWARD`);
    setError("");
    setNotice("");
    try {
      const contract = await apiMutation<{ id: string }>(
        `/api/marketplace/proposals/${proposal.id}/award`,
        "POST",
        {
          idempotencyKey: crypto.randomUUID(),
          expectedListingVersion: listing.version,
          expectedProposalVersion: proposal.version,
          title: data.get("title"),
          taxRateBasisPoints: Math.round(Number(data.get("taxRate")) * 100),
          platformFeeBasisPoints: Math.round(Number(data.get("platformFee")) * 100),
          terms: {
            summary: data.get("terms"),
            proposalId: proposal.id,
            listingId: listing.id,
          },
          startsAt: data.get("startsAt") || undefined,
          endsAt: data.get("endsAt") || undefined,
        },
      );
      setNotice(`Award completed. Contract ${contract.id} is awaiting signatures.`);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The proposal could not be awarded.");
    } finally {
      setPending("");
    }
  }

  return (
    <Card variant="elevated">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold uppercase tracking-widest text-[#009A44]">Owner proposal management</p>
          <h2 className="mt-1 text-2xl font-bold text-[#0F4C5C]">Review and award</h2>
        </div>
        <Badge variant={listing.status === "AWARDED" ? "success" : "info"}>{listing.status}</Badge>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Shortlist, reject or atomically award a proposal. Awarding creates one governed contract and rejects every competing proposal.
      </p>
      {error ? <p className="enterprise-error mt-4" role="alert">{error}</p> : null}
      {notice ? <p className="enterprise-notice mt-4" role="status">{notice}</p> : null}
      <div className="mt-5 grid gap-4">
        {listing.proposals.length ? listing.proposals.map((proposal) => (
          <article key={proposal.id} className="rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#0F4C5C]">{proposal.submittedBy?.displayName ?? "Marketplace provider"}</h3>
                <p className="text-sm text-slate-500">{proposal.freelancerProfile?.headline ?? "Provider profile"}</p>
              </div>
              <div className="text-end">
                <Badge variant={proposal.status === "ACCEPTED" ? "success" : proposal.status === "REJECTED" ? "neutral" : "info"}>{proposal.status}</Badge>
                <p className="mt-2 font-bold text-[#009A44]">{money(proposal.bidMinor, proposal.currency)}</p>
                {proposal.estimatedDays ? <p className="text-sm text-slate-500">{proposal.estimatedDays} days</p> : null}
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{proposal.coverLetter}</p>
            {proposal.contract ? (
              <Link href={`/contracts/${proposal.contract.id}`} className="mt-4 inline-block font-bold text-[#009A44]">
                Open contract · {proposal.contract.status.replaceAll("_", " ")}
              </Link>
            ) : null}
            {listing.status === "PUBLISHED" && ["SUBMITTED", "SHORTLISTED", "REVISION_REQUESTED"].includes(proposal.status) ? (
              <div className="mt-5 grid gap-4">
                <div className="flex flex-wrap gap-3">
                  {proposal.status === "SUBMITTED" ? (
                    <Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => void decide(proposal, "SHORTLISTED")}>
                      {pending === `${proposal.id}:SHORTLISTED` ? "Saving…" : "Shortlist"}
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => void decide(proposal, "REJECTED")}>
                    {pending === `${proposal.id}:REJECTED` ? "Saving…" : "Reject"}
                  </Button>
                </div>
                <form className="enterprise-form rounded-xl bg-slate-50 p-4" onSubmit={(event) => void award(event, proposal)}>
                  <h4 className="font-bold text-[#0F4C5C]">Award and create contract</h4>
                  <label>Contract title<input name="title" defaultValue={`${listing.title} contract`} minLength={3} required /></label>
                  <label>Commercial terms<textarea name="terms" defaultValue="Delivery will follow the awarded proposal and approved contract milestones." minLength={10} required /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>Start date<input name="startsAt" type="date" /></label>
                    <label>End date<input name="endsAt" type="date" /></label>
                    <label>Tax rate (%)<input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue="5" required /></label>
                    <label>Platform fee (%)<input name="platformFee" type="number" min="0" max="100" step="0.01" defaultValue="10" required /></label>
                  </div>
                  <Button disabled={Boolean(pending)}>{pending === `${proposal.id}:AWARD` ? "Awarding atomically…" : "Award proposal"}</Button>
                </form>
              </div>
            ) : null}
          </article>
        )) : <p className="enterprise-empty">No proposals have been submitted.</p>}
      </div>
    </Card>
  );
}
