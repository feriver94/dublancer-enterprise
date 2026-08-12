"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useApiResource } from "@/lib/client/use-api-resource";
import { formatCountryName } from "@/lib/locale/countries";
import { formatCurrencyMinor } from "@/lib/locale/formatters";
import type { AppLocale } from "@/i18n/config";

type Provider = {
  id: string; headline: string; availability: string; hourlyRateMinor: string | null; currency: string; yearsExperience: number; countryCode: string; languages: string[]; services: string[]; href: string;
  skills: Array<{ verifiedAt: string | null; skill: { slug: string; nameEn: string; nameAr: string | null } }>;
  _count: { portfolioItems: number };
  user: { verifiedCredentials: Array<{ type: string }> };
  reputation: { status: string; overall: number | null; reviewCount: number; completionRate: number | null; onTimeDeliveryRate: number | null };
};

export default function ProviderComparisonClient({ initialIds }: { initialIds: string[] }) {
  const t = useTranslations("PhaseC");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const path = useMemo(() => initialIds.length >= 2 ? `/api/marketplace/providers/compare?${initialIds.map((id) => `id=${encodeURIComponent(id)}`).join("&")}` : null, [initialIds]);
  const resource = useApiResource<Provider[]>(path);
  if (initialIds.length < 2) return <main className="py-24"><p className="enterprise-empty">{t("compareNeedTwo")}</p><Link href="/marketplace" className="profile-external">{t("findProviders")}</Link></main>;
  if (resource.loading) return <main className="py-24"><p className="enterprise-loading">{t("loading")}</p></main>;
  if (!resource.data) return <main className="py-24"><p className="enterprise-error">{resource.error || t("unavailable")}</p><button type="button" onClick={() => void resource.refresh()} className="profile-action">{t("retry")}</button></main>;
  const rows: Array<[string, (provider: Provider) => string]> = [
    [t("availability"), (p) => status.has(p.availability) ? status(p.availability) : p.availability],
    [t("hourlyRate"), (p) => p.hourlyRateMinor ? formatCurrencyMinor(p.hourlyRateMinor, p.currency, locale) : t("notPublished")],
    [t("experience"), (p) => String(p.yearsExperience)],
    [t("skills"), (p) => p.skills.map((skill) => `${skill.skill.nameEn}${skill.verifiedAt ? " ✓" : ""}`).join(", ") || "—"],
    [t("services"), (p) => p.services.join(", ") || "—"],
    [t("languages"), (p) => p.languages.join(", ") || "—"],
    [t("portfolio"), (p) => String(p._count.portfolioItems)],
    [t("reputation"), (p) => p.reputation.status === "AVAILABLE" ? `${p.reputation.overall} / 5 (${p.reputation.reviewCount})` : t("notEnoughData")],
    [t("completionRate"), (p) => p.reputation.completionRate == null ? t("notEnoughData") : `${p.reputation.completionRate}%`],
    [t("onTime"), (p) => p.reputation.onTimeDeliveryRate == null ? t("notEnoughData") : `${p.reputation.onTimeDeliveryRate}%`],
  ];
  return <main className="py-12"><header><p className="font-bold uppercase tracking-widest text-[#009A44]">{t("eyebrow")}</p><h1 className="text-4xl font-bold text-[#0F4C5C]">{t("providerComparison")}</h1><p className="mt-2 text-slate-600">{t("comparisonExplanation")}</p></header><div className="mt-8 overflow-x-auto rounded-3xl border bg-white"><table className="w-full min-w-[760px] border-collapse"><thead><tr><th className="p-4 text-start">{t("dimension")}</th>{resource.data.map((provider) => <th key={provider.id} className="p-4 text-start"><Link href={provider.href} className="text-[#0F4C5C] hover:text-[#009A44]">{provider.headline}</Link><span className="block text-xs font-normal text-slate-500">{formatCountryName(provider.countryCode, locale)}</span></th>)}</tr></thead><tbody>{rows.map(([label, value]) => <tr key={label} className="border-t"><th className="p-4 text-start text-sm text-slate-500">{label}</th>{resource.data!.map((provider) => <td key={provider.id} className="p-4 align-top text-sm">{value(provider)}</td>)}</tr>)}</tbody></table></div></main>;
}
