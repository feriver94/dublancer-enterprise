import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import PublicProfileActions from "@/components/profile/PublicProfileActions";
import { ProfileHero, ProfileSection, ProfileStats, TagList } from "@/components/profile/ProfilePrimitives";
import { PublicProfileService } from "@/lib/services/public-profile.service";
import { isAppError } from "@/lib/errors/app-error";

export const dynamic = "force-dynamic";

export default async function FreelancerPublicProfile({ params }: { params: Promise<{ username: string }> }) {
  const t = await getTranslations("ProfilePhaseB");
  let data;
  try { data = await new PublicProfileService().freelancer((await params).username.toLowerCase()); }
  catch (error) { if (isAppError(error) && error.statusCode === 404) notFound(); throw error; }
  const p = data.profile;
  const timeline = (items: Array<Record<string, unknown>>, primary: string, secondary: string) => <div className="profile-timeline">{items.map((item) => <article key={String(item.id)}><h3>{String(item[primary])}</h3><p>{String(item[secondary] ?? "")}</p>{item.description ? <p>{String(item.description)}</p> : null}</article>)}</div>;
  const projects = (items: typeof p.portfolio) => <div className="profile-projects">{items.map((item) => <article key={item.id}><h3>{item.title}</h3><p>{item.description}</p>{item.projectUrl ? <a href={item.projectUrl} rel="noreferrer" target="_blank">{t("viewProject")}</a> : null}</article>)}</div>;
  return <><Navbar /><main className="profile-page"><ProfileHero bannerUrl={p.bannerUrl} avatarUrl={p.avatarUrl} title={p.headline} subtitle={`${p.countryCode} · ${p.availability}`} badges={<>{data.trustBadges.identity ? <span>{t("verifiedIdentity")}</span> : null}{data.trustBadges.verifiedSkills ? <span>{t("verifiedSkills")}: {data.trustBadges.verifiedSkills}</span> : null}</>}>
    <PublicProfileActions sharePath={data.actions.share} report={data.actions.report} inviteHref={data.actions.invite} hireHref={data.actions.hire} messageHref={data.actions.message} followId={p.id} labels={{ invite: t("invite"), hire: t("hire"), message: t("message"), follow: t("follow"), share: t("share"), report: t("report"), reported: t("reported") }} />
  </ProfileHero>
  <ProfileStats items={[{ label: t("hourlyRate"), value: p.hourlyRateMinor ? `${p.hourlyRateMinor} ${p.currency}` : "—" }, { label: t("yearsExperience"), value: p.yearsExperience }, { label: t("fixedPrice"), value: p.fixedPriceAvailable ? t("available") : t("unavailable") }, { label: t("reviews"), value: t("phaseCPlaceholder") }]} />
  <div className="profile-layout"><div>
    <ProfileSection title={t("summary")} empty={!p.summary}><p className="profile-copy">{p.summary}</p></ProfileSection>
    <ProfileSection title={t("services")} empty={!p.services.length}><TagList items={p.services} /></ProfileSection>
    <ProfileSection title={t("skills")} empty={!p.skills.length}><TagList items={p.skills.map((skill) => `${skill.skill.nameEn}${skill.verifiedAt ? " ✓" : ""}`)} /></ProfileSection>
    <ProfileSection title={t("portfolio")} empty={!p.portfolio.length}>{projects(p.portfolio)}</ProfileSection>
    <ProfileSection title={t("caseStudies")} empty={!p.caseStudies.length}>{projects(p.caseStudies)}</ProfileSection>
    <ProfileSection title={t("experience")} empty={!p.experience.length}>{timeline(p.experience, "title", "companyName")}</ProfileSection>
    <ProfileSection title={t("education")} empty={!p.education.length}>{timeline(p.education, "degree", "institution")}</ProfileSection>
    <ProfileSection title={t("certifications")} empty={!p.certifications.length}>{timeline(p.certifications, "name", "issuer")}</ProfileSection>
    <ProfileSection title={t("publications")} empty={!p.publications.length}>{projects(p.publications)}</ProfileSection>
    <ProfileSection title={t("research")} empty={!p.research.length}>{projects(p.research)}</ProfileSection>
  </div><aside className="profile-aside"><dl><dt>{t("languages")}</dt><dd>{p.languages.join(", ") || "—"}</dd><dt>{t("industries")}</dt><dd>{p.industries.join(", ") || "—"}</dd><dt>{t("memberSince")}</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(p.memberSince))}</dd><dt>{t("videoIntroduction")}</dt><dd>{p.videoIntroduction.status === "available" ? t("available") : t("placeholder")}</dd></dl><div className="profile-links">{p.github ? <a href={p.github} rel="noreferrer" target="_blank">GitHub</a> : null}{p.linkedin ? <a href={p.linkedin} rel="noreferrer" target="_blank">LinkedIn</a> : null}{p.resume ? <a href={p.resume} rel="noreferrer" target="_blank">{t("resume")}</a> : null}{p.socialLinks.map((link) => <a key={link.platform} href={link.url} rel="noreferrer" target="_blank">{link.platform}</a>)}</div></aside></div></main><Footer /></>;
}
