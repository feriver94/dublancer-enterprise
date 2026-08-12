import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import PublicProfileActions from "@/components/profile/PublicProfileActions";
import { ProfileHero, ProfileSection, ProfileStats, StructuredDetails, TagList } from "@/components/profile/ProfilePrimitives";
import { PublicProfileService } from "@/lib/services/public-profile.service";
import { isAppError } from "@/lib/errors/app-error";
import { formatCountryName } from "@/lib/locale/countries";
import { formatCurrencyMinor, formatUaeDate } from "@/lib/locale/formatters";
import type { AppLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export default async function ClientPublicProfile({ params }: { params: Promise<{ username: string }> }) {
  const t = await getTranslations("ProfilePhaseB");
  const c = await getTranslations("PhaseC");
  const status = await getTranslations("Status");
  const locale = await getLocale() as AppLocale;
  let data;
  try { data = await new PublicProfileService().client((await params).username.toLowerCase()); }
  catch (error) { if (isAppError(error) && error.statusCode === 404) notFound(); throw error; }
  const p = data.profile;
  return <><Navbar /><main className="profile-page"><ProfileHero bannerUrl={p.bannerUrl} avatarUrl={p.avatarUrl} title={p.displayName} subtitle={p.headline} badges={<>{data.verification.identity ? <span>{t("verifiedIdentity")}</span> : null}{data.verification.business ? <span>{t("verifiedBusiness")}</span> : null}{data.verification.payment ? <span>{t("paymentVerified")}</span> : null}</>}>
    <PublicProfileActions sharePath={data.actions.share} report={data.actions.report} messageHref={data.actions.message} labels={{ invite: t("invite"), hire: t("openProjects"), message: t("message"), follow: t("follow"), share: t("share"), report: t("report"), reported: t("reported"), unfollow: c("unfollow"), retry: c("retry"), unavailable: c("unavailable") }} />
  </ProfileHero>
  <ProfileStats items={[
    { label: t("openProjects"), value: data.stats.openProjects }, { label: t("activeProjects"), value: data.stats.activeProjects }, { label: t("completedProjects"), value: data.stats.completedProjects },
    { label: t("hires"), value: data.stats.numberOfHires }, { label: t("repeatHireRate"), value: `${data.stats.repeatHireRate}%` }, { label: t("verifiedSpend"), value: data.stats.verifiedSpendMinor === null ? t("private") : formatCurrencyMinor(data.stats.verifiedSpendMinor, "AED", locale) },
  ]} />
  <div className="profile-layout"><div>
    <ProfileSection title={t("about")} empty={!p.about}><p className="profile-copy">{p.about}</p></ProfileSection>
    <ProfileSection title={t("hiringPreferences")} empty={!p.hiringPreferences}><StructuredDetails value={p.hiringPreferences} yes={t("yes")} no={t("no")} /></ProfileSection>
    <ProfileSection title={t("engagementModels")} empty={!p.engagementModels.length}><TagList items={p.engagementModels.map((model) => status.has(model) ? status(model) : model.replaceAll("_", " "))} /></ProfileSection>
    <ProfileSection title={t("socialLinks")} empty={!p.socialLinks.length}><div className="profile-links">{p.socialLinks.map((link) => <a key={link.platform} href={link.url} rel="noreferrer" target="_blank">{link.platform}</a>)}</div></ProfileSection>
    <ProfileSection title={c("reputation")} empty={data.stats.clientRating.status !== "AVAILABLE"}><div className="profile-projects">{data.stats.reputation.recentReviews.map((review) => <article key={review.id}><h3>{review.title ?? `${review.rating} / 5`}</h3><p>{review.body}</p></article>)}</div></ProfileSection>
  </div><aside className="profile-aside">
    <dl><dt>{t("country")}</dt><dd>{formatCountryName(p.countryCode, locale)}</dd><dt>{t("industry")}</dt><dd>{p.industry ?? "—"}</dd><dt>{t("companySize")}</dt><dd>{p.companySize ?? "—"}</dd><dt>{t("languages")}</dt><dd>{p.languages.join(", ") || "—"}</dd><dt>{t("memberSince")}</dt><dd>{formatUaeDate(p.memberSince, locale)}</dd><dt>{t("responseTime")}</dt><dd>{p.responseTimeMinutes === null ? "—" : t("minutes", { count: p.responseTimeMinutes })}</dd><dt>{t("availability")}</dt><dd>{p.hiringAvailable ? t("hiring") : t("notHiring")}</dd></dl>
    {p.website ? <a href={p.website} rel="noreferrer" target="_blank" className="profile-external">{t("website")}</a> : null}
    {data.organization ? <Link href={`/org/${data.organization.slug}`} className="profile-external">{data.organization.name}</Link> : null}
  </aside></div></main><Footer /></>;
}
