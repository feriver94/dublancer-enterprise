import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import PublicProfileActions from "@/components/profile/PublicProfileActions";
import { ProfileHero, ProfileSection, ProfileStats, TagList } from "@/components/profile/ProfilePrimitives";
import { PublicProfileService } from "@/lib/services/public-profile.service";
import { isAppError } from "@/lib/errors/app-error";

export const dynamic = "force-dynamic";

export default async function ClientPublicProfile({ params }: { params: Promise<{ username: string }> }) {
  const t = await getTranslations("ProfilePhaseB");
  const c = await getTranslations("PhaseC");
  let data;
  try { data = await new PublicProfileService().client((await params).username.toLowerCase()); }
  catch (error) { if (isAppError(error) && error.statusCode === 404) notFound(); throw error; }
  const p = data.profile;
  return <><Navbar /><main className="profile-page"><ProfileHero bannerUrl={p.bannerUrl} avatarUrl={p.avatarUrl} title={p.displayName} subtitle={p.headline} badges={<>{data.verification.identity ? <span>{t("verifiedIdentity")}</span> : null}{data.verification.business ? <span>{t("verifiedBusiness")}</span> : null}{data.verification.payment ? <span>{t("paymentVerified")}</span> : null}</>}>
    <PublicProfileActions sharePath={data.actions.share} report={data.actions.report} messageHref={data.actions.message} labels={{ invite: t("invite"), hire: t("openProjects"), message: t("message"), follow: t("follow"), share: t("share"), report: t("report"), reported: t("reported"), unfollow: c("unfollow"), retry: c("retry"), unavailable: c("unavailable") }} />
  </ProfileHero>
  <ProfileStats items={[
    { label: t("openProjects"), value: data.stats.openProjects }, { label: t("activeProjects"), value: data.stats.activeProjects }, { label: t("completedProjects"), value: data.stats.completedProjects },
    { label: t("hires"), value: data.stats.numberOfHires }, { label: t("repeatHireRate"), value: `${data.stats.repeatHireRate}%` }, { label: t("verifiedSpend"), value: data.stats.verifiedSpendMinor === null ? t("private") : `${data.stats.verifiedSpendMinor} AED` },
  ]} />
  <div className="profile-layout"><div>
    <ProfileSection title={t("about")} empty={!p.about}><p className="profile-copy">{p.about}</p></ProfileSection>
    <ProfileSection title={t("hiringPreferences")} empty={!p.hiringPreferences}><pre className="profile-json">{p.hiringPreferences ? JSON.stringify(p.hiringPreferences, null, 2) : ""}</pre></ProfileSection>
    <ProfileSection title={t("engagementModels")} empty={!p.engagementModels.length}><TagList items={p.engagementModels} /></ProfileSection>
    <ProfileSection title={t("socialLinks")} empty={!p.socialLinks.length}><div className="profile-links">{p.socialLinks.map((link) => <a key={link.platform} href={link.url} rel="noreferrer" target="_blank">{link.platform}</a>)}</div></ProfileSection>
    <ProfileSection title={c("reputation")} empty={data.stats.clientRating.status !== "AVAILABLE"}><div className="profile-projects">{data.stats.reputation.recentReviews.map((review) => <article key={review.id}><h3>{review.title ?? `${review.rating} / 5`}</h3><p>{review.body}</p></article>)}</div></ProfileSection>
  </div><aside className="profile-aside">
    <dl><dt>{t("country")}</dt><dd>{p.countryCode}</dd><dt>{t("industry")}</dt><dd>{p.industry ?? "—"}</dd><dt>{t("companySize")}</dt><dd>{p.companySize ?? "—"}</dd><dt>{t("languages")}</dt><dd>{p.languages.join(", ") || "—"}</dd><dt>{t("memberSince")}</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(p.memberSince))}</dd><dt>{t("responseTime")}</dt><dd>{p.responseTimeMinutes === null ? "—" : `${p.responseTimeMinutes} min`}</dd><dt>{t("availability")}</dt><dd>{p.hiringAvailable ? t("hiring") : t("notHiring")}</dd></dl>
    {p.website ? <a href={p.website} rel="noreferrer" target="_blank" className="profile-external">{t("website")}</a> : null}
    {data.organization ? <Link href={`/org/${data.organization.slug}`} className="profile-external">{data.organization.name}</Link> : null}
  </aside></div></main><Footer /></>;
}
