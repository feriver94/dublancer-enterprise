"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";

type Settings = { activePersonaType: "CLIENT" | "FREELANCER" | "ORGANIZATION" | null };
type Result = {
  available: boolean;
  autoApplied: false;
  reason?: string;
  run?: { id: string; status: string; output?: unknown; approval?: { status: string } | null };
};

const freelancerCases = ["FREELANCER_HEADLINE", "FREELANCER_SUMMARY", "FREELANCER_COMPLETENESS", "FREELANCER_SKILL_GAPS", "FREELANCER_PORTFOLIO", "FREELANCER_CAPABILITY", "FREELANCER_OPPORTUNITY_MATCH", "FREELANCER_RATE_POSITIONING"];
const clientCases = ["CLIENT_HIRING_PROFILE", "CLIENT_PROJECT_BRIEF", "CLIENT_SKILL_SUGGESTIONS", "CLIENT_PROVIDER_COMPARISON", "CLIENT_SCOPE_RISK"];

export default function AiProfileAssistant() {
  const t = useTranslations("PhaseC");
  const settings = useApiResource<Settings>("/api/profile/settings");
  const [useCase, setUseCase] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const cases = settings.data?.activePersonaType === "FREELANCER" ? freelancerCases : clientCases;

  async function requestSuggestion() {
    setPending(true);
    setError("");
    setResult(null);
    try {
      setResult(await apiMutation<Result>("/api/profile/ai-assistance", "POST", {
        useCase: useCase || cases[0],
        userContext: context || undefined,
        idempotencyKey: `profile-${crypto.randomUUID()}`,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("actionFailed"));
    } finally {
      setPending(false);
    }
  }

  return <Card variant="elevated" className="my-8">
    <p className="font-bold uppercase tracking-widest text-[#009A44]">{t("eyebrow")}</p>
    <h2 className="mt-2 text-2xl font-bold text-[#0F4C5C]">{t("aiAssistant")}</h2>
    <p className="mt-2 text-slate-600">{t("neverAutoPublish")}</p>
    <div className="enterprise-form mt-5">
      <label>{t("assistanceType")}<select value={useCase || cases[0] || ""} onChange={(event) => setUseCase(event.target.value)} disabled={settings.loading}>{cases.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
      <label>{t("optionalContext")}<textarea value={context} maxLength={2000} onChange={(event) => setContext(event.target.value)} /></label>
      <Button type="button" disabled={pending || settings.loading || !settings.data?.activePersonaType} onClick={() => void requestSuggestion()}>{pending ? t("loading") : t("requestSuggestion")}</Button>
    </div>
    {error ? <p className="enterprise-error mt-4">{error}</p> : null}
    {result && !result.available ? <p className="enterprise-notice mt-4">{t("providerUnavailable")}</p> : null}
    {result?.run ? <div className="enterprise-notice mt-4"><strong>{t("aiGenerated")}</strong><p>{t("runStatus", { status: result.run.status })}</p>{result.run.approval ? <p>{t("humanApproval")}</p> : null}{result.run.output ? <pre className="mt-3 whitespace-pre-wrap">{JSON.stringify(result.run.output, null, 2)}</pre> : null}<a className="mt-3 inline-block font-bold text-[#009A44]" href="/ai-platform">{t("openAiWorkspace")}</a></div> : null}
  </Card>;
}
