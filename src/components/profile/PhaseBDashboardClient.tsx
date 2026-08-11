"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useApiResource } from "@/lib/client/use-api-resource";
import { formatCurrencyMinor, formatNumber, formatUaeDate } from "@/lib/locale/formatters";
import type { AppLocale } from "@/i18n/config";

type ClientDashboard = {
  hiringOverview: Record<string, number>;
  openProjects: Array<{ id: string; title: string; status: string; _count: { proposals: number } }>;
  drafts: Array<{ id: string; title: string; status: string }>;
  proposalPipeline: Record<string, number>;
  invitations: Record<string, number>;
  contracts: Record<string, { count: number; valueMinor: string }>;
  payments: Array<{ status: string; currency: string; count: number; amountMinor: string }>;
  upcomingMilestones: Array<{ id: string; title: string; status: string; dueAt: string | null; amountMinor: string; currency: string }>;
  messages: { unread: number };
  savedFreelancers: number;
  savedAgencies: number;
  hiringAnalytics: Record<string, number>;
  quickActions: Array<{ key: string; href: string }>;
};

type FreelancerDashboard = {
  recommendedWork: Array<{ id: string; title: string; currency: string; budgetMinMinor: string | null; budgetMaxMinor: string | null; engagementType: string }>;
  invitations: Array<{ id: string; listing: { title: string; organization: { name: string; slug: string } } }>;
  proposals: Record<string, number>;
  contracts: Array<{ status: string; count: number; valueMinor: string }>;
  milestones: Array<{ id: string; title: string; status: string; amountMinor: string; currency: string; dueAt: string | null }>;
  tasks: Array<{ id: string; title: string; status: string; priority: string; dueAt: string | null; project: { title: string } }>;
  earningsSummary: { amountMinor: string; transactionCount: number };
  pendingWithdrawals: { amountMinor: string; count: number };
  messages: { unread: number };
  calendar: { milestones: Array<{ id: string; title: string; dueAt: string | null }>; tasks: Array<{ id: string; title: string; dueAt: string | null }> };
  reviewsSummary: { average: number | null; count: number };
  profileCompletion: { percentage: number; completed: number; total: number; missing: string[] };
  portfolioPerformance: Array<{ contentType: string; visibility: string; count: number }>;
  skillVerification: { total: number; verified: number };
  quickActions: Array<{ key: string; href: string }>;
};

function title(value: string) { return value.replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }

function Metrics({ items, summary = false }: { items: Array<{ key: string; label: string; value: React.ReactNode; detail?: string }>; summary?: boolean }) {
  return <div className={`phase-dashboard__metrics${summary ? " phase-dashboard__metrics--summary" : ""}`}>{items.map((item) => <article key={item.key}><span>{item.label}</span><strong>{item.value}</strong>{item.detail ? <small>{item.detail}</small> : null}</article>)}</div>;
}

function Section({ titleText, children, empty }: { titleText: string; children: React.ReactNode; empty?: boolean }) {
  return <section className="phase-dashboard__section"><h2>{titleText}</h2>{empty ? <p className="profile-empty">—</p> : children}</section>;
}

export default function PhaseBDashboardClient({ mode }: { mode: "client" | "freelancer" }) {
  const t = useTranslations("ProfilePhaseB");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const statusText = (value: string) => status.has(value) ? status(value) : title(value);
  const metricsFromRecord = (values: Record<string, number>) => Object.entries(values).map(([key, value]) => ({ key, label: statusText(key), value: formatNumber(value, locale) }));
  const resource = useApiResource<ClientDashboard | FreelancerDashboard>(`/api/dashboard/${mode}`);
  if (resource.loading) return <div className="profile-loading" role="status">{t("loading")}</div>;
  if (resource.error) return <div className="phase-dashboard__error" role="alert"><p>{resource.error}</p><button type="button" onClick={() => void resource.refresh()}>{t("retry")}</button></div>;
  if (!resource.data) return <div className="profile-empty">{t("empty")}</div>;

  if (mode === "client") {
    const data = resource.data as ClientDashboard;
    return <div className="phase-dashboard">
      <header className="phase-dashboard__header"><div><p>{t("clientDashboard")}</p><h1>{t("hiringCommandCenter")}</h1></div><button type="button" onClick={() => void resource.refresh()}>{t("refresh")}</button></header>
      <Metrics summary items={[
        { key: "openProjects", label: t("openProjects"), value: formatNumber(data.hiringOverview.openProjects ?? 0, locale) },
        { key: "drafts", label: t("drafts"), value: formatNumber(data.hiringOverview.drafts ?? 0, locale) },
        { key: "activeContracts", label: t("activeContracts"), value: formatNumber(data.hiringOverview.activeContracts ?? 0, locale) },
        { key: "pendingSignatures", label: t("pendingSignatures"), value: formatNumber(data.hiringOverview.pendingSignatures ?? 0, locale) },
        { key: "unreadMessages", label: t("unreadMessages"), value: formatNumber(data.messages.unread, locale) },
        { key: "savedFreelancers", label: t("savedFreelancers"), value: formatNumber(data.savedFreelancers, locale) },
        { key: "savedAgencies", label: t("savedAgencies"), value: formatNumber(data.savedAgencies, locale) },
      ]} />
      <div className="phase-dashboard__grid">
        <Section titleText={t("openProjects")} empty={!data.openProjects.length}><div className="phase-dashboard__list">{data.openProjects.map((item) => <Link key={item.id} href={`/marketplace/listings/${item.id}`}><strong>{item.title}</strong><span>{item._count.proposals} {t("proposals")}</span></Link>)}</div></Section>
        <Section titleText={t("drafts")} empty={!data.drafts.length}><div className="phase-dashboard__list">{data.drafts.map((item) => <Link key={item.id} href={`/marketplace/listings/${item.id}`}><strong>{item.title}</strong><span>{statusText(item.status)}</span></Link>)}</div></Section>
        <Section titleText={t("proposalPipeline")}><Metrics items={metricsFromRecord(data.proposalPipeline)} /></Section>
        <Section titleText={t("invitations")}><Metrics items={metricsFromRecord(data.invitations)} /></Section>
        <Section titleText={t("activeContracts")}><Metrics items={Object.entries(data.contracts).map(([key, value]) => ({ key, label: statusText(key), value: formatNumber(value.count, locale), detail: formatCurrencyMinor(value.valueMinor, "AED", locale) }))} /></Section>
        <Section titleText={t("payments")} empty={!data.payments.length}><div className="phase-dashboard__list">{data.payments.map((item) => <article key={`${item.status}-${item.currency}`}><strong>{statusText(item.status)}</strong><span>{formatCurrencyMinor(item.amountMinor, item.currency, locale)} · {t("transactionCount", { count: item.count })}</span></article>)}</div></Section>
        <Section titleText={t("upcomingMilestones")} empty={!data.upcomingMilestones.length}><div className="phase-dashboard__list">{data.upcomingMilestones.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{formatCurrencyMinor(item.amountMinor, item.currency, locale)} · {item.dueAt ? formatUaeDate(item.dueAt, locale) : t("dateNotSet")}</span></article>)}</div></Section>
        <Section titleText={t("hiringAnalytics")}><Metrics items={[
          { key: "proposalsReceived", label: t("proposalsReceived"), value: formatNumber(data.hiringAnalytics.proposalsReceived ?? 0, locale) },
          { key: "acceptedProposals", label: t("acceptedProposals"), value: formatNumber(data.hiringAnalytics.acceptedProposals ?? 0, locale) },
          { key: "conversionRate", label: t("conversionRate"), value: `${formatNumber(data.hiringAnalytics.conversionRate ?? 0, locale)}%` },
          { key: "completedContracts", label: t("completedContracts"), value: formatNumber(data.hiringAnalytics.completedContracts ?? 0, locale) },
        ]} /></Section>
      </div>
      <nav className="phase-dashboard__actions" aria-label={t("quickActions")}>{data.quickActions.map((action) => <Link key={action.key} href={action.href}>{t.has(action.key) ? t(action.key) : title(action.key)}</Link>)}</nav>
    </div>;
  }

  const data = resource.data as FreelancerDashboard;
  return <div className="phase-dashboard">
    <header className="phase-dashboard__header"><div><p>{t("freelancerDashboard")}</p><h1>{t("workCommandCenter")}</h1></div><button type="button" onClick={() => void resource.refresh()}>{t("refresh")}</button></header>
    <Metrics summary items={[
      { key: "earnings", label: t("earnings"), value: formatCurrencyMinor(data.earningsSummary.amountMinor, "AED", locale), detail: t("transactionCount", { count: data.earningsSummary.transactionCount }) },
      { key: "pendingWithdrawals", label: t("pendingWithdrawals"), value: formatCurrencyMinor(data.pendingWithdrawals.amountMinor, "AED", locale), detail: t("transactionCount", { count: data.pendingWithdrawals.count }) },
      { key: "unreadMessages", label: t("unreadMessages"), value: formatNumber(data.messages.unread, locale) },
      { key: "profileCompletion", label: t("profileCompletion"), value: `${formatNumber(data.profileCompletion.percentage, locale)}%` },
      { key: "verifiedSkills", label: t("verifiedSkills"), value: `${formatNumber(data.skillVerification.verified, locale)} / ${formatNumber(data.skillVerification.total, locale)}` },
      { key: "reviewCount", label: t("reviews"), value: formatNumber(data.reviewsSummary.count, locale) },
    ]} />
    <div className="phase-dashboard__grid">
      <Section titleText={t("recommendedWork")} empty={!data.recommendedWork.length}><div className="phase-dashboard__list">{data.recommendedWork.map((item) => <Link key={item.id} href={`/marketplace/listings/${item.id}`}><strong>{item.title}</strong><span>{item.budgetMinMinor ? formatCurrencyMinor(item.budgetMinMinor, item.currency, locale) : t("budgetOpen")} – {item.budgetMaxMinor ? formatCurrencyMinor(item.budgetMaxMinor, item.currency, locale) : t("budgetOpen")}</span></Link>)}</div></Section>
      <Section titleText={t("invitations")} empty={!data.invitations.length}><div className="phase-dashboard__list">{data.invitations.map((item) => <article key={item.id}><strong>{item.listing.title}</strong><span>{item.listing.organization.name}</span></article>)}</div></Section>
      <Section titleText={t("proposals")}><Metrics items={metricsFromRecord(data.proposals)} /></Section>
      <Section titleText={t("activeContracts")} empty={!data.contracts.length}><div className="phase-dashboard__list">{data.contracts.map((item) => <article key={item.status}><strong>{statusText(item.status)}</strong><span>{t("contractSummary", { count: item.count, value: formatCurrencyMinor(item.valueMinor, "AED", locale) })}</span></article>)}</div></Section>
      <Section titleText={t("milestones")} empty={!data.milestones.length}><div className="phase-dashboard__list">{data.milestones.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{formatCurrencyMinor(item.amountMinor, item.currency, locale)} · {statusText(item.status)}</span></article>)}</div></Section>
      <Section titleText={t("tasks")} empty={!data.tasks.length}><div className="phase-dashboard__list">{data.tasks.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.project.title} · {statusText(item.status)}</span></article>)}</div></Section>
      <Section titleText={t("calendar")} empty={!data.calendar.milestones.length && !data.calendar.tasks.length}><div className="phase-dashboard__list">{[...data.calendar.milestones, ...data.calendar.tasks].map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.dueAt ? formatUaeDate(item.dueAt, locale) : t("dateNotSet")}</span></article>)}</div></Section>
      <Section titleText={t("portfolioPerformance")} empty={!data.portfolioPerformance.length}><div className="phase-dashboard__list">{data.portfolioPerformance.map((item) => <article key={`${item.contentType}-${item.visibility}`}><strong>{statusText(item.contentType)}</strong><span>{statusText(item.visibility)} · {formatNumber(item.count, locale)}</span></article>)}</div></Section>
    </div>
    <nav className="phase-dashboard__actions" aria-label={t("quickActions")}>{data.quickActions.map((action) => <Link key={action.key} href={action.href}>{t.has(action.key) ? t(action.key) : title(action.key)}</Link>)}</nav>
  </div>;
}
