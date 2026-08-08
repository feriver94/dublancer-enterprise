"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";

type Visibility = "DRAFT" | "HIDDEN" | "PUBLIC" | "VERIFIED" | "SUSPENDED" | "ARCHIVED";
type ProfileRecord = Record<string, unknown> & { id: string; version: number; visibility: Visibility };
type Settings = {
  activePersonaType: "CLIENT" | "FREELANCER" | "ORGANIZATION" | null;
  account: {
    username: string | null;
    displayName: string | null;
    email: string;
    preferredLocale: string;
    personalIdentity: { preferredName: string; countryCode: string; timezone: string; locale: string } | null;
    clientProfile: (ProfileRecord & { displayName: string; headline?: string | null; about?: string | null; bannerUrl?: string | null; avatarUrl?: string | null; industry?: string | null; companySize?: string | null; website?: string | null; languages: string[]; responseTimeMinutes?: number | null; hiringAvailable: boolean; showVerifiedSpend: boolean; hiringPreferences?: unknown; engagementModels: string[] }) | null;
    freelancerProfile: (ProfileRecord & { headline: string; bio?: string | null; hourlyRateMinor?: string | null; currency: string; availability: string; bannerUrl?: string | null; avatarUrl?: string | null; languages: string[]; industries: string[]; services: string[]; fixedPriceAvailable: boolean; yearsExperience: number; resumeUrl?: string | null; videoUrl?: string | null; githubUrl?: string | null; linkedinUrl?: string | null }) | null;
  };
  organizations: Array<{ id: string; name: string; slug: string; companyProfile: (ProfileRecord & { legalName: string; tradingName?: string | null; description?: string | null; website?: string | null; countryCode: string; logoUrl?: string | null; bannerUrl?: string | null; industry?: string | null; locations?: unknown; services: string[]; technologies: string[]; portfolio?: unknown }) | null }>;
  completion: Record<"personal" | "client" | "freelancer", { percentage: number; completed: number; total: number; missing: string[] }>;
};

const visibilityOptions: Visibility[] = ["DRAFT", "HIDDEN", "PUBLIC", "VERIFIED"];
const contentKinds = ["portfolio", "case-study", "publication", "research", "experience", "education", "certification", "social-link"] as const;
type ContentKind = typeof contentKinds[number];

function text(form: FormData, name: string) { return String(form.get(name) ?? "").trim(); }
function nullable(form: FormData, name: string) { return text(form, name) || null; }
function csv(form: FormData, name: string) { return text(form, name).split(",").map((item) => item.trim()).filter(Boolean); }
function bool(form: FormData, name: string) { return form.get(name) === "on"; }
function json(form: FormData, name: string, fallback: unknown) { const value = text(form, name); return value ? JSON.parse(value) : fallback; }
function dateInput(value: unknown) { return typeof value === "string" && value ? value.slice(0, 10) : ""; }

function Field({ label, name, value, type = "text", required, textarea }: { label: string; name: string; value?: unknown; type?: string; required?: boolean; textarea?: boolean }) {
  return <label>{label}{textarea ? <textarea name={name} defaultValue={typeof value === "string" ? value : ""} /> : <input name={name} type={type} required={required} defaultValue={value === null || value === undefined ? "" : String(value)} />}</label>;
}

function VisibilityField({ value }: { value: Visibility }) {
  return <label>Visibility<select name="visibility" defaultValue={value}>{visibilityOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>;
}

export default function ProfileSettingsClient() {
  const t = useTranslations("ProfilePhaseB");
  const settings = useApiResource<Settings>("/api/profile/settings");
  const [section, setSection] = useState<"personal" | "client" | "freelancer" | "organization" | "content">("personal");
  const [organizationId, setOrganizationId] = useState("");
  const [kind, setKind] = useState<ContentKind>("portfolio");
  const [selected, setSelected] = useState<ProfileRecord | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const content = useApiResource<ProfileRecord[]>(section === "content" ? `/api/profile/content/${kind}` : null);
  const data = settings.data;
  const organization = useMemo(() => data?.organizations.find((item) => item.id === (organizationId || data.organizations[0]?.id)), [data, organizationId]);

  async function mutate(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    setWorking(true); setError(""); setNotice("");
    try { const result = await apiMutation(path, method, body); setNotice(t("saved")); return result; }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("failed")); return null; }
    finally { setWorking(false); }
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>, selectedSection: "personal" | "client" | "freelancer" | "organization") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      let payload: unknown;
      if (selectedSection === "personal") payload = { section: "personal", data: { username: text(form, "username"), displayName: text(form, "displayName"), preferredName: text(form, "preferredName"), countryCode: text(form, "countryCode").toUpperCase(), timezone: text(form, "timezone"), locale: text(form, "locale") } };
      else if (selectedSection === "client" && data?.account.clientProfile) payload = { section: "client", data: { version: data.account.clientProfile.version, displayName: text(form, "displayName"), headline: nullable(form, "headline"), about: nullable(form, "about"), visibility: text(form, "visibility"), bannerUrl: nullable(form, "bannerUrl"), avatarUrl: nullable(form, "avatarUrl"), industry: nullable(form, "industry"), companySize: nullable(form, "companySize"), website: nullable(form, "website"), languages: csv(form, "languages"), responseTimeMinutes: text(form, "responseTimeMinutes") ? Number(text(form, "responseTimeMinutes")) : null, hiringAvailable: bool(form, "hiringAvailable"), showVerifiedSpend: bool(form, "showVerifiedSpend"), hiringPreferences: json(form, "hiringPreferences", null), engagementModels: csv(form, "engagementModels") } };
      else if (selectedSection === "freelancer" && data?.account.freelancerProfile) payload = { section: "freelancer", data: { version: data.account.freelancerProfile.version, headline: text(form, "headline"), bio: nullable(form, "bio"), hourlyRateMinor: nullable(form, "hourlyRateMinor"), currency: text(form, "currency").toUpperCase(), availability: text(form, "availability"), visibility: text(form, "visibility"), bannerUrl: nullable(form, "bannerUrl"), avatarUrl: nullable(form, "avatarUrl"), languages: csv(form, "languages"), industries: csv(form, "industries"), services: csv(form, "services"), fixedPriceAvailable: bool(form, "fixedPriceAvailable"), yearsExperience: Number(text(form, "yearsExperience")), resumeUrl: nullable(form, "resumeUrl"), videoUrl: nullable(form, "videoUrl"), githubUrl: nullable(form, "githubUrl"), linkedinUrl: nullable(form, "linkedinUrl") } };
      else if (selectedSection === "organization" && organization?.companyProfile) payload = { section: "organization", data: { organizationId: organization.id, version: organization.companyProfile.version, legalName: text(form, "legalName"), tradingName: nullable(form, "tradingName"), description: nullable(form, "description"), website: nullable(form, "website"), countryCode: text(form, "countryCode").toUpperCase(), visibility: text(form, "visibility"), logoUrl: nullable(form, "logoUrl"), bannerUrl: nullable(form, "bannerUrl"), industry: nullable(form, "industry"), locations: json(form, "locations", []), services: csv(form, "services"), technologies: csv(form, "technologies"), portfolio: json(form, "portfolio", []) } };
      else return;
      if (await mutate("/api/profile/settings", "PATCH", payload)) await settings.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("failed"));
    }
  }

  function contentPayload(form: FormData) {
    const common = { visibility: text(form, "visibility"), ...(selected ? { version: selected.version } : {}) };
    if (["portfolio", "case-study", "publication", "research"].includes(kind)) return { ...common, title: text(form, "title"), description: nullable(form, "description"), projectUrl: nullable(form, "projectUrl"), mediaUrl: nullable(form, "mediaUrl"), completedAt: nullable(form, "completedAt"), sortOrder: Number(text(form, "sortOrder") || 0) };
    if (kind === "experience") return { ...common, companyName: text(form, "companyName"), title: text(form, "title"), description: nullable(form, "description"), startedAt: text(form, "startedAt"), endedAt: nullable(form, "endedAt") };
    if (kind === "education") return { ...common, institution: text(form, "institution"), degree: text(form, "degree"), fieldOfStudy: nullable(form, "fieldOfStudy"), description: nullable(form, "description"), startedAt: nullable(form, "startedAt"), endedAt: nullable(form, "endedAt") };
    if (kind === "certification") return { ...common, name: text(form, "name"), issuer: text(form, "issuer"), credentialId: nullable(form, "credentialId"), credentialUrl: nullable(form, "credentialUrl"), issuedAt: nullable(form, "issuedAt"), expiresAt: nullable(form, "expiresAt") };
    return { ...common, personaType: data?.activePersonaType, platform: text(form, "platform"), url: text(form, "url") };
  }

  async function saveContent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = selected ? `/api/profile/content/${kind}/${selected.id}` : `/api/profile/content/${kind}`;
    if (await mutate(path, selected ? "PATCH" : "POST", contentPayload(new FormData(event.currentTarget)))) { setSelected(null); await Promise.all([content.refresh(), settings.refresh()]); }
  }

  async function archive(item: ProfileRecord) {
    if (await mutate(`/api/profile/content/${kind}/${item.id}?version=${item.version}`, "DELETE")) { setSelected(null); await Promise.all([content.refresh(), settings.refresh()]); }
  }

  if (settings.loading) return <div className="profile-loading">{t("loading")}</div>;
  if (settings.error || !data) return <div className="phase-dashboard__error"><p>{settings.error || t("failed")}</p><button type="button" onClick={() => void settings.refresh()}>{t("retry")}</button></div>;
  const personal = data.account.personalIdentity;
  const client = data.account.clientProfile;
  const freelancer = data.account.freelancerProfile;
  const item = selected;

  return <div className="profile-settings"><header><p>{t("profileSettings")}</p><h1>{t("manageIdentity")}</h1><div className="completion-strip">{Object.entries(data.completion).map(([key, value]) => <span key={key}>{title(key)} <strong>{value.percentage}%</strong></span>)}</div></header>
    <nav className="profile-settings__tabs" aria-label={t("profileSettings")}>{(["personal", "client", "freelancer", "organization", "content"] as const).map((key) => <button type="button" key={key} aria-current={section === key ? "page" : undefined} onClick={() => { setSection(key); setSelected(null); }}>{t(key)}</button>)}</nav>
    {notice ? <p className="enterprise-notice" role="status">{notice}</p> : null}{error ? <p className="enterprise-error" role="alert">{error}</p> : null}
    {section === "personal" ? <form className="profile-form" onSubmit={(event) => void saveSettings(event, "personal")}><Field label={t("username")} name="username" value={data.account.username} required /><Field label={t("displayName")} name="displayName" value={data.account.displayName} required /><Field label={t("preferredName")} name="preferredName" value={personal?.preferredName} required /><Field label={t("country")} name="countryCode" value={personal?.countryCode ?? "AE"} required /><Field label={t("timezone")} name="timezone" value={personal?.timezone ?? "Asia/Dubai"} required /><label>{t("language")}<select name="locale" defaultValue={personal?.locale ?? data.account.preferredLocale}><option value="en-AE">English</option><option value="ar-AE">العربية</option></select></label><button disabled={working}>{t("save")}</button></form> : null}
    {section === "client" ? client ? <form className="profile-form" onSubmit={(event) => void saveSettings(event, "client")}><Field label={t("displayName")} name="displayName" value={client.displayName} required /><Field label={t("headline")} name="headline" value={client.headline} /><Field label={t("about")} name="about" value={client.about} textarea /><VisibilityField value={client.visibility} /><Field label={t("banner")} name="bannerUrl" value={client.bannerUrl} type="url" /><Field label={t("avatar")} name="avatarUrl" value={client.avatarUrl} type="url" /><Field label={t("industry")} name="industry" value={client.industry} /><Field label={t("companySize")} name="companySize" value={client.companySize} /><Field label={t("website")} name="website" value={client.website} type="url" /><Field label={t("languagesCsv")} name="languages" value={client.languages.join(", ")} /><Field label={t("responseTime")} name="responseTimeMinutes" value={client.responseTimeMinutes} type="number" /><Field label={t("engagementModels")} name="engagementModels" value={client.engagementModels.join(", ")} /><Field label={t("hiringPreferencesJson")} name="hiringPreferences" value={client.hiringPreferences ? JSON.stringify(client.hiringPreferences, null, 2) : ""} textarea /><label className="profile-checkbox"><input type="checkbox" name="hiringAvailable" defaultChecked={client.hiringAvailable} />{t("hiring")}</label><label className="profile-checkbox"><input type="checkbox" name="showVerifiedSpend" defaultChecked={client.showVerifiedSpend} />{t("showVerifiedSpend")}</label><button disabled={working}>{t("save")}</button></form> : <p className="profile-empty">{t("empty")}</p> : null}
    {section === "freelancer" ? freelancer ? <form className="profile-form" onSubmit={(event) => void saveSettings(event, "freelancer")}><Field label={t("headline")} name="headline" value={freelancer.headline} required /><Field label={t("summary")} name="bio" value={freelancer.bio} textarea /><VisibilityField value={freelancer.visibility} /><Field label={t("hourlyRateMinor")} name="hourlyRateMinor" value={freelancer.hourlyRateMinor} /><Field label={t("currency")} name="currency" value={freelancer.currency} required /><label>{t("availability")}<select name="availability" defaultValue={freelancer.availability}><option>AVAILABLE</option><option>LIMITED</option><option>UNAVAILABLE</option></select></label><Field label={t("yearsExperience")} name="yearsExperience" value={freelancer.yearsExperience} type="number" /><Field label={t("banner")} name="bannerUrl" value={freelancer.bannerUrl} type="url" /><Field label={t("avatar")} name="avatarUrl" value={freelancer.avatarUrl} type="url" /><Field label={t("languagesCsv")} name="languages" value={freelancer.languages.join(", ")} /><Field label={t("industriesCsv")} name="industries" value={freelancer.industries.join(", ")} /><Field label={t("servicesCsv")} name="services" value={freelancer.services.join(", ")} /><Field label={t("resume")} name="resumeUrl" value={freelancer.resumeUrl} type="url" /><Field label={t("videoIntroduction")} name="videoUrl" value={freelancer.videoUrl} type="url" /><Field label="GitHub" name="githubUrl" value={freelancer.githubUrl} type="url" /><Field label="LinkedIn" name="linkedinUrl" value={freelancer.linkedinUrl} type="url" /><label className="profile-checkbox"><input type="checkbox" name="fixedPriceAvailable" defaultChecked={freelancer.fixedPriceAvailable} />{t("fixedPrice")}</label><button disabled={working}>{t("save")}</button></form> : <p className="profile-empty">{t("empty")}</p> : null}
    {section === "organization" ? <><label className="profile-org-select">{t("organization")}<select value={organization?.id ?? ""} onChange={(event) => setOrganizationId(event.target.value)}>{data.organizations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>{organization?.companyProfile ? <form key={organization.id} className="profile-form" onSubmit={(event) => void saveSettings(event, "organization")}><Field label={t("legalName")} name="legalName" value={organization.companyProfile.legalName} required /><Field label={t("tradingName")} name="tradingName" value={organization.companyProfile.tradingName} /><Field label={t("about")} name="description" value={organization.companyProfile.description} textarea /><VisibilityField value={organization.companyProfile.visibility} /><Field label={t("website")} name="website" value={organization.companyProfile.website} type="url" /><Field label={t("country")} name="countryCode" value={organization.companyProfile.countryCode} /><Field label={t("logo")} name="logoUrl" value={organization.companyProfile.logoUrl} type="url" /><Field label={t("banner")} name="bannerUrl" value={organization.companyProfile.bannerUrl} type="url" /><Field label={t("industry")} name="industry" value={organization.companyProfile.industry} /><Field label={t("servicesCsv")} name="services" value={organization.companyProfile.services.join(", ")} /><Field label={t("technologiesCsv")} name="technologies" value={organization.companyProfile.technologies.join(", ")} /><Field label={t("locationsJson")} name="locations" value={organization.companyProfile.locations ? JSON.stringify(organization.companyProfile.locations, null, 2) : "[]"} textarea /><Field label={t("portfolioJson")} name="portfolio" value={organization.companyProfile.portfolio ? JSON.stringify(organization.companyProfile.portfolio, null, 2) : "[]"} textarea /><button disabled={working}>{t("save")}</button></form> : <p className="profile-empty">{t("empty")}</p>}</> : null}
    {section === "content" ? <div id="portfolio" className="content-manager"><div className="content-manager__toolbar"><label>{t("contentType")}<select value={kind} onChange={(event) => { setKind(event.target.value as ContentKind); setSelected(null); }}>{contentKinds.map((entry) => <option key={entry} value={entry}>{title(entry)}</option>)}</select></label><button type="button" onClick={() => setSelected(null)}>{t("newItem")}</button></div><div className="content-manager__layout"><div className="content-manager__list">{content.loading ? <p>{t("loading")}</p> : content.error ? <p className="enterprise-error">{content.error}</p> : content.data?.length ? content.data.map((entry) => <article key={entry.id}><strong>{String(entry.title ?? entry.name ?? entry.institution ?? entry.platform ?? t("content"))}</strong><span>{entry.visibility}</span><div><button type="button" onClick={() => setSelected(entry)}>{t("edit")}</button><button type="button" onClick={() => void archive(entry)}>{t("archive")}</button></div></article>) : <p className="profile-empty">{t("empty")}</p>}</div><form key={`${kind}-${item?.id ?? "new"}`} className="profile-form content-manager__form" onSubmit={(event) => void saveContent(event)}><VisibilityField value={item?.visibility ?? "PUBLIC"} />{["portfolio", "case-study", "publication", "research"].includes(kind) ? <><Field label={t("title")} name="title" value={item?.title} required /><Field label={t("description")} name="description" value={item?.description} textarea /><Field label={t("projectUrl")} name="projectUrl" value={item?.projectUrl} type="url" /><Field label={t("mediaUrl")} name="mediaUrl" value={item?.mediaUrl} type="url" /><Field label={t("completedAt")} name="completedAt" value={dateInput(item?.completedAt)} type="date" /><Field label={t("sortOrder")} name="sortOrder" value={item?.sortOrder ?? 0} type="number" /></> : null}{kind === "experience" ? <><Field label={t("company") } name="companyName" value={item?.companyName} required /><Field label={t("title")} name="title" value={item?.title} required /><Field label={t("description")} name="description" value={item?.description} textarea /><Field label={t("startedAt")} name="startedAt" value={dateInput(item?.startedAt)} type="date" required /><Field label={t("endedAt")} name="endedAt" value={dateInput(item?.endedAt)} type="date" /></> : null}{kind === "education" ? <><Field label={t("institution")} name="institution" value={item?.institution} required /><Field label={t("degree")} name="degree" value={item?.degree} required /><Field label={t("fieldOfStudy")} name="fieldOfStudy" value={item?.fieldOfStudy} /><Field label={t("description")} name="description" value={item?.description} textarea /><Field label={t("startedAt")} name="startedAt" value={dateInput(item?.startedAt)} type="date" /><Field label={t("endedAt")} name="endedAt" value={dateInput(item?.endedAt)} type="date" /></> : null}{kind === "certification" ? <><Field label={t("certification")} name="name" value={item?.name} required /><Field label={t("issuer")} name="issuer" value={item?.issuer} required /><Field label={t("credentialId")} name="credentialId" value={item?.credentialId} /><Field label={t("credentialUrl")} name="credentialUrl" value={item?.credentialUrl} type="url" /><Field label={t("issuedAt")} name="issuedAt" value={dateInput(item?.issuedAt)} type="date" /><Field label={t("expiresAt")} name="expiresAt" value={dateInput(item?.expiresAt)} type="date" /></> : null}{kind === "social-link" ? <><Field label={t("platform")} name="platform" value={item?.platform} required /><Field label={t("url")} name="url" value={item?.url} type="url" required /></> : null}<button disabled={working}>{selected ? t("update") : t("create")}</button></form></div></div> : null}
  </div>;
}

function title(value: string) { return value.replaceAll("-", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
