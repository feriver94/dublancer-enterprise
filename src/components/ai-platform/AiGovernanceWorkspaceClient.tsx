"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiGet, apiGetWithMeta, apiMutation } from "@/lib/client/api-client";
import type { AppLocale } from "@/i18n/config";
import { formatAed, formatUaeDateTime } from "@/lib/locale/formatters";

type Config = {
  enabled: boolean;
  providerKey: string | null;
  defaultModel: string | null;
  dataUsagePolicy: string;
  humanApprovalRequired: boolean;
  monthlyTokenBudget: string | null;
  monthlyCostBudgetMinor: string | null;
  maxTokensPerRun: number;
  maxCostPerRunMinor: string | null;
  maxInputBytes: number;
  allowedUseCases: string[];
  allowedModels: string[];
  allowedProviderKeys: string[];
};
type Run = {
  id: string;
  useCase: string;
  status: string;
  model: string | null;
  createdAt: string;
  errorMessage: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costMinor: string | null;
  user: { displayName: string | null; email: string };
  prompt: { name: string; key?: string } | null;
  promptVersion: { version: number } | null;
};
type Approval = {
  id: string;
  status: string;
  reason: string;
  expiresAt: string;
  run: Run;
};
type PromptVersion = {
  id: string;
  version: number;
  systemTemplate: string;
  userTemplate: string;
  createdAt: string;
  createdBy: { displayName: string | null };
};
type Prompt = {
  id: string;
  key: string;
  name: string;
  useCase: string;
  activeVersion: number;
  organizationId: string | null;
  versions: PromptVersion[];
  _count: { runs: number };
};
type Budget = {
  usedTokens: number;
  reservedTokens: number;
  tokenRemaining: string | null;
  usedCostMinor: string;
  reservedCostMinor: string;
  costRemainingMinor: string | null;
  runCount: number;
};
type Usage = {
  daily: Array<{
    date: string;
    runs: number;
    inputTokens: number;
    outputTokens: number;
    costMinor: string;
  }>;
  budget: Budget;
};
type Provider = {
  provider: {
    key: string;
    status: string;
    configured: boolean;
    latencyMs: number;
    checkedAt: string;
    message?: string;
  };
  configuredModel: string | null;
  allowed: boolean;
};
type Audit = {
  id: string;
  action: string;
  createdAt: string;
  actor: { displayName: string | null; email: string } | null;
  run: { id: string; status: string; useCase: string } | null;
};
type Tab =
  "policy" | "prompts" | "approvals" | "runs" | "usage" | "providers" | "audit";

const field = "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const primary =
  "rounded-full bg-[#009A44] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const secondary =
  "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-[#0F4C5C] disabled:opacity-50";
const card = "rounded-3xl border border-slate-200 bg-white p-5";
function message(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
function tone(status: string) {
  return ["COMPLETED", "APPROVED", "healthy"].includes(status)
    ? "bg-emerald-50 text-emerald-700"
    : ["FAILED", "REJECTED", "degraded"].includes(status)
      ? "bg-red-50 text-red-700"
      : "bg-amber-50 text-amber-700";
}

export function AiGovernanceWorkspaceClient({
  canManage,
  canApprove,
  canAudit,
  initialTab = "policy",
}: {
  canManage: boolean;
  canApprove: boolean;
  canAudit: boolean;
  initialTab?: Tab;
}) {
  const t = useTranslations("AiGovernance");
  const common = useTranslations("Common");
  const statusLabel = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const time = (value?: string | null) =>
    value ? formatUaeDateTime(value, locale) : t("never");
  const money = (value?: string | null) =>
    formatAed(Number(value ?? 0) / 100, locale);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [config, setConfig] = useState<Config | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextConfig, nextPrompts, nextRuns, nextUsage, nextProvider] =
        await Promise.all([
          apiGet<Config | null>("/api/ai/config"),
          apiGet<Prompt[]>("/api/ai/prompts"),
          apiGetWithMeta<Run[]>("/api/ai/runs?take=100"),
          apiGet<Usage>("/api/ai/usage?days=30"),
          apiGet<Provider>("/api/ai/providers/status"),
        ]);
      setConfig(nextConfig);
      setPrompts(nextPrompts);
      setRuns(nextRuns.data);
      setUsage(nextUsage);
      setProvider(nextProvider);
      if (canApprove)
        setApprovals(
          (await apiGet<{ items: Approval[] }>("/api/ai/approvals?take=100"))
            .items,
        );
      if (canAudit)
        setAudit(
          (await apiGet<{ items: Audit[] }>("/api/ai/audit?take=100")).items,
        );
    } catch (reason) {
      setError(message(reason, t("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [canApprove, canAudit, t]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function mutate(
    key: string,
    work: () => Promise<unknown>,
    success: string,
  ) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
      await load();
    } catch (reason) {
      setError(message(reason, t("operationFailed")));
    } finally {
      setBusy("");
    }
  }

  async function saveConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const list = (key: string) =>
      String(form.get(key) ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    await mutate(
      "config",
      () =>
        apiMutation("/api/ai/config", "PUT", {
          enabled: form.get("enabled") === "on",
          providerKey: form.get("providerKey") || null,
          defaultModel: form.get("defaultModel") || null,
          dataUsagePolicy: form.get("dataUsagePolicy"),
          humanApprovalRequired: form.get("humanApprovalRequired") === "on",
          monthlyTokenBudget: form.get("monthlyTokenBudget") || null,
          monthlyCostBudgetMinor: form.get("monthlyCostBudgetMinor") || null,
          maxTokensPerRun: Number(form.get("maxTokensPerRun")),
          maxCostPerRunMinor: form.get("maxCostPerRunMinor") || null,
          maxInputBytes: Number(form.get("maxInputBytes")),
          allowedUseCases: list("allowedUseCases"),
          allowedModels: list("allowedModels"),
          allowedProviderKeys: list("allowedProviderKeys"),
          settings: {},
        }),
      t("configSaved"),
    );
  }

  async function createPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(
      "prompt",
      () =>
        apiMutation("/api/ai/prompts", "POST", {
          key: form.get("key"),
          name: form.get("name"),
          useCase: form.get("useCase"),
          systemTemplate: form.get("systemTemplate"),
          userTemplate: form.get("userTemplate"),
          variables: {},
          safetyPolicy: { tenantIsolation: true },
        }),
      t("promptCreated"),
    );
  }

  async function createVersion(
    event: React.FormEvent<HTMLFormElement>,
    promptId: string,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(
      `version:${promptId}`,
      () =>
        apiMutation(`/api/ai/prompts/${promptId}/versions`, "POST", {
          systemTemplate: form.get("systemTemplate"),
          userTemplate: form.get("userTemplate"),
          variables: {},
          safetyPolicy: { tenantIsolation: true },
          activate: form.get("activate") === "on",
        }),
      t("versionCreated"),
    );
  }

  async function createRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(String(form.get("input"))) as Record<string, unknown>;
    } catch {
      setError(t("invalidJson"));
      return;
    }
    await mutate(
      "run",
      () =>
        apiMutation("/api/ai/runs", "POST", {
          useCase: form.get("useCase"),
          promptKey: form.get("promptKey") || undefined,
          input,
          idempotencyKey: crypto.randomUUID(),
        }),
      t("runCreated"),
    );
  }

  const tabs: Array<[Tab, string, boolean]> = [
    ["policy", t("tab.policy"), true],
    ["prompts", t("tab.prompts"), true],
    ["approvals", t("tab.approvals"), canApprove],
    ["runs", t("tab.runs"), true],
    ["usage", t("tab.usage"), true],
    ["providers", t("tab.providers"), true],
    ["audit", t("tab.audit"), canAudit],
  ];
  return (
    <main className="py-12 lg:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-bold uppercase tracking-[.18em] text-[#009A44]">
            {t("eyebrow")}
          </p>
          <h1 className="text-4xl font-bold text-[#0F4C5C]">{t("title")}</h1>
          <p className="mt-2 max-w-3xl text-slate-600">{t("description")}</p>
        </div>
        <button
          className={secondary}
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? t("refreshing") : common("refresh")}
        </button>
      </header>
      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-xl bg-red-50 p-4 text-red-700"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-700"
        >
          {notice}
        </div>
      ) : null}
      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [t("aiPolicy"), config?.enabled ? t("enabled") : t("disabled")],
          [
            t("pendingApprovals"),
            approvals.filter((item) => item.status === "PENDING").length,
          ],
          [t("runs30"), usage?.budget.runCount ?? 0],
          [t("tokenCapacity"), usage?.budget.tokenRemaining ?? t("unlimited")],
          [
            t("provider"),
            provider?.provider.status
              ? statusLabel.has(provider.provider.status)
                ? statusLabel(provider.provider.status)
                : provider.provider.status
              : t("unknown"),
          ],
        ].map(([label, value]) => (
          <article key={label} className={card}>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-[#0F4C5C]">{value}</p>
          </article>
        ))}
      </section>
      <nav className="mt-7 flex gap-2 overflow-x-auto pb-2">
        {tabs
          .filter((item) => item[2])
          .map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${tab === key ? "bg-[#0F4C5C] text-white" : "border border-slate-300 bg-white text-[#0F4C5C]"}`}
            >
              {label}
            </button>
          ))}
      </nav>

      {tab === "policy" ? (
        <section className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <form
            onSubmit={(event) => void saveConfig(event)}
            className={`${card} grid gap-4`}
          >
            <h2 className="text-xl font-bold text-[#0F4C5C]">
              {t("policyEnforcement")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                [t("providerKey"), "providerKey", config?.providerKey ?? ""],
                [t("defaultModel"), "defaultModel", config?.defaultModel ?? ""],
                [
                  t("allowedUseCases"),
                  "allowedUseCases",
                  config?.allowedUseCases.join(", ") ?? "",
                ],
                [
                  t("allowedModels"),
                  "allowedModels",
                  config?.allowedModels.join(", ") ?? "",
                ],
                [
                  t("allowedProviders"),
                  "allowedProviderKeys",
                  config?.allowedProviderKeys.join(", ") ?? "",
                ],
              ].map(([label, name, value]) => (
                <label key={name} className="grid gap-1 text-sm font-bold">
                  {label}
                  <input
                    className={field}
                    name={String(name)}
                    defaultValue={value}
                  />
                </label>
              ))}
              <label className="grid gap-1 text-sm font-bold">
                {t("dataUsage")}
                <select
                  className={field}
                  name="dataUsagePolicy"
                  defaultValue={config?.dataUsagePolicy ?? "NO_TRAINING"}
                >
                  {["NO_TRAINING", "TENANT_ONLY", "STANDARD"].map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
                </select>
              </label>
              {[
                [
                  t("maxInputBytes"),
                  "maxInputBytes",
                  config?.maxInputBytes ?? 65536,
                ],
                [
                  t("tokensPerRun"),
                  "maxTokensPerRun",
                  config?.maxTokensPerRun ?? 4096,
                ],
                [
                  t("monthlyTokenBudget"),
                  "monthlyTokenBudget",
                  config?.monthlyTokenBudget ?? "",
                ],
                [
                  t("monthlyBudgetFils"),
                  "monthlyCostBudgetMinor",
                  config?.monthlyCostBudgetMinor ?? "",
                ],
                [
                  t("maxCostFils"),
                  "maxCostPerRunMinor",
                  config?.maxCostPerRunMinor ?? "",
                ],
              ].map(([label, name, value]) => (
                <label key={name} className="grid gap-1 text-sm font-bold">
                  {label}
                  <input
                    className={field}
                    type="number"
                    name={String(name)}
                    defaultValue={value}
                  />
                </label>
              ))}
            </div>
            <div className="flex gap-5">
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={config?.enabled ?? false}
                />{" "}
                {t("enabled")}
              </label>
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  name="humanApprovalRequired"
                  defaultChecked={config?.humanApprovalRequired ?? true}
                />{" "}
                {t("humanApproval")}
              </label>
            </div>
            {canManage ? (
              <button className={primary} disabled={busy === "config"}>
                {t("saveConfiguration")}
              </button>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-sm">
                {t("readOnly")}
              </p>
            )}
          </form>
          <aside className={`${card} h-fit`}>
            <h2 className="text-xl font-bold text-[#0F4C5C]">
              {t("budgetPosition")}
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              {[
                [t("usedTokens"), usage?.budget.usedTokens ?? 0],
                [t("reservedTokens"), usage?.budget.reservedTokens ?? 0],
                [
                  t("remainingTokens"),
                  usage?.budget.tokenRemaining ?? t("unlimited"),
                ],
                [t("usedCost"), money(usage?.budget.usedCostMinor)],
                [t("reservedCost"), money(usage?.budget.reservedCostMinor)],
                [
                  t("remainingCost"),
                  usage?.budget.costRemainingMinor == null
                    ? t("unlimited")
                    : money(usage.budget.costRemainingMinor),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-bold text-slate-500">{label}</dt>
                  <dd className="text-lg font-bold text-[#0F4C5C]">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </section>
      ) : null}

      {tab === "prompts" ? (
        <section className="mt-5 grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          {canManage ? (
            <form
              onSubmit={(event) => void createPrompt(event)}
              className={`${card} grid h-fit gap-3`}
            >
              <h2 className="text-xl font-bold text-[#0F4C5C]">
                {t("newPrompt")}
              </h2>
              <input
                className={field}
                name="key"
                placeholder="proposal.summary"
                aria-label={t("promptKey")}
                required
              />
              <input
                className={field}
                name="name"
                placeholder={t("promptName")}
                required
              />
              <input
                className={field}
                name="useCase"
                placeholder={t("useCase")}
                required
              />
              <textarea
                className={field}
                rows={4}
                name="systemTemplate"
                placeholder={t("systemTemplate")}
                required
              />
              <textarea
                className={field}
                rows={4}
                name="userTemplate"
                placeholder={t("userTemplate")}
                required
              />
              <button className={primary}>{t("createPrompt")}</button>
            </form>
          ) : (
            <aside className={card}>{t("promptPermission")}</aside>
          )}
          <div className="grid gap-4">
            {prompts.map((prompt) => (
              <article key={prompt.id} className={card}>
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#009A44]">
                      {prompt.key} · {prompt.useCase}
                    </p>
                    <h3 className="text-xl font-bold text-[#0F4C5C]">
                      {prompt.name}
                    </h3>
                  </div>
                  <span className="h-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    {t("activeVersion", { version: prompt.activeVersion })}
                  </span>
                </div>
                {prompt.versions.map((version) => (
                  <details
                    key={version.id}
                    className="mt-3 rounded-xl border border-slate-200 p-3"
                  >
                    <summary className="cursor-pointer font-bold">
                      {t("versionAt", {
                        version: version.version,
                        time: time(version.createdAt),
                      })}
                    </summary>
                    <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs text-white">
                      {version.systemTemplate}
                      {"\n\n"}
                      {version.userTemplate}
                    </pre>
                    {canManage && version.version !== prompt.activeVersion ? (
                      <button
                        className={`${secondary} mt-3`}
                        onClick={() =>
                          void mutate(
                            `activate:${version.id}`,
                            () =>
                              apiMutation(
                                `/api/ai/prompts/${prompt.id}/versions/${version.id}/activate`,
                                "POST",
                                {},
                              ),
                            t("versionActivated", { version: version.version }),
                          )
                        }
                      >
                        {t("activate")}
                      </button>
                    ) : null}
                  </details>
                ))}
                {canManage && prompt.organizationId ? (
                  <form
                    className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-4"
                    onSubmit={(event) => void createVersion(event, prompt.id)}
                  >
                    <strong>{t("newVersion")}</strong>
                    <textarea
                      className={field}
                      rows={3}
                      name="systemTemplate"
                      aria-label={t("systemTemplate")}
                      defaultValue={prompt.versions[0]?.systemTemplate}
                      required
                    />
                    <textarea
                      className={field}
                      rows={3}
                      name="userTemplate"
                      aria-label={t("userTemplate")}
                      defaultValue={prompt.versions[0]?.userTemplate}
                      required
                    />
                    <label className="text-sm">
                      <input type="checkbox" name="activate" />{" "}
                      {t("publishImmediately")}
                    </label>
                    <button className={secondary}>{t("createVersion")}</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "approvals" ? (
        <section className="mt-5 grid gap-3">
          {approvals.map((approval) => (
            <article key={approval.id} className={card}>
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${tone(approval.status)}`}
                  >
                    {statusLabel.has(approval.status)
                      ? statusLabel(approval.status)
                      : approval.status}
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-[#0F4C5C]">
                    {approval.run.useCase}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {approval.reason} ·{" "}
                    {t("expires", { time: time(approval.expiresAt) })}
                  </p>
                </div>
                {approval.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <button
                      className={primary}
                      onClick={() =>
                        void mutate(
                          `approve:${approval.run.id}`,
                          () =>
                            apiMutation(
                              `/api/ai/runs/${approval.run.id}/approval`,
                              "POST",
                              { decision: "APPROVED", note: t("approvalNote") },
                            ),
                          t("approvedQueued"),
                        )
                      }
                    >
                      {common("approve")}
                    </button>
                    <button
                      className={secondary}
                      onClick={() =>
                        void mutate(
                          `reject:${approval.run.id}`,
                          () =>
                            apiMutation(
                              `/api/ai/runs/${approval.run.id}/approval`,
                              "POST",
                              {
                                decision: "REJECTED",
                                note: t("rejectionNote"),
                              },
                            ),
                          t("rejectedReleased"),
                        )
                      }
                    >
                      {common("reject")}
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {!approvals.length ? (
            <p className="rounded-3xl border border-dashed p-10 text-center text-slate-500">
              {t("noApprovals")}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "runs" ? (
        <section className="mt-5 grid gap-5">
          <form
            onSubmit={(event) => void createRun(event)}
            className={`${card} grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto]`}
          >
            <input
              className={field}
              name="useCase"
              placeholder={t("useCase")}
              required
            />
            <input
              className={field}
              name="promptKey"
              placeholder={t("promptKeyOptional")}
            />
            <textarea
              className={field}
              rows={2}
              name="input"
              aria-label={t("runInput")}
              defaultValue={t("defaultRunInput")}
              required
            />
            <button className={primary}>{t("createRun")}</button>
          </form>
          <div className="overflow-x-auto rounded-3xl border bg-white">
            <table className="w-full min-w-[900px] text-start text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="p-4">{t("run")}</th>
                  <th>{common("status")}</th>
                  <th>{t("promptModel")}</th>
                  <th>{t("usage")}</th>
                  <th>{t("created")}</th>
                  <th>{common("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b">
                    <td className="p-4">
                      <strong>{run.useCase}</strong>
                      <br />
                      <span className="text-xs text-slate-500">
                        {run.user.displayName ?? run.user.email} ·{" "}
                        {run.id.slice(0, 10)}
                      </span>
                      {run.errorMessage ? (
                        <p className="text-xs text-red-600">
                          {run.errorMessage}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-bold ${tone(run.status)}`}
                      >
                        {statusLabel.has(run.status)
                          ? statusLabel(run.status)
                          : run.status}
                      </span>
                    </td>
                    <td>
                      {run.prompt?.name ?? t("policyDefault")}{" "}
                      {run.promptVersion ? `v${run.promptVersion.version}` : ""}
                      <br />
                      <span className="text-xs">
                        {run.model ?? t("noModel")}
                      </span>
                    </td>
                    <td>
                      {t("tokens", {
                        count: (run.inputTokens ?? 0) + (run.outputTokens ?? 0),
                      })}
                      <br />
                      {money(run.costMinor)}
                    </td>
                    <td>{time(run.createdAt)}</td>
                    <td>
                      <div className="flex gap-2">
                        {["PENDING_APPROVAL", "QUEUED", "RUNNING"].includes(
                          run.status,
                        ) ? (
                          <button
                            className={secondary}
                            onClick={() =>
                              void mutate(
                                `cancel:${run.id}`,
                                () =>
                                  apiMutation(
                                    `/api/ai/runs/${run.id}/cancel`,
                                    "POST",
                                    { reason: t("cancelReason") },
                                  ),
                                t("cancelledNotice"),
                              )
                            }
                          >
                            {common("cancel")}
                          </button>
                        ) : null}
                        {["FAILED", "CANCELLED"].includes(run.status) ? (
                          <button
                            className={secondary}
                            onClick={() =>
                              void mutate(
                                `retry:${run.id}`,
                                () =>
                                  apiMutation(
                                    `/api/ai/runs/${run.id}/retry`,
                                    "POST",
                                    { idempotencyKey: crypto.randomUUID() },
                                  ),
                                t("retryNotice"),
                              )
                            }
                          >
                            {t("retry")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "usage" ? (
        <section className={`${card} mt-5`}>
          <h2 className="text-xl font-bold text-[#0F4C5C]">
            {t("dubaiUsage")}
          </h2>
          <table className="mt-4 w-full text-start text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-500">
                <th className="py-3">{common("date")}</th>
                <th>{t("runs")}</th>
                <th>{t("input")}</th>
                <th>{t("output")}</th>
                <th>{t("cost")}</th>
              </tr>
            </thead>
            <tbody>
              {usage?.daily.map((day) => (
                <tr key={day.date} className="border-b">
                  <td className="py-3">{day.date}</td>
                  <td>{day.runs}</td>
                  <td>{day.inputTokens}</td>
                  <td>{day.outputTokens}</td>
                  <td>{money(day.costMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {tab === "providers" ? (
        <section className={`${card} mt-5 max-w-2xl`}>
          <div className="flex justify-between">
            <h2 className="text-xl font-bold text-[#0F4C5C]">
              {provider?.provider.key ?? t("aiProvider")}
            </h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${tone(provider?.provider.status ?? "unknown")}`}
            >
              {provider?.provider.status
                ? statusLabel.has(provider.provider.status)
                  ? statusLabel(provider.provider.status)
                  : provider.provider.status
                : t("unknown")}
            </span>
          </div>
          <dl className="mt-5 grid gap-3 text-sm">
            <div>
              <dt className="font-bold text-slate-500">{t("model")}</dt>
              <dd>{provider?.configuredModel ?? t("none")}</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">{t("latency")}</dt>
              <dd>
                {t("milliseconds", {
                  count: provider?.provider.latencyMs ?? 0,
                })}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">{t("checked")}</dt>
              <dd>{time(provider?.provider.checkedAt)}</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-500">{t("allowedPolicy")}</dt>
              <dd>{provider?.allowed ? t("yes") : t("no")}</dd>
            </div>
          </dl>
          {provider?.provider.message ? (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-amber-700">
              {provider.provider.message}
            </p>
          ) : null}
        </section>
      ) : null}
      {tab === "audit" ? (
        <section className="mt-5 grid gap-2">
          {audit.map((entry) => (
            <article
              key={entry.id}
              className="grid gap-2 rounded-2xl border bg-white p-4 md:grid-cols-[240px_1fr_260px]"
            >
              <strong>{entry.action}</strong>
              <span className="text-sm text-slate-600">
                {entry.run
                  ? `${entry.run.useCase} · ${statusLabel.has(entry.run.status) ? statusLabel(entry.run.status) : entry.run.status} · ${entry.run.id.slice(0, 10)}`
                  : t("configurationEvent")}
              </span>
              <span className="text-sm text-slate-500">
                {entry.actor?.displayName ?? entry.actor?.email ?? t("worker")}{" "}
                · {time(entry.createdAt)}
              </span>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
