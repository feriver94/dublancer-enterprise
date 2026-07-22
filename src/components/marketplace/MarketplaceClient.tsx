"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import ProposalReviewClient, {
  type MarketplaceProposal,
} from "./ProposalReviewClient";
import type { AppLocale } from "@/i18n/config";
import { formatAed } from "@/lib/locale/formatters";

type Listing = {
  id: string;
  title: string;
  description: string;
  status: string;
  engagementType: string;
  version: number;
  isOwner?: boolean;
  canReviewProposals?: boolean;
  experienceLevel: string;
  budgetMinMinor?: string | null;
  budgetMaxMinor?: string | null;
  currency: string;
  remoteAllowed: boolean;
  publishedAt?: string | null;
  organization: { id: string; name: string; slug: string };
  skills: Array<{ skill: { id: string; name: string } }>;
  proposals?: MarketplaceProposal[];
  _count?: { proposals: number; savedBy?: number };
};
type Profile = {
  headline: string;
  bio?: string | null;
  hourlyRateMinor?: string | null;
  currency: string;
  availability: string;
  timezone: string;
  countryCode: string;
  locale: string;
  yearsExperience: number;
  isPublic: boolean;
};

const money = (
  minor: string | null | undefined,
  locale: AppLocale,
  openBudget: string,
) => (minor == null ? openBudget : formatAed(Number(minor) / 100, locale));

export default function MarketplaceClient({
  listingId,
  proposalForId,
  profile = false,
}: {
  listingId?: string;
  proposalForId?: string;
  profile?: boolean;
}) {
  if (profile) return <ProfileEditor />;
  if (proposalForId) return <ProposalEditor listingId={proposalForId} />;
  if (listingId) return <ListingDetail listingId={listingId} />;
  return <ListingDirectory />;
}

function ListingDirectory() {
  const t = useTranslations("Marketplace");
  const common = useTranslations("Common");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const listings = useApiResource<Listing[]>(
    `/api/marketplace/listings?take=100${search ? `&query=${encodeURIComponent(search)}` : ""}`,
  );
  const proposals = useApiResource<MarketplaceProposal[]>(
    "/api/marketplace/proposals",
  );
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await apiMutation("/api/marketplace/listings", "POST", {
        title: data.get("title"),
        description: data.get("description"),
        engagementType: data.get("engagementType"),
        experienceLevel: data.get("experienceLevel"),
        budgetMaxMinor: String(Math.round(Number(data.get("budget")) * 100)),
        currency: "AED",
        visibility: "PUBLIC",
        remoteAllowed: true,
        publish: true,
        skillIds: [],
      });
      form.reset();
      await listings.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("createFailed"));
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-bold uppercase tracking-widest text-[#009A44]">
            {t("eyebrow")}
          </p>
          <h1 className="text-4xl font-bold text-[#0F4C5C]">{t("title")}</h1>
        </div>
        <Link
          href="/marketplace/profile"
          className="rounded-full bg-[#0F4C5C] px-5 py-3 font-bold text-white"
        >
          {t("manageProfile")}
        </Link>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="grid gap-6">
          <Card variant="elevated">
            <form
              className="mb-6 flex gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(query.trim());
              }}
            >
              <label className="sr-only" htmlFor="marketplace-search">
                {t("searchMarketplace")}
              </label>
              <input
                id="marketplace-search"
                className="w-full rounded-full border px-5 py-3"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
              />
              <Button>{common("search")}</Button>
            </form>
            {listings.error ? (
              <p className="enterprise-error">{listings.error}</p>
            ) : null}
            {listings.loading ? (
              <p className="enterprise-loading">{t("loading")}</p>
            ) : listings.data?.length ? (
              <div className="grid gap-4">
                {listings.data.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/marketplace/project/${listing.id}`}
                    className="rounded-2xl border border-slate-200 p-5 hover:border-[#009A44]"
                  >
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-[#0F4C5C]">
                          {listing.title}
                        </h2>
                        <p className="text-sm text-slate-500">
                          {listing.organization.name} ·{" "}
                          {status.has(listing.engagementType)
                            ? status(listing.engagementType)
                            : listing.engagementType.replaceAll("_", " ")}
                        </p>
                      </div>
                      <Badge variant="success">
                        {status.has(listing.status)
                          ? status(listing.status)
                          : listing.status}
                      </Badge>
                    </div>
                    <p className="mt-3 line-clamp-2 text-slate-600">
                      {listing.description}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-between gap-3 font-bold text-[#009A44]">
                      <span>
                        {money(listing.budgetMaxMinor, locale, t("openBudget"))}
                      </span>
                      <span>
                        {t("proposalCount", {
                          count: listing._count?.proposals ?? 0,
                        })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="enterprise-empty">{t("noListings")}</p>
            )}
          </Card>
          <ProviderProposalTracking resource={proposals} />
        </section>
        <aside>
          <Card variant="elevated">
            <h2 className="mb-4 text-xl font-bold text-[#0F4C5C]">
              {t("publishProject")}
            </h2>
            <p className="mb-4 text-sm text-slate-600">
              {t("publishDescription")}
            </p>
            <form className="enterprise-form" onSubmit={create}>
              <label>
                {common("title")}
                <input name="title" minLength={5} required />
              </label>
              <label>
                {common("description")}
                <textarea name="description" minLength={20} required />
              </label>
              <label>
                {t("engagement")}
                <select name="engagementType" defaultValue="FIXED_PRICE">
                  {["FIXED_PRICE", "HOURLY", "RETAINER", "EMPLOYMENT"].map((value) => <option key={value} value={value}>{status(value)}</option>)}
                </select>
              </label>
              <label>
                {t("experience")}
                <select name="experienceLevel" defaultValue="INTERMEDIATE">
                  {["ENTRY", "INTERMEDIATE", "EXPERT"].map((value) => <option key={value} value={value}>{status(value)}</option>)}
                </select>
              </label>
              <label>
                {t("maximumBudgetAed")}
                <input
                  name="budget"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              {error ? <p className="enterprise-error">{error}</p> : null}
              <Button disabled={pending}>
                {pending ? t("publishing") : t("publishListing")}
              </Button>
            </form>
          </Card>
        </aside>
      </div>
    </main>
  );
}

function ProviderProposalTracking({
  resource,
}: {
  resource: ReturnType<typeof useApiResource<MarketplaceProposal[]>>;
}) {
  const t = useTranslations("Marketplace");
  const common = useTranslations("Common");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  async function withdraw(proposal: MarketplaceProposal) {
    if (!window.confirm(t("withdrawConfirm"))) return;
    setPending(proposal.id);
    setError("");
    try {
      await apiMutation(`/api/marketplace/proposals/${proposal.id}`, "PATCH", {
        status: "WITHDRAWN",
        expectedVersion: proposal.version,
        note: t("withdrawalNote"),
      });
      await resource.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("withdrawFailed"));
    } finally {
      setPending("");
    }
  }
  return (
    <Card variant="elevated">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold uppercase tracking-widest text-[#009A44]">
            {t("providerTracking")}
          </p>
          <h2 className="text-xl font-bold text-[#0F4C5C]">
            {t("myProposals")}
          </h2>
        </div>
        <button
          type="button"
          className="rounded-full border px-4 py-2 text-sm font-bold"
          onClick={() => void resource.refresh()}
        >
          {common("refresh")}
        </button>
      </div>
      {resource.error || error ? (
        <p className="enterprise-error mt-4">{resource.error || error}</p>
      ) : null}
      {resource.loading ? (
        <p className="enterprise-loading mt-4">{t("loadingProposals")}</p>
      ) : resource.data?.length ? (
        <div className="mt-4 grid gap-3">
          {resource.data.map((proposal) => (
            <article key={proposal.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <Link
                    href={`/marketplace/project/${proposal.listing?.id ?? ""}`}
                    className="font-bold text-[#0F4C5C]"
                  >
                    {proposal.listing?.title ?? t("marketplaceProposal")}
                  </Link>
                  <p className="text-sm text-slate-500">
                    {money(proposal.bidMinor, locale, t("openBudget"))}
                  </p>
                </div>
                <Badge
                  variant={proposal.status === "ACCEPTED" ? "success" : "info"}
                >
                  {status.has(proposal.status)
                    ? status(proposal.status)
                    : proposal.status}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {proposal.contract ? (
                  <Link
                    href={`/contracts/${proposal.contract.id}`}
                    className="font-bold text-[#009A44]"
                  >
                    {t("openContract")}
                  </Link>
                ) : null}
                {[
                  "DRAFT",
                  "SUBMITTED",
                  "SHORTLISTED",
                  "REVISION_REQUESTED",
                ].includes(proposal.status) ? (
                  <button
                    type="button"
                    disabled={Boolean(pending)}
                    className="font-bold text-red-700"
                    onClick={() => void withdraw(proposal)}
                  >
                    {pending === proposal.id ? t("withdrawing") : t("withdraw")}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="enterprise-empty mt-4">{t("noProposals")}</p>
      )}
    </Card>
  );
}

function ListingDetail({ listingId }: { listingId: string }) {
  const t = useTranslations("Marketplace");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const listing = useApiResource<Listing>(
    `/api/marketplace/listings/${listingId}`,
  );
  if (listing.loading)
    return <p className="enterprise-loading py-24">{t("loadingProject")}</p>;
  if (!listing.data)
    return (
      <main className="py-24">
        <p className="enterprise-error">{listing.error || t("notFound")}</p>
        <Link href="/marketplace">{t("return")}</Link>
      </main>
    );
  const row = listing.data;
  return (
    <main className="py-12">
      <Link href="/marketplace" className="font-bold text-[#009A44]">
        {t("title")}
      </Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="grid gap-6">
          <Card variant="elevated">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-bold text-[#009A44]">
                  {row.organization.name}
                </p>
                <h1 className="mt-2 text-4xl font-bold text-[#0F4C5C]">
                  {row.title}
                </h1>
              </div>
              <Badge variant="success">
                {status.has(row.status) ? status(row.status) : row.status}
              </Badge>
            </div>
            <p className="mt-6 whitespace-pre-wrap text-slate-700">
              {row.description}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {row.skills.map(({ skill }) => (
                <Badge key={skill.id} variant="neutral">
                  {skill.name}
                </Badge>
              ))}
            </div>
          </Card>
          {row.isOwner && row.canReviewProposals ? (
            <ProposalReviewClient
              listing={{
                id: row.id,
                title: row.title,
                status: row.status,
                version: row.version,
                proposals: row.proposals ?? [],
              }}
              onChanged={listing.refresh}
            />
          ) : null}
        </section>
        <aside className="grid content-start gap-5">
          <Card variant="elevated">
            <h2 className="text-xl font-bold text-[#0F4C5C]">
              {t("projectTerms")}
            </h2>
            <dl className="mt-4 grid gap-3">
              <div>
                <dt className="text-sm text-slate-500">{t("budget")}</dt>
                <dd className="font-bold">
                  {money(row.budgetMaxMinor, locale, t("openBudget"))}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">{t("engagement")}</dt>
                <dd>
                  {status.has(row.engagementType)
                    ? status(row.engagementType)
                    : row.engagementType.replaceAll("_", " ")}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">{t("experience")}</dt>
                <dd>
                  {status.has(row.experienceLevel)
                    ? status(row.experienceLevel)
                    : row.experienceLevel}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">{t("location")}</dt>
                <dd>
                  {row.remoteAllowed
                    ? t("remoteEnabled")
                    : t("locationRestricted")}
                </dd>
              </div>
            </dl>
            {!row.isOwner && row.status === "PUBLISHED" ? (
              <Link
                href={`/marketplace/project/${row.id}/proposal`}
                className="mt-6 block rounded-full bg-[#009A44] px-5 py-3 text-center font-bold text-white"
              >
                {t("createProposal")}
              </Link>
            ) : null}
          </Card>
          {!row.isOwner && row.proposals?.length ? (
            <Card>
              <h2 className="font-bold">{t("yourProposal")}</h2>
              <p className="mt-2">
                {t("proposalStatus", {
                  status: status.has(row.proposals[0].status)
                    ? status(row.proposals[0].status)
                    : row.proposals[0].status,
                })}
              </p>
              <p>{money(row.proposals[0].bidMinor, locale, t("openBudget"))}</p>
              {row.proposals[0].contract ? (
                <Link
                  href={`/contracts/${row.proposals[0].contract.id}`}
                  className="mt-3 inline-block font-bold text-[#009A44]"
                >
                  {t("openContract")}
                </Link>
              ) : null}
            </Card>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function ProposalEditor({ listingId }: { listingId: string }) {
  const t = useTranslations("Marketplace");
  const listing = useApiResource<Listing>(
    `/api/marketplace/listings/${listingId}`,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await apiMutation("/api/marketplace/proposals", "POST", {
        listingId,
        coverLetter: data.get("coverLetter"),
        bidMinor: String(Math.round(Number(data.get("bid")) * 100)),
        currency: "AED",
        estimatedDays: Number(data.get("estimatedDays")),
        submit: true,
      });
      setNotice(t("proposalSubmitted"));
      await listing.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("submitFailed"));
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl py-12">
      <Link
        href={`/marketplace/project/${listingId}`}
        className="font-bold text-[#009A44]"
      >
        {t("projectDetails")}
      </Link>
      <Card variant="elevated" className="mt-5">
        <p className="font-bold uppercase tracking-widest text-[#009A44]">
          {t("proposalWorkflow")}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[#0F4C5C]">
          {t("proposalFor", {
            title: listing.data?.title ?? t("marketplaceProject"),
          })}
        </h1>
        {listing.error ? (
          <p className="enterprise-error">{listing.error}</p>
        ) : null}
        <form className="enterprise-form mt-6" onSubmit={submit}>
          <label>
            {t("coverLetter")}
            <textarea
              name="coverLetter"
              minLength={20}
              maxLength={10000}
              required
            />
          </label>
          <label>
            {t("bidAed")}
            <input name="bid" type="number" min="0" step="0.01" required />
          </label>
          <label>
            {t("estimatedDays")}
            <input
              name="estimatedDays"
              type="number"
              min="1"
              max="3650"
              required
            />
          </label>
          {error ? <p className="enterprise-error">{error}</p> : null}
          {notice ? <p className="enterprise-notice">{notice}</p> : null}
          <Button disabled={pending || Boolean(notice)}>
            {pending ? t("submitting") : t("submitProposal")}
          </Button>
        </form>
      </Card>
    </main>
  );
}

function ProfileEditor() {
  const t = useTranslations("Marketplace");
  const status = useTranslations("Status");
  const profile = useApiResource<Profile | null>("/api/marketplace/profile");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setNotice("");
    const data = new FormData(event.currentTarget);
    try {
      await apiMutation("/api/marketplace/profile", "PUT", {
        headline: data.get("headline"),
        bio: String(data.get("bio") || "") || undefined,
        hourlyRateMinor: data.get("hourlyRate")
          ? String(Math.round(Number(data.get("hourlyRate")) * 100))
          : undefined,
        currency: "AED",
        availability: data.get("availability"),
        timezone: "Asia/Dubai",
        countryCode: "AE",
        locale: data.get("locale"),
        yearsExperience: Number(data.get("yearsExperience")),
        isPublic: data.get("isPublic") === "on",
      });
      setNotice(t("profileSaved"));
      await profile.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("profileSaveFailed"),
      );
    } finally {
      setPending(false);
    }
  }
  if (profile.loading)
    return <p className="enterprise-loading py-24">{t("loadingProfile")}</p>;
  const data = profile.data;
  return (
    <main className="mx-auto max-w-3xl py-12">
      <Link href="/marketplace" className="font-bold text-[#009A44]">
        {t("title")}
      </Link>
      <Card variant="elevated" className="mt-5">
        <h1 className="text-3xl font-bold text-[#0F4C5C]">
          {t("profileTitle")}
        </h1>
        <p className="mt-2 text-slate-600">{t("profileDescription")}</p>
        <form
          key={data?.headline ?? "new"}
          className="enterprise-form mt-6"
          onSubmit={save}
        >
          <label>
            {t("professionalHeadline")}
            <input
              name="headline"
              minLength={3}
              maxLength={160}
              defaultValue={data?.headline ?? ""}
              required
            />
          </label>
          <label>
            {t("bio")}
            <textarea name="bio" defaultValue={data?.bio ?? ""} />
          </label>
          <label>
            {t("hourlyRateAed")}
            <input
              name="hourlyRate"
              type="number"
              min="0"
              step="0.01"
              defaultValue={
                data?.hourlyRateMinor ? Number(data.hourlyRateMinor) / 100 : ""
              }
            />
          </label>
          <label>
            {t("availability")}
            <select
              name="availability"
              defaultValue={data?.availability ?? "AVAILABLE"}
            >
              {["AVAILABLE", "LIMITED", "UNAVAILABLE"].map((value) => <option key={value} value={value}>{status(value)}</option>)}
            </select>
          </label>
          <label>
            {t("yearsExperience")}
            <input
              name="yearsExperience"
              type="number"
              min="0"
              max="80"
              defaultValue={data?.yearsExperience ?? 0}
            />
          </label>
          <label>
            {t("locale")}
            <select name="locale" defaultValue={data?.locale ?? "en-AE"}>
              <option value="en-AE">{t("englishUae")}</option>
              <option value="ar-AE">{t("arabicUae")}</option>
            </select>
          </label>
          <label className="flex-row items-center">
            <input
              name="isPublic"
              type="checkbox"
              className="h-4 w-4"
              defaultChecked={data?.isPublic ?? true}
            />{" "}
            {t("publicProfile")}
          </label>
          {profile.error || error ? (
            <p className="enterprise-error">{profile.error || error}</p>
          ) : null}
          {notice ? <p className="enterprise-notice">{notice}</p> : null}
          <Button disabled={pending}>
            {pending ? t("saving") : t("saveProfile")}
          </Button>
        </form>
      </Card>
    </main>
  );
}
