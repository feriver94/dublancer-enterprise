"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";

type Overview = {
  definitions: number;
  runs: Record<string, number>;
  pendingApprovals: number;
  graphNodes: number;
  talentMatches: number;
};
type Definition = {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  status: string;
  activeVersion?: number | null;
  _count: { runs: number };
};
type Run = {
  id: string;
  status: string;
  correlationId: string;
  createdAt: string;
  definition: { id: string; key: string; name: string };
  steps: Array<{ id: string; stepKey: string; status: string }>;
  approvals: Array<{ id: string; decision: string; reason: string }>;
};

const normalizeKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "");

export default function OrchestrationClient({
  canManage,
  canRun,
  canApprove,
}: {
  canManage: boolean;
  canRun: boolean;
  canApprove: boolean;
}) {
  const t = useTranslations("Orchestration");
  const status = useTranslations("Status");
  const overview = useApiResource<Overview>("/api/orchestration/overview");
  const definitions = useApiResource<Definition[]>("/api/orchestration/definitions");
  const runs = useApiResource<Run[]>("/api/orchestration/runs");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const label = (value: string) =>
    status.has(value) ? status(value) : value.replaceAll("_", " ");

  async function mutate(key: string, operation: () => Promise<unknown>) {
    setBusy(key);
    setNotice("");
    setError("");
    try {
      await operation();
      await Promise.all([overview.refresh(), definitions.refresh(), runs.refresh()]);
      setNotice(t("operationComplete"));
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("operationFailed"));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function createDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "");
    if (
      await mutate("create", () =>
        apiMutation("/api/orchestration/definitions", "POST", {
          key: normalizeKey(String(data.get("key") || name)),
          name,
          description: String(data.get("description") || "") || undefined,
          concurrencyLimit: Number(data.get("concurrencyLimit") || 10),
          timeoutSeconds: Number(data.get("timeoutSeconds") || 3600),
          publish: false,
          graph: {
            nodes: [
              {
                key: "execute",
                name: t("defaultStep"),
                type: "BACKGROUND_JOB",
                maxAttempts: 3,
                config: {},
              },
            ],
            edges: [],
          },
        }),
      )
    ) {
      form.reset();
    }
  }

  const published = definitions.data?.filter((item) => item.status === "PUBLISHED") ?? [];
  const pageError = error || overview.error || definitions.error || runs.error;
  return (
    <main className="grid gap-6 py-16">
      <header>
        <Badge variant="success">{t("eyebrow")}</Badge>
        <h1 className="mt-4 text-4xl font-bold text-[#0F4C5C]">{t("title")}</h1>
        <p className="mt-3 max-w-3xl text-slate-600">{t("description")}</p>
      </header>

      {pageError ? <p className="enterprise-error" role="alert">{pageError}</p> : null}
      {notice ? <p className="enterprise-success" role="status">{notice}</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label={t("overview")}>
        {[
          [t("definitions"), overview.data?.definitions ?? 0],
          [t("activeRuns"), (overview.data?.runs.RUNNING ?? 0) + (overview.data?.runs.QUEUED ?? 0)],
          [t("pendingApprovals"), overview.data?.pendingApprovals ?? 0],
          [t("graphNodes"), overview.data?.graphNodes ?? 0],
          [t("talentMatches"), overview.data?.talentMatches ?? 0],
        ].map(([title, value]) => (
          <Card key={String(title)} variant="glass">
            <span className="text-sm text-slate-600">{title}</span>
            <strong className="mt-2 block text-2xl text-[#0F4C5C]">{value}</strong>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card variant="elevated">
          <h2 className="mb-4 text-2xl font-bold text-[#0F4C5C]">{t("definitions")}</h2>
          <div className="grid gap-3">
            {definitions.data?.map((definition) => (
              <article key={definition.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <strong>{definition.name}</strong>
                    <p className="text-sm text-slate-600">{definition.key} · {t("runCount", { count: definition._count.runs })}</p>
                  </div>
                  <Badge variant={definition.status === "PUBLISHED" ? "success" : "info"}>{label(definition.status)}</Badge>
                </div>
                {canManage && definition.status !== "PUBLISHED" ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(busy)}
                    onClick={() => void mutate(`publish:${definition.id}`, () => apiMutation(`/api/orchestration/definitions/${definition.id}/publish`, "POST", {}))}
                  >
                    {t("publish")}
                  </Button>
                ) : null}
              </article>
            ))}
            {!definitions.loading && !definitions.data?.length ? <p className="enterprise-empty">{t("noDefinitions")}</p> : null}
          </div>
          {canManage ? (
            <form className="enterprise-form mt-6" onSubmit={createDefinition}>
              <h3 className="text-lg font-bold">{t("newDefinition")}</h3>
              <label>{t("name")}<input name="name" minLength={3} required /></label>
              <label>{t("key")}<input name="key" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]*" /></label>
              <label>{t("descriptionLabel")}<textarea name="description" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>{t("concurrencyLimit")}<input name="concurrencyLimit" type="number" min="1" max="100" defaultValue="10" /></label>
                <label>{t("timeoutSeconds")}<input name="timeoutSeconds" type="number" min="30" max="86400" defaultValue="3600" /></label>
              </div>
              <Button disabled={Boolean(busy)}>{t("createDefinition")}</Button>
            </form>
          ) : null}
        </Card>

        <Card variant="elevated">
          <h2 className="mb-4 text-2xl font-bold text-[#0F4C5C]">{t("runs")}</h2>
          {canRun && published.length ? (
            <form
              className="enterprise-form mb-6"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                void mutate("run", () => apiMutation("/api/orchestration/runs", "POST", {
                  definitionId: data.get("definitionId"),
                  idempotencyKey: crypto.randomUUID(),
                  input: {},
                })).then((succeeded) => { if (succeeded) form.reset(); });
              }}
            >
              <label>
                {t("definition")}
                <select name="definitionId" required defaultValue="">
                  <option value="" disabled>{t("chooseDefinition")}</option>
                  {published.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
                </select>
              </label>
              <Button disabled={Boolean(busy)}>{t("startRun")}</Button>
            </form>
          ) : null}
          <div className="grid gap-3">
            {runs.data?.map((run) => {
              const pending = run.approvals.some((approval) => approval.decision === "PENDING");
              return (
                <article key={run.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <strong>{run.definition.name}</strong>
                      <p className="text-xs text-slate-600">{run.correlationId}</p>
                    </div>
                    <Badge variant={run.status === "COMPLETED" ? "success" : "info"}>{label(run.status)}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{t("stepProgress", { complete: run.steps.filter((step) => step.status === "COMPLETED").length, total: run.steps.length })}</p>
                  {pending && canApprove ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" disabled={Boolean(busy)} onClick={() => void mutate(`approve:${run.id}`, () => apiMutation(`/api/orchestration/runs/${run.id}/approval`, "POST", { decision: "APPROVED", comment: t("approvalComment") }))}>{t("approve")}</Button>
                      <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void mutate(`reject:${run.id}`, () => apiMutation(`/api/orchestration/runs/${run.id}/approval`, "POST", { decision: "REJECTED", comment: t("rejectionComment") }))}>{t("reject")}</Button>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!runs.loading && !runs.data?.length ? <p className="enterprise-empty">{t("noRuns")}</p> : null}
          </div>
        </Card>
      </section>
    </main>
  );
}
