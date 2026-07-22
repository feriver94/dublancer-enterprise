"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Card } from "@/components/ui";
import type { AppLocale } from "@/i18n/config";
import { formatAed } from "@/lib/locale/formatters";
import { useApiResource } from "@/lib/client/use-api-resource";

type Contract = { id: string; title: string; status: string; viewerParty: "CLIENT" | "PROVIDER"; valueMinor: string; currency: string; project?: { id: string; title: string } | null; milestones: Array<{ id: string }> };

export default function ContractsClient() {
  const t = useTranslations("Contracts");
  const common = useTranslations("Common");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const contracts = useApiResource<Contract[]>("/api/contracts");
  const label = (value: string) => status.has(value) ? status(value) : value.replaceAll("_", " ");
  return <main className="py-16">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="font-bold uppercase tracking-widest text-[#009A44]">{t("eyebrow")}</p><h1 className="text-4xl font-bold text-[#0F4C5C]">{t("title")}</h1></div><button type="button" onClick={() => void contracts.refresh()} className="rounded-full border px-5 py-2 font-bold">{common("refresh")}</button></div>
    <Card variant="elevated">{contracts.error ? <p className="enterprise-error" role="alert">{contracts.error}</p> : null}{contracts.loading ? <p className="enterprise-loading">{t("loading")}</p> : contracts.data?.length ? <div className="grid gap-4">{contracts.data.map((contract) => <Link key={contract.id} href={`/contracts/${contract.id}`} className="rounded-2xl border border-slate-200 p-5 hover:border-[#009A44]"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-[#0F4C5C]">{contract.title}</h2><p className="text-sm text-slate-500">{contract.project?.title ?? t("standalone")} · {t("milestoneCount", { count: contract.milestones.length })} · {t("actingAs", { party: label(contract.viewerParty).toLocaleLowerCase(locale) })}</p></div><Badge variant={contract.status === "ACTIVE" ? "success" : "info"}>{label(contract.status)}</Badge></div><p className="mt-4 font-bold text-[#009A44]">{formatAed(Number(contract.valueMinor) / 100, locale)}</p></Link>)}</div> : <p className="enterprise-empty">{t("empty")}</p>}</Card>
  </main>;
}
