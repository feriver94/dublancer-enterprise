"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiGet, apiMutation, resetApiClientCsrf } from "@/lib/client/api-client";
import { Badge, Button, Card } from "@/components/ui";
import { CountrySelect } from "@/components/profile/ProfileFormControls";

type PersonaType = "CLIENT" | "FREELANCER" | "ORGANIZATION";
type Persona = {
  id: string;
  type: PersonaType;
  status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  label: string;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    companyProfile?: {
      legalName: string;
      tradingName?: string | null;
      description?: string | null;
      website?: string | null;
    } | null;
  };
  clientProfile?: { displayName: string; headline?: string | null; about?: string | null } | null;
  freelancerProfile?: {
    headline: string;
    bio?: string | null;
    hourlyRateMinor?: string | null;
    yearsExperience: number;
    availability: "AVAILABLE" | "LIMITED" | "UNAVAILABLE";
  } | null;
};
type Overview = {
  account: {
    email: string;
    displayName: string | null;
    personalIdentity?: {
      preferredName: string;
      legalFirstName?: string | null;
      legalLastName?: string | null;
      phoneCountryCode?: string | null;
      phoneNumber?: string | null;
      countryCode: string;
      timezone: string;
      locale: "en-AE" | "ar-AE";
    } | null;
    onboardingProgress?: {
      status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
      selectedPersonaTypes: PersonaType[];
    } | null;
    accountPersonas: Persona[];
  };
  activePersonaId: string | null;
};

const personaTypes: PersonaType[] = ["CLIENT", "FREELANCER", "ORGANIZATION"];

function value(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export default function PersonaCenterClient({ onboarding = false }: { onboarding?: boolean }) {
  const t = useTranslations("Persona");
  const common = useTranslations("Common");
  const statusLabel = useTranslations("Status");
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<PersonaType[]>([]);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const next = await apiGet<Overview>(onboarding ? "/api/onboarding" : "/api/personas");
    setOverview(next);
    setSelected(next.account.onboardingProgress?.selectedPersonaTypes.length
      ? next.account.onboardingProgress.selectedPersonaTypes
      : next.account.accountPersonas.filter((persona) => persona.status === "ACTIVE").map((persona) => persona.type));
  }

  useEffect(() => {
    let active = true;
    void apiGet<Overview>(onboarding ? "/api/onboarding" : "/api/personas")
      .then((next) => {
        if (!active) return;
        setOverview(next);
        setSelected(next.account.onboardingProgress?.selectedPersonaTypes.length
          ? next.account.onboardingProgress.selectedPersonaTypes
          : next.account.accountPersonas.filter((persona) => persona.status === "ACTIVE").map((persona) => persona.type));
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t("loadFailed")); });
    return () => { active = false; };
  }, [onboarding, t]);

  const byType = useMemo(() => new Map(overview?.account.accountPersonas.map((persona) => [persona.type, persona])), [overview]);
  const organizationPersona = overview?.account.accountPersonas.find((persona) => persona.type === "ORGANIZATION" && persona.organizationId === (overview.account.accountPersonas.find((item) => item.id === overview.activePersonaId)?.organizationId ?? persona.organizationId))
    ?? overview?.account.accountPersonas.find((persona) => persona.type === "ORGANIZATION");

  function toggle(type: PersonaType) {
    setSelected((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  }

  async function save(event: FormEvent<HTMLFormElement>, complete: boolean) {
    event.preventDefault();
    if (!selected.length) {
      setError(t("selectOne"));
      return;
    }
    setPending(complete ? "complete" : "save");
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await apiMutation("/api/onboarding", "PATCH", {
        identity: {
          displayName: value(form, "displayName"),
          legalFirstName: value(form, "legalFirstName") || undefined,
          legalLastName: value(form, "legalLastName") || undefined,
          phoneCountryCode: value(form, "phoneCountryCode") || undefined,
          phoneNumber: value(form, "phoneNumber") || undefined,
          countryCode: value(form, "countryCode").toUpperCase(),
          timezone: value(form, "timezone"),
          locale: value(form, "locale"),
        },
        selectedPersonaTypes: selected,
        ...(selected.includes("CLIENT") ? { client: {
          displayName: value(form, "clientDisplayName"),
          headline: value(form, "clientHeadline") || undefined,
          about: value(form, "clientAbout") || undefined,
        } } : {}),
        ...(selected.includes("FREELANCER") ? { freelancer: {
          headline: value(form, "freelancerHeadline"),
          bio: value(form, "freelancerBio") || undefined,
          hourlyRateMinor: value(form, "hourlyRate") ? String(Math.round(Number(value(form, "hourlyRate")) * 100)) : undefined,
          yearsExperience: Number(value(form, "yearsExperience") || 0),
          availability: value(form, "availability"),
        } } : {}),
        ...(selected.includes("ORGANIZATION") && organizationPersona ? { organization: {
          organizationId: organizationPersona.organizationId,
          legalName: value(form, "legalName"),
          tradingName: value(form, "tradingName") || undefined,
          description: value(form, "organizationDescription") || undefined,
          website: value(form, "website") || undefined,
        } } : {}),
      });
      if (complete) {
        const result = await apiMutation<{ redirectTo: string }>("/api/onboarding/complete", "POST", {});
        resetApiClientCsrf();
        router.replace(result.redirectTo || "/dashboard");
        router.refresh();
        return;
      }
      setNotice(t("saved"));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("saveFailed"));
    } finally {
      setPending("");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    void save(event, submitter?.value === "complete");
  }

  async function activate(personaId: string) {
    setPending(personaId);
    setError("");
    try {
      await apiMutation("/api/personas/activate", "POST", { personaId });
      setNotice(t("activated"));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("activationFailed"));
    } finally {
      setPending("");
    }
  }

  async function switchPersona(personaId: string) {
    setPending(personaId);
    setError("");
    try {
      const result = await apiMutation<{ redirectTo: string }>("/api/personas/switch", "POST", { personaId });
      resetApiClientCsrf();
      router.replace(result.redirectTo || "/dashboard");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("switchFailed"));
      setPending("");
    }
  }

  if (!overview) {
    return <main className="py-14"><Card variant="soft"><p>{error || t("loading")}</p></Card></main>;
  }

  const identity = overview.account.personalIdentity;
  const client = byType.get("CLIENT")?.clientProfile;
  const freelancer = byType.get("FREELANCER")?.freelancerProfile;
  const company = organizationPersona?.organization.companyProfile;

  return (
    <main className="py-12">
      <div className="mb-8 max-w-4xl">
        <Badge variant={onboarding ? "info" : "success"}>{onboarding ? t("guidedOnboarding") : t("accountArchitecture")}</Badge>
        <h1 className="mt-5 text-4xl font-bold text-[#0F4C5C]">{onboarding ? t("onboardingTitle") : t("manageTitle")}</h1>
        <p className="mt-3 text-lg text-slate-600">{t("description")}</p>
      </div>

      {error ? <p className="enterprise-error mb-5" role="alert">{error}</p> : null}
      {notice ? <p className="enterprise-notice mb-5" role="status">{notice}</p> : null}

      <form className="grid gap-6" onSubmit={submit}>
        <Card variant="elevated">
          <div className="mb-5 flex items-center justify-between gap-4"><div><Badge variant="neutral">1</Badge><h2 className="mt-3 text-2xl font-bold text-[#0F4C5C]">{t("personalIdentity")}</h2></div><span className="text-sm text-slate-500">{overview.account.email}</span></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label>{t("displayName")}<input name="displayName" defaultValue={identity?.preferredName ?? overview.account.displayName ?? ""} minLength={2} maxLength={120} required /></label>
            <CountrySelect label={t("country")} name="countryCode" value={identity?.countryCode ?? "AE"} required />
            <label>{t("legalFirstName")}<input name="legalFirstName" defaultValue={identity?.legalFirstName ?? ""} /></label>
            <label>{t("legalLastName")}<input name="legalLastName" defaultValue={identity?.legalLastName ?? ""} /></label>
            <label>{t("phoneCountryCode")}<input name="phoneCountryCode" defaultValue={identity?.phoneCountryCode ?? "+971"} pattern="\+[1-9][0-9]{0,3}" /></label>
            <label>{t("phoneNumber")}<input name="phoneNumber" defaultValue={identity?.phoneNumber ?? ""} inputMode="tel" /></label>
            <label>{t("timezone")}<input name="timezone" defaultValue={identity?.timezone ?? "Asia/Dubai"} required /></label>
            <label>{t("locale")}<select name="locale" defaultValue={identity?.locale ?? "en-AE"}><option value="en-AE">English (UAE)</option><option value="ar-AE">العربية (الإمارات)</option></select></label>
          </div>
        </Card>

        <Card variant="elevated">
          <Badge variant="neutral">2</Badge><h2 className="mt-3 text-2xl font-bold text-[#0F4C5C]">{t("choosePersonas")}</h2><p className="mt-2 text-slate-600">{t("chooseHelp")}</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {personaTypes.map((type) => (
              <button key={type} type="button" onClick={() => toggle(type)} aria-pressed={selected.includes(type)} className={`rounded-3xl border-2 p-5 text-start transition ${selected.includes(type) ? "border-[#009A44] bg-emerald-50" : "border-slate-200 bg-white"}`}>
                <strong className="text-lg text-[#0F4C5C]">{t(`type.${type}`)}</strong><span className="mt-2 block text-sm text-slate-600">{t(`typeHelp.${type}`)}</span>
              </button>
            ))}
          </div>
        </Card>

        {selected.includes("CLIENT") ? <Card variant="soft"><h2 className="text-xl font-bold text-[#0F4C5C]">{t("clientProfile")}</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label>{t("clientDisplayName")}<input name="clientDisplayName" defaultValue={client?.displayName ?? identity?.preferredName ?? ""} required /></label><label>{t("headline")}<input name="clientHeadline" defaultValue={client?.headline ?? ""} /></label><label className="md:col-span-2">{t("about")}<textarea name="clientAbout" defaultValue={client?.about ?? ""} maxLength={3000} /></label></div></Card> : null}

        {selected.includes("FREELANCER") ? <Card variant="soft"><h2 className="text-xl font-bold text-[#0F4C5C]">{t("freelancerProfile")}</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label>{t("headline")}<input name="freelancerHeadline" defaultValue={freelancer?.headline ?? ""} minLength={3} required /></label><label>{t("hourlyRate")}<input name="hourlyRate" type="number" min="0" step="0.01" defaultValue={freelancer?.hourlyRateMinor ? Number(freelancer.hourlyRateMinor) / 100 : ""} /></label><label>{t("yearsExperience")}<input name="yearsExperience" type="number" min="0" max="80" defaultValue={freelancer?.yearsExperience ?? 0} /></label><label>{t("availability")}<select name="availability" defaultValue={freelancer?.availability ?? "AVAILABLE"}><option value="AVAILABLE">{t("available")}</option><option value="LIMITED">{t("limited")}</option><option value="UNAVAILABLE">{t("unavailable")}</option></select></label><label className="md:col-span-2">{t("bio")}<textarea name="freelancerBio" defaultValue={freelancer?.bio ?? ""} maxLength={5000} /></label></div></Card> : null}

        {selected.includes("ORGANIZATION") && organizationPersona ? <Card variant="soft"><h2 className="text-xl font-bold text-[#0F4C5C]">{t("organizationProfile")}</h2><p className="mt-1 text-sm text-slate-500">{organizationPersona.organization.name}</p><div className="mt-4 grid gap-4 md:grid-cols-2"><label>{t("legalName")}<input name="legalName" defaultValue={company?.legalName ?? organizationPersona.organization.name} required /></label><label>{t("tradingName")}<input name="tradingName" defaultValue={company?.tradingName ?? organizationPersona.organization.name} /></label><label>{t("website")}<input name="website" type="url" defaultValue={company?.website ?? ""} /></label><label className="md:col-span-2">{t("about")}<textarea name="organizationDescription" defaultValue={company?.description ?? ""} maxLength={5000} /></label></div></Card> : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={Boolean(pending)}>{pending === "save" ? common("working") : t("saveProgress")}</Button>
          {onboarding ? <Button type="submit" name="intent" value="complete" variant="secondary" disabled={Boolean(pending)}>{pending === "complete" ? common("working") : t("completeOnboarding")}</Button> : null}
        </div>
      </form>

      {!onboarding ? <section className="mt-10"><h2 className="text-2xl font-bold text-[#0F4C5C]">{t("activatedPersonas")}</h2><div className="mt-4 grid gap-4 md:grid-cols-3">{overview.account.accountPersonas.map((persona) => <Card key={persona.id} variant={persona.id === overview.activePersonaId ? "elevated" : "soft"} className="p-5"><div className="flex items-center justify-between gap-3"><strong className="text-[#0F4C5C]">{persona.label}</strong><Badge variant={persona.status === "ACTIVE" ? "success" : "neutral"}>{statusLabel.has(persona.status) ? statusLabel(persona.status) : persona.status}</Badge></div><p className="mt-2 text-sm text-slate-500">{t(`type.${persona.type}`)} · {persona.organization.name}</p><div className="mt-4 flex gap-2">{persona.status !== "ACTIVE" ? <Button size="sm" disabled={Boolean(pending)} onClick={() => void activate(persona.id)}>{t("activate")}</Button> : persona.id !== overview.activePersonaId ? <Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={() => void switchPersona(persona.id)}>{t("switch")}</Button> : <span className="text-sm font-bold text-[#009A44]">{t("current")}</span>}</div></Card>)}</div></section> : null}
    </main>
  );
}
