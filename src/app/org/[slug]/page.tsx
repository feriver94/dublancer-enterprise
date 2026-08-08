import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import PublicProfileActions from "@/components/profile/PublicProfileActions";
import { ProfileHero, ProfileSection, ProfileStats, TagList } from "@/components/profile/ProfilePrimitives";
import { PublicProfileService } from "@/lib/services/public-profile.service";
import { isAppError } from "@/lib/errors/app-error";

export const dynamic = "force-dynamic";

export default async function OrganizationPublicProfile({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTranslations("ProfilePhaseB");
  const c = await getTranslations("PhaseC");
  let data;
  try { data = await new PublicProfileService().organization((await params).slug.toLowerCase()); }
  catch (error) { if (isAppError(error) && error.statusCode === 404) notFound(); throw error; }
  const locations = Array.isArray(data.locations) ? data.locations as Array<{ label?: string; countryCode?: string }> : [];
  const portfolio = Array.isArray(data.portfolio) ? data.portfolio as Array<{ title?: string; description?: string; url?: string }> : [];
  return <><Navbar /><main className="profile-page"><ProfileHero bannerUrl={data.bannerUrl} avatarUrl={data.logoUrl} title={data.name} subtitle={data.industry} badges={data.verification.verified ? <span>{t("verifiedBusiness")}</span> : null}><PublicProfileActions sharePath={`/org/${data.slug}`} report={data.actions.report} messageHref={data.actions.message} labels={{ invite: t("invite"), hire: t("hire"), message: t("message"), follow: t("follow"), share: t("share"), report: t("report"), reported: t("reported"), save: c("save"), unsave: c("unsave"), unfollow: c("unfollow"), selectProject: c("selectProject"), invited: c("invited"), retry: c("retry"), unavailable: c("unavailable") }} /></ProfileHero><ProfileStats items={[{ label: t("completedProjects"), value: data.completedProjects }, { label: t("country"), value: data.countryCode }, { label: t("locations"), value: locations.length }, { label: t("verification"), value: data.verification.verified ? t("verified") : t("notVerified") }]} /><div className="profile-layout"><div><ProfileSection title={t("about")} empty={!data.description}><p className="profile-copy">{data.description}</p></ProfileSection><ProfileSection title={t("portfolio")} empty={!portfolio.length}><div className="profile-projects">{portfolio.map((item, index) => <article key={`${item.title}-${index}`}><h3>{item.title}</h3><p>{item.description}</p>{item.url ? <a href={item.url} rel="noreferrer" target="_blank">{t("viewProject")}</a> : null}</article>)}</div></ProfileSection><ProfileSection title={t("services")} empty={!data.services.length}><TagList items={data.services} /></ProfileSection><ProfileSection title={t("technologies")} empty={!data.technologies.length}><TagList items={data.technologies} /></ProfileSection></div><aside className="profile-aside"><dl><dt>{t("legalName")}</dt><dd>{data.legalName}</dd><dt>{t("locations")}</dt><dd>{locations.map((location) => `${location.label ?? ""} ${location.countryCode ?? ""}`).join(", ") || "—"}</dd></dl>{data.website ? <a href={data.website} rel="noreferrer" target="_blank" className="profile-external">{t("website")}</a> : null}</aside></div></main><Footer /></>;
}
