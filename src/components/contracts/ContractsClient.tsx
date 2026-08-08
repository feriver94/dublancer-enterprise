"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import type { AppLocale } from "@/i18n/config";
import { formatAed } from "@/lib/locale/formatters";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";

type Contract = { id: string; title: string; status: string; viewerParty: "CLIENT" | "PROVIDER"; valueMinor: string; currency: string; project?: { id: string; title: string } | null; milestones: Array<{ id: string }> };
type Project = { id: string; title: string; status: string };

export default function ContractsClient({ activePersonaType }: { activePersonaType: "CLIENT" | "FREELANCER" | "ORGANIZATION" | null }) {
  const t = useTranslations("Contracts");
  const common = useTranslations("Common");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const contracts = useApiResource<Contract[]>("/api/contracts");
  const projects = useApiResource<Project[]>("/api/projects?take=100");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const label = (value: string) => status.has(value) ? status(value) : value.replaceAll("_", " ");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError("");
    setNotice("");
    try {
      let terms: Record<string, unknown>;
      try {
        terms = JSON.parse(String(data.get("terms") || "{}")) as Record<string, unknown>;
      } catch {
        throw new Error(t("invalidJson"));
      }
      await apiMutation("/api/contracts", "POST", {
        title: data.get("title"),
        projectId: data.get("projectId") || undefined,
        providerOrganizationId: data.get("providerOrganizationId") || undefined,
        providerUserId: data.get("providerUserId") || undefined,
        valueMinor: String(Math.round(Number(data.get("value")) * 100)),
        currency: "AED",
        taxRateBasisPoints: Math.round(Number(data.get("taxRate") || 0) * 100),
        platformFeeBasisPoints: Math.round(Number(data.get("platformFee") || 0) * 100),
        terms,
        startsAt: data.get("startsAt") || undefined,
        endsAt: data.get("endsAt") || undefined,
      });
      form.reset();
      setNotice(t("created"));
      await contracts.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("actionFailed"));
    } finally {
      setPending(false);
    }
  }

  return <main className="py-16">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-bold uppercase tracking-widest text-[#009A44]">{t("eyebrow")}</p><h1 className="text-4xl font-bold text-[#0F4C5C]">{t("title")}</h1></div>
      <button type="button" onClick={() => void Promise.all([contracts.refresh(), projects.refresh()])} className="rounded-full border px-5 py-2 font-bold">{common("refresh")}</button>
    </div>
    {error || contracts.error || projects.error ? <p className="enterprise-error mb-5" role="alert">{error || contracts.error || projects.error}</p> : null}
    {notice ? <p className="enterprise-notice mb-5" role="status">{notice}</p> : null}
    <div className={`grid gap-6 ${activePersonaType === "FREELANCER" ? "" : "xl:grid-cols-[minmax(0,1fr)_380px]"}`}>
      <Card variant="elevated">
        {contracts.loading ? <p className="enterprise-loading">{t("loading")}</p> : contracts.data?.length ? <div className="grid gap-4">{contracts.data.map((contract) => <Link key={contract.id} href={`/contracts/${contract.id}`} className="rounded-2xl border border-slate-200 p-5 hover:border-[#009A44]"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-[#0F4C5C]">{contract.title}</h2><p className="text-sm text-slate-500">{contract.project?.title ?? t("standalone")} · {t("milestoneCount", { count: contract.milestones.length })} · {t("actingAs", { party: label(contract.viewerParty).toLocaleLowerCase(locale) })}</p></div><Badge variant={contract.status === "ACTIVE" ? "success" : "info"}>{label(contract.status)}</Badge></div><p className="mt-4 font-bold text-[#009A44]">{formatAed(Number(contract.valueMinor) / 100, locale)}</p></Link>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center"><p className="enterprise-empty">{t("empty")}</p><a href="#contract-create" className="mt-4 inline-block rounded-full bg-[#009A44] px-5 py-3 font-bold text-white">{t("createFirst")}</a></div>}
      </Card>
      {activePersonaType !== "FREELANCER" ? <Card id="contract-create" variant="elevated">
        <h2 className="text-2xl font-bold text-[#0F4C5C]">{t("createContract")}</h2>
        <p className="mt-2 text-sm text-slate-600">{t("createHelp")}</p>
        <form className="enterprise-form mt-5" onSubmit={(event) => void create(event)}>
          <label>{common("title")}<input name="title" minLength={3} required /></label>
          <label>{t("linkedProject")}<select name="projectId" defaultValue=""><option value="">{t("standalone")}</option>{projects.data?.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
          <label>{t("valueAed")}<input name="value" type="number" min="0" step="0.01" required /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label>{t("taxRate")}<input name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label><label>{t("platformFee")}<input name="platformFee" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label></div>
          <label>{t("termsJson")}<textarea name="terms" defaultValue={'{"scope":"","deliverables":[],"paymentTerms":""}'} required /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label>{t("startDate")}<input name="startsAt" type="date" /></label><label>{t("endDate")}<input name="endsAt" type="date" /></label></div>
          <details className="rounded-xl border p-3"><summary className="cursor-pointer font-bold">{t("providerIdentifiers")}</summary><div className="mt-3 grid gap-3"><label>{t("providerOrganizationId")}<input name="providerOrganizationId" /></label><label>{t("providerUserId")}<input name="providerUserId" /></label></div></details>
          <Button disabled={pending}>{pending ? common("saving") : t("createContract")}</Button>
        </form>
      </Card> : null}
    </div>
  </main>;
}
