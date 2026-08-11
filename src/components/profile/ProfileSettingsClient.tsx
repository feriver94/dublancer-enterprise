"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import ProfileMediaControl from "./ProfileMediaControl";
import { CountrySelect, LocationsEditor, MultiChoiceField, MultiValueField, PortfolioEditor } from "./ProfileFormControls";

type Visibility =
  "DRAFT" | "HIDDEN" | "PUBLIC" | "VERIFIED" | "SUSPENDED" | "ARCHIVED";
type ProfileRecord = Record<string, unknown> & {
  id: string;
  version: number;
  visibility: Visibility;
};
type Settings = {
  activePersonaType: "CLIENT" | "FREELANCER" | "ORGANIZATION" | null;
  activeOrganizationId: string;
  capabilities: {
    editClient: boolean;
    editFreelancer: boolean;
    manageContent: boolean;
    editOrganizationIds: string[];
  };
  account: {
    username: string | null;
    displayName: string | null;
    email: string;
    preferredLocale: string;
    personalIdentity: {
      preferredName: string;
      countryCode: string;
      timezone: string;
      locale: string;
    } | null;
    clientProfile:
      | (ProfileRecord & {
          displayName: string;
          headline?: string | null;
          about?: string | null;
          bannerUrl?: string | null;
          avatarUrl?: string | null;
          industry?: string | null;
          companySize?: string | null;
          website?: string | null;
          languages: string[];
          responseTimeMinutes?: number | null;
          hiringAvailable: boolean;
          showVerifiedSpend: boolean;
          hiringPreferences?: unknown;
          engagementModels: string[];
        })
      | null;
    freelancerProfile:
      | (ProfileRecord & {
          headline: string;
          bio?: string | null;
          hourlyRateMinor?: string | null;
          currency: string;
          availability: string;
          bannerUrl?: string | null;
          avatarUrl?: string | null;
          languages: string[];
          industries: string[];
          services: string[];
          fixedPriceAvailable: boolean;
          yearsExperience: number;
          resumeUrl?: string | null;
          videoUrl?: string | null;
          githubUrl?: string | null;
          linkedinUrl?: string | null;
        })
      | null;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    companyProfile:
      | (ProfileRecord & {
          legalName: string;
          tradingName?: string | null;
          description?: string | null;
          website?: string | null;
          countryCode: string;
          logoUrl?: string | null;
          bannerUrl?: string | null;
          industry?: string | null;
          locations?: unknown;
          services: string[];
          technologies: string[];
          portfolio?: unknown;
        })
      | null;
  }>;
  completion: Record<
    "personal" | "client" | "freelancer",
    { percentage: number; completed: number; total: number; missing: string[] }
  >;
};

const visibilityOptions: Visibility[] = [
  "DRAFT",
  "HIDDEN",
  "PUBLIC",
  "VERIFIED",
];
const contentKinds = [
  "portfolio",
  "case-study",
  "publication",
  "research",
  "experience",
  "education",
  "certification",
  "social-link",
] as const;
type ContentKind = (typeof contentKinds)[number];
const timezoneOptions = [
  ["Asia/Dubai", "Dubai (GMT+4)"],
  ["Asia/Riyadh", "Riyadh (GMT+3)"],
  ["Asia/Karachi", "Karachi (GMT+5)"],
  ["Asia/Kolkata", "New Delhi (GMT+5:30)"],
  ["Asia/Singapore", "Singapore (GMT+8)"],
  ["Europe/London", "London"],
  ["America/New_York", "New York"],
  ["Australia/Sydney", "Sydney"],
  ["UTC", "UTC"],
] as const;

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}
function nullable(form: FormData, name: string) {
  return text(form, name) || null;
}
function list(form: FormData, name: string) {
  return form.getAll(name)
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter((item, index, values) => Boolean(item) && values.findIndex((value) => value.toLocaleLowerCase() === item.toLocaleLowerCase()) === index);
}
function bool(form: FormData, name: string) {
  return form.get(name) === "on";
}
function json(form: FormData, name: string, fallback: unknown) {
  const value = text(form, name);
  return value ? JSON.parse(value) : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value as Record<string, unknown> } : {};
}

function hiringPreferences(form: FormData, current: unknown) {
  const next = record(current);
  const setOptional = (key: string, value: string) => { if (value) next[key] = value; else delete next[key]; };
  setOptional("seniority", text(form, "hiringSeniority"));
  setOptional("workMode", text(form, "hiringWorkMode"));
  setOptional("projectLength", text(form, "hiringProjectLength"));
  setOptional("preferredLocation", text(form, "hiringLocation"));
  setOptional("notes", text(form, "hiringNotes"));
  const skills = list(form, "hiringSkills");
  if (skills.length) next.skills = skills; else delete next.skills;
  next.remoteOnly = bool(form, "hiringRemoteOnly");
  return Object.keys(next).length ? next : null;
}
function dateInput(value: unknown) {
  return typeof value === "string" && value ? value.slice(0, 10) : "";
}

function Field({
  label,
  name,
  value,
  type = "text",
  required,
  textarea,
}: {
  label: string;
  name: string;
  value?: unknown;
  type?: string;
  required?: boolean;
  textarea?: boolean;
}) {
  return (
    <label>
      {label}
      {textarea ? (
        <textarea
          name={name}
          defaultValue={typeof value === "string" ? value : ""}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={
            value === null || value === undefined ? "" : String(value)
          }
        />
      )}
    </label>
  );
}

function VisibilityField({ value, label, format }: { value: Visibility; label: string; format: (value: Visibility) => string }) {
  return (
    <label>
      {label}
      <select name="visibility" defaultValue={value}>
        {visibilityOptions.map((item) => (
          <option key={item} value={item}>
            {format(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormSection({ titleText, description, children }: { titleText: string; description?: string; children: React.ReactNode }) {
  return <fieldset className="profile-form__section"><legend><strong>{titleText}</strong>{description ? <span>{description}</span> : null}</legend><div className="profile-form__section-grid">{children}</div></fieldset>;
}

function PermissionState({ titleText, description, action }: { titleText: string; description: string; action: string }) {
  return <section className="profile-permission-state" aria-live="polite"><span aria-hidden="true">🔒</span><div><h2>{titleText}</h2><p>{description}</p><Link href="/account/personas">{action}</Link></div></section>;
}

function EmptyState({ titleText, description, action }: { titleText: string; description: string; action: string }) {
  return <section className="profile-empty-state"><div><h2>{titleText}</h2><p>{description}</p><Link href="/account/personas">{action}</Link></div></section>;
}

export default function ProfileSettingsClient() {
  const t = useTranslations("ProfilePhaseB");
  const status = useTranslations("Status");
  const settings = useApiResource<Settings>("/api/profile/settings");
  const [section, setSection] = useState<
    "personal" | "client" | "freelancer" | "organization" | "content"
  >("personal");
  const [organizationId, setOrganizationId] = useState("");
  const [kind, setKind] = useState<ContentKind>("portfolio");
  const [selected, setSelected] = useState<ProfileRecord | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const content = useApiResource<ProfileRecord[]>(
    section === "content" && settings.data?.capabilities.manageContent ? `/api/profile/content/${kind}` : null,
  );
  const data = settings.data;
  const organization = useMemo(
    () =>
      data?.organizations.find(
        (item) => item.id === (organizationId || data.organizations[0]?.id),
      ),
    [data, organizationId],
  );

  useEffect(() => {
    if (window.location.hash === "#portfolio") queueMicrotask(() => setSection("content"));
  }, []);

  async function mutate(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
  ) {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await apiMutation(path, method, body);
      setNotice(t("saved"));
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("failed"));
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function mediaChanged(outcome: "uploaded" | "removed") {
    setError("");
    setNotice("");
    const refreshed = await settings.refresh();
    if (!refreshed) {
      setError(t("mediaRefreshFailed"));
      return null;
    }
    setNotice(t(outcome === "uploaded" ? "mediaUploadSucceeded" : "mediaRemoveSucceeded"));
    return refreshed;
  }

  async function saveSettings(
    event: React.FormEvent<HTMLFormElement>,
    selectedSection: "personal" | "client" | "freelancer" | "organization",
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      let payload: unknown;
      if (selectedSection === "personal")
        payload = {
          section: "personal",
          data: {
            username: text(form, "username"),
            displayName: text(form, "displayName"),
            preferredName: text(form, "preferredName"),
            countryCode: text(form, "countryCode").toUpperCase(),
            timezone: text(form, "timezone"),
            locale: text(form, "locale"),
          },
        };
      else if (selectedSection === "client" && data?.account.clientProfile)
        payload = {
          section: "client",
          data: {
            version: data.account.clientProfile.version,
            displayName: text(form, "displayName"),
            headline: nullable(form, "headline"),
            about: nullable(form, "about"),
            visibility: text(form, "visibility"),
            industry: nullable(form, "industry"),
            companySize: nullable(form, "companySize"),
            website: nullable(form, "website"),
            languages: list(form, "languages"),
            responseTimeMinutes: text(form, "responseTimeMinutes")
              ? Number(text(form, "responseTimeMinutes"))
              : null,
            hiringAvailable: bool(form, "hiringAvailable"),
            showVerifiedSpend: bool(form, "showVerifiedSpend"),
            hiringPreferences: hiringPreferences(form, data.account.clientProfile.hiringPreferences),
            engagementModels: list(form, "engagementModels"),
          },
        };
      else if (
        selectedSection === "freelancer" &&
        data?.account.freelancerProfile
      )
        payload = {
          section: "freelancer",
          data: {
            version: data.account.freelancerProfile.version,
            headline: text(form, "headline"),
            bio: nullable(form, "bio"),
            hourlyRateMinor: text(form, "hourlyRate") ? String(Math.round(Number(text(form, "hourlyRate")) * 100)) : null,
            currency: text(form, "currency").toUpperCase(),
            availability: text(form, "availability"),
            visibility: text(form, "visibility"),
            languages: list(form, "languages"),
            industries: list(form, "industries"),
            services: list(form, "services"),
            fixedPriceAvailable: bool(form, "fixedPriceAvailable"),
            yearsExperience: Number(text(form, "yearsExperience")),
            resumeUrl: nullable(form, "resumeUrl"),
            videoUrl: nullable(form, "videoUrl"),
            githubUrl: nullable(form, "githubUrl"),
            linkedinUrl: nullable(form, "linkedinUrl"),
          },
        };
      else if (
        selectedSection === "organization" &&
        organization?.companyProfile
      )
        payload = {
          section: "organization",
          data: {
            organizationId: organization.id,
            version: organization.companyProfile.version,
            legalName: text(form, "legalName"),
            tradingName: nullable(form, "tradingName"),
            description: nullable(form, "description"),
            website: nullable(form, "website"),
            countryCode: text(form, "countryCode").toUpperCase(),
            visibility: text(form, "visibility"),
            industry: nullable(form, "industry"),
            locations: json(form, "locations", []),
            services: list(form, "services"),
            technologies: list(form, "technologies"),
            portfolio: json(form, "portfolio", []),
          },
        };
      else return;
      if (await mutate("/api/profile/settings", "PATCH", payload))
        await settings.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("failed"));
    }
  }

  function contentPayload(form: FormData) {
    const common = {
      visibility: text(form, "visibility"),
      ...(selected ? { version: selected.version } : {}),
    };
    if (["portfolio", "case-study", "publication", "research"].includes(kind))
      return {
        ...common,
        title: text(form, "title"),
        description: nullable(form, "description"),
        projectUrl: nullable(form, "projectUrl"),
        mediaUrl: nullable(form, "mediaUrl"),
        completedAt: nullable(form, "completedAt"),
        sortOrder: Number(text(form, "sortOrder") || 0),
      };
    if (kind === "experience")
      return {
        ...common,
        companyName: text(form, "companyName"),
        title: text(form, "title"),
        description: nullable(form, "description"),
        startedAt: text(form, "startedAt"),
        endedAt: nullable(form, "endedAt"),
      };
    if (kind === "education")
      return {
        ...common,
        institution: text(form, "institution"),
        degree: text(form, "degree"),
        fieldOfStudy: nullable(form, "fieldOfStudy"),
        description: nullable(form, "description"),
        startedAt: nullable(form, "startedAt"),
        endedAt: nullable(form, "endedAt"),
      };
    if (kind === "certification")
      return {
        ...common,
        name: text(form, "name"),
        issuer: text(form, "issuer"),
        credentialId: nullable(form, "credentialId"),
        credentialUrl: nullable(form, "credentialUrl"),
        issuedAt: nullable(form, "issuedAt"),
        expiresAt: nullable(form, "expiresAt"),
      };
    return {
      ...common,
      personaType: data?.activePersonaType,
      platform: text(form, "platform"),
      url: text(form, "url"),
    };
  }

  async function saveContent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = selected
      ? `/api/profile/content/${kind}/${selected.id}`
      : `/api/profile/content/${kind}`;
    if (
      await mutate(
        path,
        selected ? "PATCH" : "POST",
        contentPayload(new FormData(event.currentTarget)),
      )
    ) {
      setSelected(null);
      await Promise.all([content.refresh(), settings.refresh()]);
    }
  }

  async function archive(item: ProfileRecord) {
    if (
      await mutate(
        `/api/profile/content/${kind}/${item.id}?version=${item.version}`,
        "DELETE",
      )
    ) {
      setSelected(null);
      await Promise.all([content.refresh(), settings.refresh()]);
    }
  }

  if (settings.loading)
    return <div className="profile-loading">{t("loading")}</div>;
  if (settings.error || !data)
    return (
      <div className="phase-dashboard__error">
        <p>{settings.error || t("failed")}</p>
        <button type="button" onClick={() => void settings.refresh()}>
          {t("retry")}
        </button>
      </div>
    );
  const personal = data.account.personalIdentity;
  const client = data.account.clientProfile;
  const freelancer = data.account.freelancerProfile;
  const item = selected;
  const formatStatus = (value: Visibility | string) => status.has(value) ? status(value) : title(value);
  const preference = record(client?.hiringPreferences);
  const contentLabels: Record<ContentKind, string> = {
    portfolio: t("portfolio"),
    "case-study": t("caseStudies"),
    publication: t("publications"),
    research: t("research"),
    experience: t("experience"),
    education: t("education"),
    certification: t("certifications"),
    "social-link": t("socialLinks"),
  };
  const mediaFallback = (
    data.account.displayName ||
    data.account.username ||
    "DU"
  )
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const availableSections = [
    "personal",
    ...(client ? ["client"] : []),
    ...(freelancer ? ["freelancer", "content"] : []),
    ...(data.organizations.length ? ["organization"] : []),
  ] as Array<"personal" | "client" | "freelancer" | "organization" | "content">;

  return (
    <div className="profile-settings">
      <header>
        <p>{t("profileSettings")}</p>
        <h1>{t("manageIdentity")}</h1>
        <div className="completion-strip">
           {Object.entries(data.completion).map(([key, value]) => (
             <span key={key}>
              {t(key)} <strong>{value.percentage}%</strong>
             </span>
          ))}
        </div>
      </header>
      <nav className="profile-settings__tabs" aria-label={t("profileSettings")}>
        {availableSections.map((key) => (
          <button
            type="button"
            key={key}
            aria-current={section === key ? "page" : undefined}
             onClick={() => {
               setSection(key);
               setSelected(null);
               window.history.replaceState(null, "", key === "content" ? "#portfolio" : window.location.pathname);
             }}
          >
            {t(key)}
          </button>
        ))}
      </nav>
      {notice ? (
        <p className="enterprise-notice" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="enterprise-error" role="alert">
          {error}
        </p>
      ) : null}
      {section === "client" && client && data.capabilities.editClient ? (
        <div className="profile-media-grid">
          <ProfileMediaControl
            target="client"
            asset="avatar"
            value={client.avatarUrl}
            label={t("profilePhoto")}
            fallback={mediaFallback}
            onChanged={mediaChanged}
          />
          <ProfileMediaControl
            target="client"
            asset="banner"
            value={client.bannerUrl}
            label={t("coverImage")}
            fallback=""
            onChanged={mediaChanged}
          />
        </div>
      ) : null}
      {section === "freelancer" && freelancer && data.capabilities.editFreelancer ? (
        <div className="profile-media-grid">
          <ProfileMediaControl
            target="freelancer"
            asset="avatar"
            value={freelancer.avatarUrl}
            label={t("profilePhoto")}
            fallback={mediaFallback}
            onChanged={mediaChanged}
          />
          <ProfileMediaControl
            target="freelancer"
            asset="banner"
            value={freelancer.bannerUrl}
            label={t("coverImage")}
            fallback=""
            onChanged={mediaChanged}
          />
        </div>
      ) : null}
      {section === "organization" && organization?.companyProfile && data.capabilities.editOrganizationIds.includes(organization.id) ? (
        <div className="profile-media-grid">
          <ProfileMediaControl
            target="organization"
            asset="logo"
            value={organization.companyProfile.logoUrl}
            label={t("organizationLogo")}
            fallback={organization.name.slice(0, 2).toUpperCase()}
            onChanged={mediaChanged}
          />
          <ProfileMediaControl
            target="organization"
            asset="banner"
            value={organization.companyProfile.bannerUrl}
            label={t("coverImage")}
            fallback=""
            onChanged={mediaChanged}
          />
        </div>
      ) : null}
      {section === "personal" ? (
        <form
          className="profile-form"
          onSubmit={(event) => void saveSettings(event, "personal")}
        >
          <FormSection titleText={t("accountIdentity")} description={t("accountIdentityHelp")}>
            <label>{t("email")}<input value={data.account.email} type="email" disabled aria-describedby="email-help" /><small id="email-help">{t("emailManagedHelp")}</small></label>
            <Field label={t("username")} name="username" value={data.account.username} required />
            <Field label={t("displayName")} name="displayName" value={data.account.displayName} required />
            <Field label={t("preferredName")} name="preferredName" value={personal?.preferredName} required />
          </FormSection>
          <FormSection titleText={t("regionalPreferences")} description={t("regionalPreferencesHelp")}>
            <CountrySelect label={t("country")} name="countryCode" value={personal?.countryCode ?? "AE"} required />
            <label>{t("timezone")}<select name="timezone" defaultValue={personal?.timezone ?? "Asia/Dubai"} required>{personal?.timezone && !timezoneOptions.some(([value]) => value === personal.timezone) ? <option value={personal.timezone}>{personal.timezone}</option> : null}{timezoneOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>{t("language")}<select name="locale" defaultValue={personal?.locale ?? data.account.preferredLocale}><option value="en-AE">English (UAE)</option><option value="ar-AE">العربية (الإمارات)</option></select></label>
          </FormSection>
          <button disabled={working}>{t("save")}</button>
        </form>
      ) : null}
      {section === "client" ? (
        client ? (
          data.capabilities.editClient ? <form
            className="profile-form"
            onSubmit={(event) => void saveSettings(event, "client")}
          >
            <FormSection titleText={t("profilePresentation")} description={t("profilePresentationHelp")}>
              <Field label={t("displayName")} name="displayName" value={client.displayName} required />
              <Field label={t("headline")} name="headline" value={client.headline} />
              <Field label={t("about")} name="about" value={client.about} textarea />
              <VisibilityField value={client.visibility} label={t("visibility")} format={formatStatus} />
            </FormSection>
            <FormSection titleText={t("businessDetails")} description={t("businessDetailsHelp")}>
              <Field label={t("industry")} name="industry" value={client.industry} />
              <label>{t("companySize")}<select name="companySize" defaultValue={client.companySize ?? ""}><option value="">{t("notSpecified")}</option>{client.companySize && !["1", "2-10", "11-50", "51-200", "201-500", "501-1000", "1001+"].includes(client.companySize) ? <option value={client.companySize}>{title(client.companySize)}</option> : null}{["1", "2-10", "11-50", "51-200", "201-500", "501-1000", "1001+"].map((value) => <option key={value} value={value}>{value === "1" ? t("justMe") : value}</option>)}</select></label>
              <Field label={t("website")} name="website" value={client.website} type="url" />
              <MultiValueField label={t("languages")} name="languages" values={client.languages} placeholder={t("languagePlaceholder")} addLabel={t("add")} removeLabel={t("remove")} help={t("tagInputHelp")} />
            </FormSection>
            <FormSection titleText={t("hiringPreferences")} description={t("hiringPreferencesHelp")}>
              <MultiChoiceField label={t("engagementModels")} name="engagementModels" values={client.engagementModels} options={[{ value: "FIXED_PRICE", label: status("FIXED_PRICE") }, { value: "HOURLY", label: status("HOURLY") }, { value: "RETAINER", label: status("RETAINER") }, { value: "EMPLOYMENT", label: status("EMPLOYMENT") }]} />
              <label>{t("preferredSeniority")}<select name="hiringSeniority" defaultValue={typeof preference.seniority === "string" ? preference.seniority.toLocaleLowerCase() : ""}><option value="">{t("flexible")}</option><option value="entry">{status("ENTRY")}</option><option value="intermediate">{status("INTERMEDIATE")}</option><option value="expert">{status("EXPERT")}</option></select></label>
              <label>{t("workMode")}<select name="hiringWorkMode" defaultValue={typeof preference.workMode === "string" ? preference.workMode : ""}><option value="">{t("flexible")}</option><option value="REMOTE">{t("remote")}</option><option value="HYBRID">{t("hybrid")}</option><option value="ON_SITE">{t("onSite")}</option></select></label>
              <label>{t("projectLength")}<select name="hiringProjectLength" defaultValue={typeof preference.projectLength === "string" ? preference.projectLength : ""}><option value="">{t("flexible")}</option><option value="SHORT_TERM">{t("shortTerm")}</option><option value="MEDIUM_TERM">{t("mediumTerm")}</option><option value="LONG_TERM">{t("longTerm")}</option></select></label>
              <Field label={t("preferredLocation")} name="hiringLocation" value={preference.preferredLocation} />
              <MultiValueField label={t("preferredSkills")} name="hiringSkills" values={Array.isArray(preference.skills) ? preference.skills.filter((value): value is string => typeof value === "string") : []} placeholder={t("skillPlaceholder")} addLabel={t("add")} removeLabel={t("remove")} help={t("tagInputHelp")} />
              <Field label={t("hiringNotes")} name="hiringNotes" value={preference.notes} textarea />
              <label>{t("responseTime")}<input name="responseTimeMinutes" defaultValue={client.responseTimeMinutes ?? ""} type="number" min="0" max="525600" inputMode="numeric" /><small>{t("responseTimeHelp")}</small></label>
              <label className="profile-checkbox"><input type="checkbox" name="hiringRemoteOnly" defaultChecked={Boolean(preference.remoteOnly)} />{t("remoteOnly")}</label>
              <label className="profile-checkbox"><input type="checkbox" name="hiringAvailable" defaultChecked={client.hiringAvailable} />{t("hiring")}</label>
            </FormSection>
            <FormSection titleText={t("privacyControls")} description={t("privacyControlsHelp")}>
              <label className="profile-checkbox"><input type="checkbox" name="showVerifiedSpend" defaultChecked={client.showVerifiedSpend} />{t("showVerifiedSpend")}</label>
            </FormSection>
            <button disabled={working}>{t("save")}</button>
          </form> : <PermissionState titleText={t("clientEditingUnavailable")} description={t("clientEditingPermission")} action={t("managePersonas")} />
        ) : (
          <EmptyState titleText={t("clientProfileEmpty")} description={t("clientProfileEmptyHelp")} action={t("managePersonas")} />
        )
      ) : null}
      {section === "freelancer" ? (
        freelancer ? (
          data.capabilities.editFreelancer ? <form
            className="profile-form"
            onSubmit={(event) => void saveSettings(event, "freelancer")}
          >
            <FormSection titleText={t("profilePresentation")} description={t("freelancerPresentationHelp")}>
              <Field label={t("headline")} name="headline" value={freelancer.headline} required />
              <Field label={t("summary")} name="bio" value={freelancer.bio} textarea />
              <VisibilityField value={freelancer.visibility} label={t("visibility")} format={formatStatus} />
            </FormSection>
            <FormSection titleText={t("ratesAndAvailability")} description={t("ratesAndAvailabilityHelp")}>
              <label>{t("hourlyRateAed")}<input name="hourlyRate" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={freelancer.hourlyRateMinor ? Number(freelancer.hourlyRateMinor) / 100 : ""} /></label>
              <label>{t("currency")}<select name="currency" defaultValue={freelancer.currency}><option value="AED">AED — {t("uaeDirham")}</option></select></label>
              <label>{t("availability")}<select name="availability" defaultValue={freelancer.availability}><option value="AVAILABLE">{status("AVAILABLE")}</option><option value="LIMITED">{status("LIMITED")}</option><option value="UNAVAILABLE">{status("UNAVAILABLE")}</option></select></label>
              <label>{t("yearsExperience")}<input name="yearsExperience" defaultValue={freelancer.yearsExperience} type="number" min="0" max="80" inputMode="numeric" /></label>
              <label className="profile-checkbox"><input type="checkbox" name="fixedPriceAvailable" defaultChecked={freelancer.fixedPriceAvailable} />{t("fixedPrice")}</label>
            </FormSection>
            <FormSection titleText={t("expertiseAndServices")} description={t("expertiseAndServicesHelp")}>
              <MultiValueField label={t("languages")} name="languages" values={freelancer.languages} placeholder={t("languagePlaceholder")} addLabel={t("add")} removeLabel={t("remove")} help={t("tagInputHelp")} />
              <MultiValueField label={t("industries")} name="industries" values={freelancer.industries} placeholder={t("industryPlaceholder")} addLabel={t("add")} removeLabel={t("remove")} help={t("tagInputHelp")} />
              <MultiValueField label={t("services")} name="services" values={freelancer.services} placeholder={t("servicePlaceholder")} addLabel={t("add")} removeLabel={t("remove")} help={t("tagInputHelp")} />
            </FormSection>
            <FormSection titleText={t("professionalLinks")} description={t("professionalLinksHelp")}>
              <Field label={t("resume")} name="resumeUrl" value={freelancer.resumeUrl} type="url" />
              <Field label={t("videoIntroduction")} name="videoUrl" value={freelancer.videoUrl} type="url" />
              <Field label="GitHub" name="githubUrl" value={freelancer.githubUrl} type="url" />
              <Field label="LinkedIn" name="linkedinUrl" value={freelancer.linkedinUrl} type="url" />
            </FormSection>
            <button disabled={working}>{t("save")}</button>
          </form> : <PermissionState titleText={t("freelancerEditingUnavailable")} description={t("freelancerEditingPermission")} action={t("managePersonas")} />
        ) : (
          <EmptyState titleText={t("freelancerProfileEmpty")} description={t("freelancerProfileEmptyHelp")} action={t("managePersonas")} />
        )
      ) : null}
      {section === "organization" ? (
        <>
          <label className="profile-org-select">
            {t("organization")}
            <select
              value={organization?.id ?? ""}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              {data.organizations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          {organization?.companyProfile ? (
            data.capabilities.editOrganizationIds.includes(organization.id) ? <form
              key={organization.id}
              className="profile-form"
              onSubmit={(event) => void saveSettings(event, "organization")}
            >
              <FormSection titleText={t("organizationIdentity")} description={t("organizationIdentityHelp")}>
                <Field label={t("legalName")} name="legalName" value={organization.companyProfile.legalName} required />
                <Field label={t("tradingName")} name="tradingName" value={organization.companyProfile.tradingName} />
                <Field label={t("about")} name="description" value={organization.companyProfile.description} textarea />
                <VisibilityField value={organization.companyProfile.visibility} label={t("visibility")} format={formatStatus} />
              </FormSection>
              <FormSection titleText={t("businessDetails")} description={t("organizationBusinessHelp")}>
                <Field label={t("website")} name="website" value={organization.companyProfile.website} type="url" />
                <CountrySelect label={t("country")} name="countryCode" value={organization.companyProfile.countryCode} required />
                <Field label={t("industry")} name="industry" value={organization.companyProfile.industry} />
              </FormSection>
              <FormSection titleText={t("capabilitiesAndLocations")} description={t("capabilitiesAndLocationsHelp")}>
                <MultiValueField label={t("services")} name="services" values={organization.companyProfile.services} placeholder={t("servicePlaceholder")} addLabel={t("add")} removeLabel={t("remove")} help={t("tagInputHelp")} />
                <MultiValueField label={t("technologies")} name="technologies" values={organization.companyProfile.technologies} placeholder={t("technologyPlaceholder")} addLabel={t("add")} removeLabel={t("remove")} help={t("tagInputHelp")} />
                <LocationsEditor label={t("locations")} value={organization.companyProfile.locations} cityLabel={t("locationName")} countryLabel={t("country")} addLabel={t("addLocation")} removeLabel={t("remove")} emptyLabel={t("noLocations")} />
              </FormSection>
              <FormSection titleText={t("organizationPortfolio")} description={t("organizationPortfolioHelp")}>
                <PortfolioEditor label={t("portfolioProjects")} value={organization.companyProfile.portfolio} titleLabel={t("title")} descriptionLabel={t("description")} urlLabel={t("projectUrl")} addLabel={t("addProject")} removeLabel={t("remove")} emptyLabel={t("noPortfolioProjects")} />
              </FormSection>
              <button disabled={working}>{t("save")}</button>
            </form> : <PermissionState titleText={t("organizationEditingUnavailable")} description={t("organizationEditingPermission")} action={t("managePersonas")} />
          ) : (
            <EmptyState titleText={t("organizationProfileEmpty")} description={t("organizationProfileEmptyHelp")} action={t("managePersonas")} />
          )}
        </>
      ) : null}
      {section === "content" ? (
        data.capabilities.manageContent ? <div id="portfolio" className="content-manager">
          <div className="content-manager__intro"><p>{t("contentWorkspaceEyebrow")}</p><h2>{t("contentWorkspaceTitle")}</h2><span>{t("contentWorkspaceHelp")}</span></div>
          <div className="content-manager__toolbar">
            <label>
              {t("contentType")}
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as ContentKind);
                  setSelected(null);
                }}
              >
                {contentKinds.map((entry) => (
                  <option key={entry} value={entry}>
                    {contentLabels[entry]}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setSelected(null)}>
              {t("newItem")}
            </button>
          </div>
          <div className="content-manager__layout">
            <div className="content-manager__list">
              {content.loading ? (
                <p>{t("loading")}</p>
              ) : content.error ? (
                <p className="enterprise-error">{content.error}</p>
              ) : content.data?.length ? (
                content.data.map((entry) => (
                  <article key={entry.id}>
                    <strong>
                      {String(
                        entry.title ??
                          entry.name ??
                          entry.institution ??
                          entry.platform ??
                          t("content"),
                      )}
                    </strong>
                    <span>{formatStatus(entry.visibility)}</span>
                    <div>
                      <button type="button" onClick={() => setSelected(entry)}>
                        {t("edit")}
                      </button>
                      <button type="button" onClick={() => void archive(entry)}>
                        {t("archive")}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="profile-empty content-manager__empty"><strong>{t("contentEmptyTitle", { type: contentLabels[kind] })}</strong><span>{t("contentEmptyHelp")}</span></div>
              )}
            </div>
            <form
              key={`${kind}-${item?.id ?? "new"}`}
              className="profile-form content-manager__form"
              onSubmit={(event) => void saveContent(event)}
            >
              <div className="content-manager__form-heading"><p>{selected ? t("editingItem") : t("creatingItem")}</p><h2>{contentLabels[kind]}</h2></div>
              <VisibilityField value={item?.visibility ?? "PUBLIC"} label={t("visibility")} format={formatStatus} />
              {["portfolio", "case-study", "publication", "research"].includes(
                kind,
              ) ? (
                <>
                  <Field
                    label={t("title")}
                    name="title"
                    value={item?.title}
                    required
                  />
                  <Field
                    label={t("description")}
                    name="description"
                    value={item?.description}
                    textarea
                  />
                  <Field
                    label={t("projectUrl")}
                    name="projectUrl"
                    value={item?.projectUrl}
                    type="url"
                  />
                  <Field
                    label={t("mediaUrl")}
                    name="mediaUrl"
                    value={item?.mediaUrl}
                    type="url"
                  />
                  <Field
                    label={t("completedAt")}
                    name="completedAt"
                    value={dateInput(item?.completedAt)}
                    type="date"
                  />
                  <Field
                    label={t("displayOrder")}
                    name="sortOrder"
                    value={item?.sortOrder ?? 0}
                    type="number"
                  />
                </>
              ) : null}
              {kind === "experience" ? (
                <>
                  <Field
                    label={t("company")}
                    name="companyName"
                    value={item?.companyName}
                    required
                  />
                  <Field
                    label={t("title")}
                    name="title"
                    value={item?.title}
                    required
                  />
                  <Field
                    label={t("description")}
                    name="description"
                    value={item?.description}
                    textarea
                  />
                  <Field
                    label={t("startedAt")}
                    name="startedAt"
                    value={dateInput(item?.startedAt)}
                    type="date"
                    required
                  />
                  <Field
                    label={t("endedAt")}
                    name="endedAt"
                    value={dateInput(item?.endedAt)}
                    type="date"
                  />
                </>
              ) : null}
              {kind === "education" ? (
                <>
                  <Field
                    label={t("institution")}
                    name="institution"
                    value={item?.institution}
                    required
                  />
                  <Field
                    label={t("degree")}
                    name="degree"
                    value={item?.degree}
                    required
                  />
                  <Field
                    label={t("fieldOfStudy")}
                    name="fieldOfStudy"
                    value={item?.fieldOfStudy}
                  />
                  <Field
                    label={t("description")}
                    name="description"
                    value={item?.description}
                    textarea
                  />
                  <Field
                    label={t("startedAt")}
                    name="startedAt"
                    value={dateInput(item?.startedAt)}
                    type="date"
                  />
                  <Field
                    label={t("endedAt")}
                    name="endedAt"
                    value={dateInput(item?.endedAt)}
                    type="date"
                  />
                </>
              ) : null}
              {kind === "certification" ? (
                <>
                  <Field
                    label={t("certification")}
                    name="name"
                    value={item?.name}
                    required
                  />
                  <Field
                    label={t("issuer")}
                    name="issuer"
                    value={item?.issuer}
                    required
                  />
                  <Field
                    label={t("credentialId")}
                    name="credentialId"
                    value={item?.credentialId}
                  />
                  <Field
                    label={t("credentialUrl")}
                    name="credentialUrl"
                    value={item?.credentialUrl}
                    type="url"
                  />
                  <Field
                    label={t("issuedAt")}
                    name="issuedAt"
                    value={dateInput(item?.issuedAt)}
                    type="date"
                  />
                  <Field
                    label={t("expiresAt")}
                    name="expiresAt"
                    value={dateInput(item?.expiresAt)}
                    type="date"
                  />
                </>
              ) : null}
              {kind === "social-link" ? (
                <>
                  <Field
                    label={t("platform")}
                    name="platform"
                    value={item?.platform}
                    required
                  />
                  <Field
                    label={t("url")}
                    name="url"
                    value={item?.url}
                    type="url"
                    required
                  />
                </>
              ) : null}
              <button disabled={working}>
                {selected ? t("update") : t("create")}
              </button>
            </form>
          </div>
        </div> : <PermissionState titleText={t("contentEditingUnavailable")} description={t("contentEditingPermission")} action={t("managePersonas")} />
      ) : null}
    </div>
  );
}

function title(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
