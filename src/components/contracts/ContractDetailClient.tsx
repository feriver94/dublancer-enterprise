"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";

type Decision = { id: string; decision: string; note: string; decidedAt: string };
type Submission = { id: string; status: string; version: number; revision: number; note?: string | null; submittedAt?: string | null; submittedBy: { displayName: string }; decisions: Decision[] };
type Milestone = { id: string; title: string; description?: string | null; status: string; version: number; amountMinor: string; currency: string; dueAt?: string | null; submissions: Submission[] };
type Contract = {
  id: string; title: string; status: string; version: number; valueMinor: string; currency: string;
  taxRateBasisPoints: number; platformFeeBasisPoints: number; startsAt?: string | null; endsAt?: string | null;
  viewerParty: "CLIENT" | "PROVIDER"; termsHash: string; terms: unknown;
  project?: { id: string; title: string } | null; listing?: { id: string; title: string } | null;
  acceptances: Array<{ id: string; party: string; method: string; termsHash: string; acceptedAt: string; acceptedBy: { displayName: string } }>;
  milestones: Milestone[];
  amendments: Array<{ id: string; summary: string; status: string; version: number }>;
  disputes: Array<{ id: string; category: string; status: string; reason: string }>;
  invoices: Array<{ id: string; number: string; status: string; totalMinor: string; currency: string }>;
  transactions: Array<{ id: string; status: string; amountMinor: string; currency: string }>;
};

const allowed: Record<string, string[]> = {
  DRAFT: ["PENDING_SIGNATURES", "TERMINATED"],
  PENDING_SIGNATURES: ["TERMINATED"],
  ACTIVE: ["PAUSED", "COMPLETED", "TERMINATED", "DISPUTED"],
  PAUSED: ["ACTIVE", "TERMINATED", "DISPUTED"],
  DISPUTED: ["ACTIVE", "TERMINATED"],
};
const money = (minor: string, currency: string) => new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(Number(minor) / 100);

export default function ContractDetailClient({ contractId }: { contractId: string }) {
  const contract = useApiResource<Contract>(`/api/contracts/${contractId}`);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function mutate(label: string, operation: () => Promise<unknown>, success: string) {
    setPending(label); setError(""); setNotice("");
    try { await operation(); setNotice(success); await contract.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The contract action failed."); }
    finally { setPending(""); }
  }

  async function transition(status: string) {
    if (["TERMINATED", "COMPLETED"].includes(status) && !window.confirm(`Move this contract to ${status}?`)) return;
    await mutate(`status:${status}`, () => apiMutation(`/api/contracts/${contractId}`, "PATCH", { status, expectedVersion: contract.data?.version }), `Contract moved to ${status.replaceAll("_", " ")}.`);
  }

  async function accept() {
    const row = contract.data;
    if (!row || !window.confirm("Confirm that you have reviewed and accept the current contract terms?")) return;
    await mutate("accept", () => apiMutation(`/api/contracts/${contractId}/acceptances`, "POST", {
      expectedVersion: row.version,
      party: row.viewerParty,
      method: "CLICKWRAP",
      termsHash: row.termsHash,
    }), "Acceptance evidence recorded.");
  }

  async function createMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate("milestone:create", () => apiMutation(`/api/contracts/${contractId}/milestones`, "POST", {
      title: data.get("title"), description: data.get("description") || undefined,
      amountMinor: String(Math.round(Number(data.get("amount")) * 100)), currency: "AED",
      dueAt: data.get("dueAt") || undefined,
    }), "Milestone created.");
    form.reset();
  }

  async function submitMilestone(event: FormEvent<HTMLFormElement>, milestone: Milestone) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    await mutate(`submit:${milestone.id}`, () => apiMutation(`/api/contracts/${contractId}/milestones/${milestone.id}/submissions`, "POST", {
      note: data.get("note"), expectedMilestoneVersion: milestone.version,
    }), "Milestone submitted for client review.");
  }

  async function decideMilestone(event: FormEvent<HTMLFormElement>, milestone: Milestone, submission: Submission) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const decision = String(data.get("decision"));
    if (!window.confirm(`Record the immutable ${decision.replaceAll("_", " ")} decision?`)) return;
    await mutate(`decide:${submission.id}`, () => apiMutation(`/api/contracts/${contractId}/milestones/${milestone.id}/submissions`, "PATCH", {
      submissionId: submission.id, decision, note: data.get("note"),
      expectedMilestoneVersion: milestone.version, expectedSubmissionVersion: submission.version,
    }), "Immutable milestone decision recorded.");
  }

  if (contract.loading) return <p className="enterprise-loading py-24">Loading contract…</p>;
  if (!contract.data) return <main className="py-24"><p className="enterprise-error">{contract.error || "Contract not found."}</p><Link href="/contracts">Return to contracts</Link></main>;
  const row = contract.data;
  const accepted = row.acceptances.some((item) => item.party === row.viewerParty);

  return <main className="py-12">
    <Link href="/contracts" className="font-bold text-[#009A44]">← Contracts</Link>
    <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="grid gap-6">
        <Card variant="elevated">
          <div className="flex flex-wrap justify-between gap-4"><div><p className="font-bold text-[#009A44]">{row.project?.title ?? row.listing?.title ?? "Enterprise agreement"}</p><h1 className="mt-2 text-4xl font-bold text-[#0F4C5C]">{row.title}</h1><p className="mt-2 text-sm text-slate-500">You are acting as the {row.viewerParty.toLowerCase()}.</p></div><Badge variant={row.status === "ACTIVE" ? "success" : "info"}>{row.status.replaceAll("_", " ")}</Badge></div>
          <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4"><Metric label="Value" value={money(row.valueMinor, row.currency)} /><Metric label="Tax" value={`${row.taxRateBasisPoints / 100}%`} /><Metric label="Platform fee" value={`${row.platformFeeBasisPoints / 100}%`} /><Metric label="Milestones" value={String(row.milestones.length)} /></dl>
        </Card>
        <Card variant="elevated">
          <h2 className="text-xl font-bold text-[#0F4C5C]">Signature evidence</h2>
          <p className="mt-2 break-all text-xs text-slate-500">Terms SHA-256: {row.termsHash}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{["CLIENT", "PROVIDER"].map((party) => { const evidence = row.acceptances.find((item) => item.party === party); return <div key={party} className="rounded-xl border p-4"><strong>{party}</strong>{evidence ? <p className="mt-1 text-sm text-slate-600">Accepted by {evidence.acceptedBy.displayName}<br />{new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(new Date(evidence.acceptedAt))}<br />{evidence.method.replaceAll("_", " ")}</p> : <p className="mt-1 text-sm text-slate-500">Awaiting acceptance</p>}</div> })}</div>
          {row.status === "PENDING_SIGNATURES" && !accepted ? <Button className="mt-5" disabled={Boolean(pending)} onClick={() => void accept()}>{pending === "accept" ? "Recording acceptance…" : `Accept as ${row.viewerParty.toLowerCase()}`}</Button> : null}
        </Card>
        <Milestones contract={row} pending={pending} onCreate={createMilestone} onSubmit={submitMilestone} onDecide={decideMilestone} />
        <RecordSection title="Amendments" empty="No amendments." rows={row.amendments.map((item) => ({ id: item.id, title: `Version ${item.version}: ${item.summary}`, detail: item.status }))} />
        <RecordSection title="Disputes" empty="No disputes." rows={row.disputes.map((item) => ({ id: item.id, title: item.category, detail: `${item.status} · ${item.reason}` }))} />
        <RecordSection title="Invoices and transactions" empty="No financial records." rows={[...row.invoices.map((item) => ({ id: item.id, title: `Invoice ${item.number}`, detail: `${item.status} · ${money(item.totalMinor, item.currency)}` })), ...row.transactions.map((item) => ({ id: item.id, title: "Transaction", detail: `${item.status} · ${money(item.amountMinor, item.currency)}` }))]} />
      </section>
      <aside><Card variant="elevated"><h2 className="text-xl font-bold text-[#0F4C5C]">Contract lifecycle</h2><p className="mt-2 text-sm text-slate-600">Activation requires both parties to accept the exact contract terms.</p>{error ? <p className="enterprise-error mt-4" role="alert">{error}</p> : null}{notice ? <p className="enterprise-notice mt-4" role="status">{notice}</p> : null}<div className="mt-5 grid gap-3">{(allowed[row.status] ?? []).filter((status) => row.viewerParty === "CLIENT" || !["PENDING_SIGNATURES", "COMPLETED", "TERMINATED"].includes(status)).map((status) => <Button key={status} type="button" variant={status === "ACTIVE" || status === "COMPLETED" ? "primary" : "outline"} disabled={Boolean(pending)} onClick={() => void transition(status)}>{pending === `status:${status}` ? "Updating…" : status.replaceAll("_", " ")}</Button>)}{!(allowed[row.status] ?? []).length ? <p className="enterprise-empty">No further transitions are currently available.</p> : null}</div></Card></aside>
    </div>
  </main>;
}

function Milestones({ contract, pending, onCreate, onSubmit, onDecide }: { contract: Contract; pending: string; onCreate: (event: FormEvent<HTMLFormElement>) => void; onSubmit: (event: FormEvent<HTMLFormElement>, milestone: Milestone) => void; onDecide: (event: FormEvent<HTMLFormElement>, milestone: Milestone, submission: Submission) => void }) {
  return <Card variant="elevated"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold uppercase tracking-widest text-[#009A44]">Execution evidence</p><h2 className="text-xl font-bold text-[#0F4C5C]">Milestones and submissions</h2></div><Badge variant="info">{contract.viewerParty}</Badge></div>
    {contract.viewerParty === "CLIENT" && ["PENDING_SIGNATURES", "ACTIVE"].includes(contract.status) ? <form className="enterprise-form mt-5 rounded-xl bg-slate-50 p-4" onSubmit={onCreate}><h3 className="font-bold">Create milestone</h3><label>Title<input name="title" minLength={2} required /></label><label>Description<textarea name="description" /></label><div className="grid gap-3 sm:grid-cols-2"><label>Amount (AED)<input name="amount" type="number" min="0" step="0.01" required /></label><label>Due date<input name="dueAt" type="date" /></label></div><Button disabled={Boolean(pending)}>{pending === "milestone:create" ? "Creating…" : "Create milestone"}</Button></form> : null}
    <div className="mt-5 grid gap-4">{contract.milestones.length ? contract.milestones.map((milestone) => { const active = milestone.submissions.find((item) => ["SUBMITTED", "IN_REVIEW"].includes(item.status)); return <article key={milestone.id} className="rounded-2xl border p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold text-[#0F4C5C]">{milestone.title}</h3><p className="text-sm text-slate-500">{money(milestone.amountMinor, milestone.currency)}{milestone.dueAt ? ` · due ${new Intl.DateTimeFormat("en-AE", { dateStyle: "medium" }).format(new Date(milestone.dueAt))}` : ""}</p></div><Badge variant={milestone.status === "ACCEPTED" || milestone.status === "RELEASED" ? "success" : "info"}>{milestone.status.replaceAll("_", " ")}</Badge></div>{milestone.description ? <p className="mt-3 text-sm text-slate-700">{milestone.description}</p> : null}
      {contract.viewerParty === "PROVIDER" && contract.status === "ACTIVE" && ["PLANNED", "FUNDED", "IN_PROGRESS", "REVISION_REQUESTED"].includes(milestone.status) && !active ? <form className="enterprise-form mt-4" onSubmit={(event) => onSubmit(event, milestone)}><label>Submission note<textarea name="note" minLength={3} required placeholder="Describe the completed work and supporting evidence." /></label><Button disabled={Boolean(pending)}>{pending === `submit:${milestone.id}` ? "Submitting…" : "Submit milestone"}</Button></form> : null}
      {milestone.submissions.length ? <div className="mt-4 grid gap-3">{milestone.submissions.map((submission) => <div key={submission.id} className="rounded-xl bg-slate-50 p-4"><div className="flex justify-between gap-3"><strong>Revision {submission.revision} · {submission.submittedBy.displayName}</strong><Badge variant={submission.status === "ACCEPTED" ? "success" : "info"}>{submission.status}</Badge></div>{submission.note ? <p className="mt-2 text-sm text-slate-700">{submission.note}</p> : null}{submission.decisions.map((decision) => <p key={decision.id} className="mt-2 border-s-4 border-[#009A44] ps-3 text-sm"><strong>{decision.decision.replaceAll("_", " ")}</strong> · {decision.note}</p>)}{contract.viewerParty === "CLIENT" && active?.id === submission.id ? <form className="enterprise-form mt-4" onSubmit={(event) => onDecide(event, milestone, submission)}><label>Decision<select name="decision" defaultValue="APPROVED"><option value="APPROVED">Approve</option><option value="REVISION_REQUESTED">Request revision</option><option value="REJECTED">Reject</option></select></label><label>Decision note<textarea name="note" minLength={3} required /></label><Button disabled={Boolean(pending)}>{pending === `decide:${submission.id}` ? "Recording…" : "Record immutable decision"}</Button></form> : null}</div>)}</div> : null}</article> }) : <p className="enterprise-empty">No milestones.</p>}</div>
  </Card>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-sm text-slate-500">{label}</dt><dd className="font-bold text-[#0F4C5C]">{value}</dd></div>; }
function RecordSection({ title, rows, empty }: { title: string; rows: Array<{ id: string; title: string; detail: string }>; empty: string }) { return <Card variant="elevated"><h2 className="mb-4 text-xl font-bold text-[#0F4C5C]">{title}</h2>{rows.length ? <div className="grid gap-3">{rows.map((row) => <article key={row.id} className="rounded-xl border p-3"><strong>{row.title}</strong><p className="text-sm text-slate-500">{row.detail}</p></article>)}</div> : <p className="enterprise-empty">{empty}</p>}</Card>; }
