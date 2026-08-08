"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useApiResource } from "@/lib/client/use-api-resource";

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
  invitations: Array<{ id: string; organization: { name: string; slug: string } }>;
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

function Metrics({ values }: { values: Record<string, string | number> }) {
  return <div className="phase-dashboard__metrics">{Object.entries(values).map(([key, value]) => <article key={key}><span>{title(key)}</span><strong>{value}</strong></article>)}</div>;
}

function Section({ titleText, children, empty }: { titleText: string; children: React.ReactNode; empty?: boolean }) {
  return <section className="phase-dashboard__section"><h2>{titleText}</h2>{empty ? <p className="profile-empty">—</p> : children}</section>;
}

export default function PhaseBDashboardClient({ mode }: { mode: "client" | "freelancer" }) {
  const t = useTranslations("ProfilePhaseB");
  const resource = useApiResource<ClientDashboard | FreelancerDashboard>(`/api/dashboard/${mode}`);
  if (resource.loading) return <div className="profile-loading" role="status">{t("loading")}</div>;
  if (resource.error) return <div className="phase-dashboard__error" role="alert"><p>{resource.error}</p><button type="button" onClick={() => void resource.refresh()}>{t("retry")}</button></div>;
  if (!resource.data) return <div className="profile-empty">{t("empty")}</div>;

  if (mode === "client") {
    const data = resource.data as ClientDashboard;
    return <div className="phase-dashboard">
      <header className="phase-dashboard__header"><div><p>{t("clientDashboard")}</p><h1>{t("hiringCommandCenter")}</h1></div><button type="button" onClick={() => void resource.refresh()}>{t("refresh")}</button></header>
      <Metrics values={{ ...data.hiringOverview, unreadMessages: data.messages.unread, savedFreelancers: data.savedFreelancers, savedAgencies: data.savedAgencies }} />
      <div className="phase-dashboard__grid">
        <Section titleText={t("openProjects")} empty={!data.openProjects.length}><div className="phase-dashboard__list">{data.openProjects.map((item) => <Link key={item.id} href={`/marketplace/listings/${item.id}`}><strong>{item.title}</strong><span>{item._count.proposals} {t("proposals")}</span></Link>)}</div></Section>
        <Section titleText={t("drafts")} empty={!data.drafts.length}><div className="phase-dashboard__list">{data.drafts.map((item) => <Link key={item.id} href={`/marketplace/listings/${item.id}`}><strong>{item.title}</strong><span>{item.status}</span></Link>)}</div></Section>
        <Section titleText={t("proposalPipeline")}><Metrics values={data.proposalPipeline} /></Section>
        <Section titleText={t("invitations")}><Metrics values={data.invitations} /></Section>
        <Section titleText={t("activeContracts")}><Metrics values={Object.fromEntries(Object.entries(data.contracts).map(([key, value]) => [key, value.count]))} /></Section>
        <Section titleText={t("payments")} empty={!data.payments.length}><div className="phase-dashboard__list">{data.payments.map((item) => <article key={`${item.status}-${item.currency}`}><strong>{title(item.status)}</strong><span>{item.amountMinor} {item.currency} · {item.count}</span></article>)}</div></Section>
        <Section titleText={t("upcomingMilestones")} empty={!data.upcomingMilestones.length}><div className="phase-dashboard__list">{data.upcomingMilestones.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.amountMinor} {item.currency} · {item.dueAt ? new Date(item.dueAt).toLocaleDateString() : "—"}</span></article>)}</div></Section>
        <Section titleText={t("hiringAnalytics")}><Metrics values={data.hiringAnalytics} /></Section>
      </div>
      <nav className="phase-dashboard__actions" aria-label={t("quickActions")}>{data.quickActions.map((action) => <Link key={action.key} href={action.href}>{title(action.key)}</Link>)}</nav>
    </div>;
  }

  const data = resource.data as FreelancerDashboard;
  return <div className="phase-dashboard">
    <header className="phase-dashboard__header"><div><p>{t("freelancerDashboard")}</p><h1>{t("workCommandCenter")}</h1></div><button type="button" onClick={() => void resource.refresh()}>{t("refresh")}</button></header>
    <Metrics values={{ earningsMinor: data.earningsSummary.amountMinor, pendingWithdrawalMinor: data.pendingWithdrawals.amountMinor, unreadMessages: data.messages.unread, profileCompletion: `${data.profileCompletion.percentage}%`, verifiedSkills: `${data.skillVerification.verified}/${data.skillVerification.total}`, reviewCount: data.reviewsSummary.count }} />
    <div className="phase-dashboard__grid">
      <Section titleText={t("recommendedWork")} empty={!data.recommendedWork.length}><div className="phase-dashboard__list">{data.recommendedWork.map((item) => <Link key={item.id} href={`/marketplace/listings/${item.id}`}><strong>{item.title}</strong><span>{item.budgetMinMinor ?? "—"}–{item.budgetMaxMinor ?? "—"} {item.currency}</span></Link>)}</div></Section>
      <Section titleText={t("invitations")} empty={!data.invitations.length}><div className="phase-dashboard__list">{data.invitations.map((item) => <article key={item.id}><strong>{item.organization.name}</strong><span>{item.organization.slug}</span></article>)}</div></Section>
      <Section titleText={t("proposals")}><Metrics values={data.proposals} /></Section>
      <Section titleText={t("activeContracts")} empty={!data.contracts.length}><div className="phase-dashboard__list">{data.contracts.map((item) => <article key={item.status}><strong>{title(item.status)}</strong><span>{item.count} · {item.valueMinor}</span></article>)}</div></Section>
      <Section titleText={t("milestones")} empty={!data.milestones.length}><div className="phase-dashboard__list">{data.milestones.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.amountMinor} {item.currency} · {item.status}</span></article>)}</div></Section>
      <Section titleText={t("tasks")} empty={!data.tasks.length}><div className="phase-dashboard__list">{data.tasks.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.project.title} · {item.status}</span></article>)}</div></Section>
      <Section titleText={t("calendar")} empty={!data.calendar.milestones.length && !data.calendar.tasks.length}><div className="phase-dashboard__list">{[...data.calendar.milestones, ...data.calendar.tasks].map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.dueAt ? new Date(item.dueAt).toLocaleDateString() : "—"}</span></article>)}</div></Section>
      <Section titleText={t("portfolioPerformance")} empty={!data.portfolioPerformance.length}><div className="phase-dashboard__list">{data.portfolioPerformance.map((item) => <article key={`${item.contentType}-${item.visibility}`}><strong>{title(item.contentType)}</strong><span>{item.visibility} · {item.count}</span></article>)}</div></Section>
    </div>
    <nav className="phase-dashboard__actions" aria-label={t("quickActions")}>{data.quickActions.map((action) => <Link key={action.key} href={action.href}>{title(action.key)}</Link>)}</nav>
  </div>;
}
