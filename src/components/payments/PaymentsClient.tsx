"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";

type Transaction = { id: string; type: string; status: string; amountMinor: string; currency: string; providerRef?: string | null; refunds: Array<{ id: string; status: string; amountMinor: string }> };
type Invoice = { id: string; number: string; status: string; version: number; canManage: boolean; totalMinor: string; subtotalMinor: string; taxMinor: string; currency: string; dueAt?: string | null; issuedAt?: string | null; paidAt?: string | null; contract?: { id: string; title: string; status: string } | null; lines: Array<{ id: string; description: string; quantity: number; totalMinor: string }>; paymentSchedules: Array<{ id: string; status: string; contractMilestone?: { id: string; title: string; status: string; amountMinor: string; currency: string } | null }>; transactions: Transaction[] };
type Contract = { id: string; title: string; status: string; currency: string; viewerParty: "CLIENT" | "PROVIDER"; milestones: Array<{ id: string; title: string; status: string; amountMinor: string; currency: string }> };

const money = (minor: string, currency: string) => new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(Number(minor) / 100);
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeZone: "Asia/Dubai" }).format(new Date(value)) : "Not set";

export default function PaymentsClient() {
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
    catch (reason) { setError(reason instanceof Error ? reason.message : "The finance request failed."); }
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
    }), "Draft invoice created.");
  }

  async function transition(invoice: Invoice, action: "ISSUE" | "MARK_OVERDUE" | "VOID") {
    if (action === "VOID" && !window.confirm("Void this invoice?")) return;
    await mutate(`${invoice.id}:${action}`, () => apiMutation(`/api/finance/invoices/${invoice.id}`, "PATCH", {
      action, expectedVersion: invoice.version,
      dueAt: action === "ISSUE" ? invoice.dueAt : undefined,
      reason: action === "VOID" ? "Voided by an authorized finance operator." : undefined,
    }), `Invoice ${action === "ISSUE" ? "issued" : action === "MARK_OVERDUE" ? "marked overdue" : "voided"}.`);
  }

  async function charge(invoice: Invoice) {
    if (!window.confirm(`Initiate a provider charge for ${money(invoice.totalMinor, invoice.currency)}?`)) return;
    await mutate(`${invoice.id}:charge`, () => apiMutation("/api/finance/charges", "POST", { invoiceId: invoice.id, idempotencyKey: crypto.randomUUID() }), "Charge submitted to the configured payment provider.");
  }

  async function refund(event: FormEvent<HTMLFormElement>, transaction: Transaction) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (!window.confirm("Submit this refund to the configured payment provider?")) return;
    await mutate(`${transaction.id}:refund`, () => apiMutation("/api/finance/refunds", "POST", {
      transactionId: transaction.id,
      amountMinor: String(Math.round(Number(data.get("amount")) * 100)),
      reason: data.get("reason"), idempotencyKey: crypto.randomUUID(),
    }), "Refund submitted to the configured payment provider.");
  }

  return <main className="py-16">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="font-bold uppercase tracking-widest text-[#009A44]">Governed settlement</p><h1 className="text-4xl font-bold text-[#0F4C5C]">Payments and invoices</h1><p className="mt-2 max-w-3xl text-slate-600">Issue invoices, reserve idempotent charges, track signed provider settlement and manage bounded refunds in AED.</p></div><button type="button" onClick={() => void invoices.refresh()} className="rounded-full border px-5 py-2 font-bold">Refresh</button></div>
    <Card variant="elevated" className="mb-6"><p className="text-sm text-slate-600"><strong>Provider boundary:</strong> charge and refund execution requires configured payment-provider credentials and a signed webhook secret. Dublancer never simulates a successful provider settlement.</p></Card>
    {invoices.error || contracts.error || error ? <p className="enterprise-error mb-6" role="alert">{invoices.error || contracts.error || error}</p> : null}
    {notice ? <p className="enterprise-notice mb-6" role="status">{notice}</p> : null}
    <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <aside><Card variant="elevated"><h2 className="text-xl font-bold text-[#0F4C5C]">Create draft invoice</h2><form className="enterprise-form mt-5" onSubmit={(event) => void createInvoice(event)}><label>Invoice number<input name="number" minLength={1} maxLength={100} defaultValue={`INV-${new Date().getFullYear()}-`} required /></label><label>Contract<select name="contractId" value={selectedContract} onChange={(event) => { setSelectedContract(event.target.value); setSelectedMilestone(""); }}><option value="">Standalone invoice</option>{clientContracts.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select></label>{selectedContract ? <label>Accepted milestone<select name="milestoneId" value={selectedMilestone} onChange={(event) => setSelectedMilestone(event.target.value)}><option value="">No milestone</option>{acceptedMilestones.map((item) => <option key={item.id} value={item.id}>{item.title} · {money(item.amountMinor, item.currency)}</option>)}</select></label> : null}<label>Description<textarea name="description" minLength={1} required /></label><label>Amount (AED)<input name="amount" type="number" min="0.01" step="0.01" disabled={Boolean(selectedMilestone)} required={!selectedMilestone} /></label><label>Due date<input name="dueAt" type="date" required /></label><Button disabled={Boolean(pending)}>{pending === "invoice:create" ? "Creating…" : "Create draft"}</Button></form></Card></aside>
      <section><Card variant="elevated"><h2 className="text-2xl font-bold text-[#0F4C5C]">Invoice ledger</h2>{invoices.loading ? <p className="enterprise-loading mt-5">Loading invoices…</p> : invoices.data?.length ? <div className="mt-5 grid gap-5">{invoices.data.map((invoice) => <article key={invoice.id} className="rounded-2xl border p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold text-[#0F4C5C]">Invoice {invoice.number}</h3><p className="text-sm text-slate-500">{invoice.contract ? <Link href={`/contracts/${invoice.contract.id}`} className="text-[#009A44]">{invoice.contract.title}</Link> : "Standalone"} · due {date(invoice.dueAt)}</p></div><div className="text-end"><Badge variant={invoice.status === "PAID" ? "success" : invoice.status === "OVERDUE" ? "danger" : "info"}>{invoice.status.replaceAll("_", " ")}</Badge><p className="mt-2 font-bold text-[#009A44]">{money(invoice.totalMinor, invoice.currency)}</p></div></div><div className="mt-4 flex flex-wrap gap-3">{invoice.canManage && invoice.status === "DRAFT" ? <Button size="sm" disabled={Boolean(pending)} onClick={() => void transition(invoice, "ISSUE")}>Issue invoice</Button> : null}{invoice.canManage && ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status) ? <Button size="sm" disabled={Boolean(pending)} onClick={() => void charge(invoice)}>{pending === `${invoice.id}:charge` ? "Charging…" : "Charge outstanding"}</Button> : null}{invoice.canManage && ["ISSUED", "PARTIALLY_PAID"].includes(invoice.status) && invoice.dueAt && new Date(invoice.dueAt) < new Date() ? <Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={() => void transition(invoice, "MARK_OVERDUE")}>Mark overdue</Button> : null}{invoice.canManage && ["DRAFT", "ISSUED", "OVERDUE"].includes(invoice.status) ? <Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={() => void transition(invoice, "VOID")}>Void</Button> : null}</div>{invoice.transactions.length ? <div className="mt-5 grid gap-3">{invoice.transactions.map((transaction) => <div key={transaction.id} className="rounded-xl bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-3"><div><strong>{transaction.type}</strong><p className="text-xs text-slate-500">{transaction.providerRef ? `Provider reference: ${transaction.providerRef}` : "Awaiting provider reference"}</p></div><div className="text-end"><Badge variant={transaction.status === "SUCCEEDED" ? "success" : "info"}>{transaction.status}</Badge><p className="text-sm">{money(transaction.amountMinor, transaction.currency)}</p></div></div>{invoice.canManage && transaction.type === "CHARGE" && transaction.status === "SUCCEEDED" ? <form className="enterprise-form mt-4" onSubmit={(event) => void refund(event, transaction)}><div className="grid gap-3 sm:grid-cols-2"><label>Refund amount (AED)<input name="amount" type="number" min="0.01" max={Number(transaction.amountMinor) / 100} step="0.01" required /></label><label>Reason<input name="reason" minLength={3} required /></label></div><Button size="sm" variant="outline" disabled={Boolean(pending)}>{pending === `${transaction.id}:refund` ? "Submitting…" : "Request refund"}</Button></form> : null}{transaction.refunds.map((item) => <p key={item.id} className="mt-2 text-sm">Refund {money(item.amountMinor, transaction.currency)} · {item.status}</p>)}</div>)}</div> : <p className="mt-4 text-sm text-slate-500">No payment transactions.</p>}</article>)}</div> : <p className="enterprise-empty mt-5">No invoices have been created.</p>}</Card></section>
    </div>
  </main>;
}
