"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import type { AppLocale } from "@/i18n/config";
import { formatAed } from "@/lib/locale/formatters";

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

export default function ProposalReviewClient({
  listing,
  onChanged,
}: {
  listing: { id: string; title: string; status: string; version: number; proposals: MarketplaceProposal[] };
  onChanged: () => Promise<unknown>;
}) {
  const t = useTranslations("Marketplace");
  const statusLabel = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function decide(proposal: MarketplaceProposal, status: "SHORTLISTED" | "REJECTED") {
    if (status === "REJECTED" && !window.confirm(t("rejectConfirm"))) return;
    setPending(`${proposal.id}:${status}`);
    setError("");
    setNotice("");
    try {
      await apiMutation(`/api/marketplace/proposals/${proposal.id}`, "PATCH", {
        status,
        expectedVersion: proposal.version,
        note: status === "SHORTLISTED" ? t("shortlistNote") : t("rejectNote"),
      });
      setNotice(status === "SHORTLISTED" ? t("shortlistedNotice") : t("rejectedNotice"));
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("decisionFailed"));
    } finally {
      setPending("");
    }
  }

  async function award(event: FormEvent<HTMLFormElement>, proposal: MarketplaceProposal) {
    event.preventDefault();
    if (!window.confirm(t("awardConfirm"))) return;
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
      setNotice(t("awardCompleted", { id: contract.id }));
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("awardFailed"));
    } finally {
      setPending("");
    }
  }

  return (
    <Card variant="elevated">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold uppercase tracking-widest text-[#009A44]">{t("ownerManagement")}</p>
          <h2 className="mt-1 text-2xl font-bold text-[#0F4C5C]">{t("reviewAndAward")}</h2>
        </div>
        <Badge variant={listing.status === "AWARDED" ? "success" : "info"}>{statusLabel.has(listing.status) ? statusLabel(listing.status) : listing.status}</Badge>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {t("reviewDescription")}
      </p>
      {error ? <p className="enterprise-error mt-4" role="alert">{error}</p> : null}
      {notice ? <p className="enterprise-notice mt-4" role="status">{notice}</p> : null}
      <div className="mt-5 grid gap-4">
        {listing.proposals.length ? listing.proposals.map((proposal) => (
          <article key={proposal.id} className="rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#0F4C5C]">{proposal.submittedBy?.displayName ?? t("marketplaceProvider")}</h3>
                <p className="text-sm text-slate-500">{proposal.freelancerProfile?.headline ?? t("providerProfile")}</p>
              </div>
              <div className="text-end">
                <Badge variant={proposal.status === "ACCEPTED" ? "success" : proposal.status === "REJECTED" ? "neutral" : "info"}>{statusLabel.has(proposal.status) ? statusLabel(proposal.status) : proposal.status}</Badge>
                <p className="mt-2 font-bold text-[#009A44]">{formatAed(Number(proposal.bidMinor) / 100, locale)}</p>
                {proposal.estimatedDays ? <p className="text-sm text-slate-500">{t("days", { count: proposal.estimatedDays })}</p> : null}
              </div>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{proposal.coverLetter}</p>
            {proposal.contract ? (
              <Link href={`/contracts/${proposal.contract.id}`} className="mt-4 inline-block font-bold text-[#009A44]">
                {t("openContract")} · {statusLabel.has(proposal.contract.status) ? statusLabel(proposal.contract.status) : proposal.contract.status.replaceAll("_", " ")}
              </Link>
            ) : null}
            {listing.status === "PUBLISHED" && ["SUBMITTED", "SHORTLISTED", "REVISION_REQUESTED"].includes(proposal.status) ? (
              <div className="mt-5 grid gap-4">
                <div className="flex flex-wrap gap-3">
                  {proposal.status === "SUBMITTED" ? (
                    <Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => void decide(proposal, "SHORTLISTED")}>
                      {pending === `${proposal.id}:SHORTLISTED` ? t("saving") : t("shortlist")}
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => void decide(proposal, "REJECTED")}>
                    {pending === `${proposal.id}:REJECTED` ? t("saving") : t("reject")}
                  </Button>
                </div>
                <form className="enterprise-form rounded-xl bg-slate-50 p-4" onSubmit={(event) => void award(event, proposal)}>
                  <h4 className="font-bold text-[#0F4C5C]">{t("awardCreateContract")}</h4>
                  <label>{t("contractTitle")}<input name="title" defaultValue={t("contractTitleDefault", { title: listing.title })} minLength={3} required /></label>
                  <label>{t("commercialTerms")}<textarea name="terms" defaultValue={t("commercialTermsDefault")} minLength={10} required /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>{t("startDate")}<input name="startsAt" type="date" /></label>
                    <label>{t("endDate")}<input name="endsAt" type="date" /></label>
                    <label>{t("taxRate")}<input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue="5" required /></label>
                    <label>{t("platformFee")}<input name="platformFee" type="number" min="0" max="100" step="0.01" defaultValue="10" required /></label>
                  </div>
                  <Button disabled={Boolean(pending)}>{pending === `${proposal.id}:AWARD` ? t("awarding") : t("awardProposal")}</Button>
                </form>
              </div>
            ) : null}
          </article>
        )) : <p className="enterprise-empty">{t("noneSubmitted")}</p>}
      </div>
    </Card>
  );
}
