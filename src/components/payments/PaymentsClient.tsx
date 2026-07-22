"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import type { AppLocale } from "@/i18n/config";
import { formatAed, formatUaeDate } from "@/lib/locale/formatters";

type Transaction = { id: string; type: string; status: string; amountMinor: string; currency: string; providerRef?: string | null; refunds: Array<{ id: string; status: string; amountMinor: string }> };
type Invoice = { id: string; number: string; status: string; version: number; canManage: boolean; totalMinor: string; subtotalMinor: string; taxMinor: string; currency: string; dueAt?: string | null; issuedAt?: string | null; paidAt?: string | null; contract?: { id: string; title: string; status: string } | null; lines: Array<{ id: string; description: string; quantity: number; totalMinor: string }>; paymentSchedules: Array<{ id: string; status: string; contractMilestone?: { id: string; title: string; status: string; amountMinor: string; currency: string } | null }>; transactions: Transaction[] };
type Contract = { id: string; title: string; status: string; currency: string; viewerParty: "CLIENT" | "PROVIDER"; milestones: Array<{ id: string; title: string; status: string; amountMinor: string; currency: string }> };

export default function PaymentsClient() {
  const t = useTranslations("Finance");
  const common = useTranslations("Common");
  const statusLabel = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const money = (minor: string) => formatAed(Number(minor) / 100, locale);
  const date = (value?: string | null) => value ? formatUaeDate(value, locale) : t("notSet");
  const invoices = useApiResource<Invoice[]>("/api/finance/invoices");
  const contracts = useApiResource<Contract[]>("/api/contracts");
  const [selectedContract, setSelectedContract] = useState("");
  const [selectedMilestone, setSelectedMilestone] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const contract = useMemo(() => contracts.data?.find((item) => item.id === selectedContract), [contracts.data, selectedContract]);
  const clientContracts = useMemo(() => contracts.data?.filter((item) => item.viewerParty === "CLIENT") ?? [], [contracts.data]);
  const acceptedMilestones = contract?.milestones.filter((item) => item.status === "ACCEPTED") ?? [];

  async function mutate(label: string, operation: () => Promise<unknown>, success: string) {
    setPending(label); setError(""); setNotice("");
    try { await operation(); setNotice(success); await invoices.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("requestFailed")); }
    finally { setPending(""); }
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const milestone = acceptedMilestones.find((item) => item.id === data.get("milestoneId"));
    const amount = milestone ? milestone.amountMinor : String(Math.round(Number(data.get("amount")) * 100));
    await mutate("invoice:create", () => apiMutation("/api/finance/invoices", "POST", {
      number: data.get("number"), contractId: data.get("contractId") || undefined,
      contractMilestoneId: data.get("milestoneId") || undefined, currency: "AED", dueAt: data.get("dueAt"),
      lines: [{ description: data.get("description"), quantity: 1, unitAmountMinor: amount, taxRateBasisPoints: 0 }],
    }), t("draftCreated"));
  }

  async function transition(invoice: Invoice, action: "ISSUE" | "MARK_OVERDUE" | "VOID") {
    if (action === "VOID" && !window.confirm(t("voidConfirm"))) return;
    await mutate(`${invoice.id}:${action}`, () => apiMutation(`/api/finance/invoices/${invoice.id}`, "PATCH", {
      action, expectedVersion: invoice.version,
      dueAt: action === "ISSUE" ? invoice.dueAt : undefined,
      reason: action === "VOID" ? t("voidReason") : undefined,
    }), action === "ISSUE" ? t("issuedNotice") : action === "MARK_OVERDUE" ? t("overdueNotice") : t("voidedNotice"));
  }

  async function charge(invoice: Invoice) {
    if (!window.confirm(t("chargeConfirm", { amount: money(invoice.totalMinor) }))) return;
    await mutate(`${invoice.id}:charge`, () => apiMutation("/api/finance/charges", "POST", { invoiceId: invoice.id, idempotencyKey: crypto.randomUUID() }), t("chargeSubmitted"));
  }

  async function refund(event: FormEvent<HTMLFormElement>, transaction: Transaction) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (!window.confirm(t("refundConfirm"))) return;
    await mutate(`${transaction.id}:refund`, () => apiMutation("/api/finance/refunds", "POST", {
      transactionId: transaction.id,
      amountMinor: String(Math.round(Number(data.get("amount")) * 100)),
      reason: data.get("reason"), idempotencyKey: crypto.randomUUID(),
    }), t("refundSubmitted"));
  }

  return <main className="py-16">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="font-bold uppercase tracking-widest text-[#009A44]">{t("eyebrow")}</p><h1 className="text-4xl font-bold text-[#0F4C5C]">{t("paymentsTitle")}</h1><p className="mt-2 max-w-3xl text-slate-600">{t("description")}</p></div><button type="button" onClick={() => void invoices.refresh()} className="rounded-full border px-5 py-2 font-bold">{common("refresh")}</button></div>
    <Card variant="elevated" className="mb-6"><p className="text-sm text-slate-600"><strong>{t("providerBoundary")}</strong> {t("providerBoundaryDescription")}</p></Card>
    {invoices.error || contracts.error || error ? <p className="enterprise-error mb-6" role="alert">{invoices.error || contracts.error || error}</p> : null}
    {notice ? <p className="enterprise-notice mb-6" role="status">{notice}</p> : null}
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <aside><Card variant="elevated"><h2 className="text-xl font-bold text-[#0F4C5C]">{t("createDraft")}</h2><form className="enterprise-form mt-5" onSubmit={(event) => void createInvoice(event)}><label>{t("invoiceNumber")}<input name="number" minLength={1} maxLength={100} defaultValue={`INV-${new Date().getFullYear()}-`} required /></label><label>{t("contract")}<select name="contractId" value={selectedContract} onChange={(event) => { setSelectedContract(event.target.value); setSelectedMilestone(""); }}><option value="">{t("standaloneInvoice")}</option>{clientContracts.map((item) => <option key={item.id} value={item.id}>{item.title} · {statusLabel.has(item.status) ? statusLabel(item.status) : item.status}</option>)}</select></label>{selectedContract ? <label>{t("acceptedMilestone")}<select name="milestoneId" value={selectedMilestone} onChange={(event) => setSelectedMilestone(event.target.value)}><option value="">{t("noMilestone")}</option>{acceptedMilestones.map((item) => <option key={item.id} value={item.id}>{item.title} · {money(item.amountMinor)}</option>)}</select></label> : null}<label>{common("description")}<textarea name="description" minLength={1} required /></label><label>{t("amountAed")}<input name="amount" type="number" min="0.01" step="0.01" disabled={Boolean(selectedMilestone)} required={!selectedMilestone} /></label><label>{t("dueDate")}<input name="dueAt" type="date" required /></label><Button disabled={Boolean(pending)}>{pending === "invoice:create" ? t("creating") : t("createDraftAction")}</Button></form></Card></aside>
      <section><Card variant="elevated"><h2 className="text-2xl font-bold text-[#0F4C5C]">{t("invoiceLedger")}</h2>{invoices.loading ? <p className="enterprise-loading mt-5">{t("loadingInvoices")}</p> : invoices.data?.length ? <div className="mt-5 grid gap-5">{invoices.data.map((invoice) => <article key={invoice.id} className="rounded-2xl border p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold text-[#0F4C5C]">{t("invoice", { number: invoice.number })}</h3><p className="text-sm text-slate-500">{invoice.contract ? <Link href={`/contracts/${invoice.contract.id}`} className="text-[#009A44]">{invoice.contract.title}</Link> : t("standalone")} · {t("due", { date: date(invoice.dueAt) })}</p></div><div className="text-end"><Badge variant={invoice.status === "PAID" ? "success" : invoice.status === "OVERDUE" ? "danger" : "info"}>{statusLabel.has(invoice.status) ? statusLabel(invoice.status) : invoice.status.replaceAll("_", " ")}</Badge><p className="mt-2 font-bold text-[#009A44]">{money(invoice.totalMinor)}</p></div></div><div className="mt-4 flex flex-wrap gap-3">{invoice.canManage && invoice.status === "DRAFT" ? <Button size="sm" disabled={Boolean(pending)} onClick={() => void transition(invoice, "ISSUE")}>{t("issueInvoice")}</Button> : null}{invoice.canManage && ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status) ? <Button size="sm" disabled={Boolean(pending)} onClick={() => void charge(invoice)}>{pending === `${invoice.id}:charge` ? t("charging") : t("chargeOutstanding")}</Button> : null}{invoice.canManage && ["ISSUED", "PARTIALLY_PAID"].includes(invoice.status) && invoice.dueAt && new Date(invoice.dueAt) < new Date() ? <Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={() => void transition(invoice, "MARK_OVERDUE")}>{t("markOverdue")}</Button> : null}{invoice.canManage && ["DRAFT", "ISSUED", "OVERDUE"].includes(invoice.status) ? <Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={() => void transition(invoice, "VOID")}>{t("void")}</Button> : null}</div>{invoice.transactions.length ? <div className="mt-5 grid gap-3">{invoice.transactions.map((transaction) => <div key={transaction.id} className="rounded-xl bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-3"><div><strong>{statusLabel.has(transaction.type) ? statusLabel(transaction.type) : transaction.type}</strong><p className="text-xs text-slate-500">{transaction.providerRef ? t("providerReference", { reference: transaction.providerRef }) : t("awaitingProviderReference")}</p></div><div className="text-end"><Badge variant={transaction.status === "SUCCEEDED" ? "success" : "info"}>{statusLabel.has(transaction.status) ? statusLabel(transaction.status) : transaction.status}</Badge><p className="text-sm">{money(transaction.amountMinor)}</p></div></div>{invoice.canManage && transaction.type === "CHARGE" && transaction.status === "SUCCEEDED" ? <form className="enterprise-form mt-4" onSubmit={(event) => void refund(event, transaction)}><div className="grid gap-3 sm:grid-cols-2"><label>{t("refundAmountAed")}<input name="amount" type="number" min="0.01" max={Number(transaction.amountMinor) / 100} step="0.01" required /></label><label>{t("reason")}<input name="reason" minLength={3} required /></label></div><Button size="sm" variant="outline" disabled={Boolean(pending)}>{pending === `${transaction.id}:refund` ? t("submitting") : t("requestRefund")}</Button></form> : null}{transaction.refunds.map((item) => <p key={item.id} className="mt-2 text-sm">{t("refundLine", { amount: money(item.amountMinor), status: statusLabel.has(item.status) ? statusLabel(item.status) : item.status })}</p>)}</div>)}</div> : <p className="mt-4 text-sm text-slate-500">{t("noTransactions")}</p>}</article>)}</div> : <p className="enterprise-empty mt-5">{t("noInvoices")}</p>}</Card></section>
    </div>
  </main>;
}
