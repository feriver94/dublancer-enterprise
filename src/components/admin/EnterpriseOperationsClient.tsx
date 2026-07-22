"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiGet, apiMutation } from "@/lib/client/api-client";
import type { AppLocale } from "@/i18n/config";
import { formatUaeDateTime } from "@/lib/locale/formatters";

type Capabilities = {
  manageJobs: boolean;
  manageSecurity: boolean;
  manageModeration: boolean;
  manageSupport: boolean;
  manageRetention: boolean;
  exportData: boolean;
};
type Summary = {
  readiness: {
    status: string;
    database: { status: string; latencyMs: number };
    realtime: { status: string };
    checkedAt: string;
  };
  queues: { byStatus: Record<string, number>; deadLetters: number };
  operations: {
    activeWorkers: number;
    schedules: number;
    openModeration: number;
    openSupport: number;
    unresolvedHighSecurity: number;
    exports: Record<string, number>;
  };
  providers: Record<
    string,
    { configured?: boolean; status?: string; key?: string; latencyMs?: number }
  >;
  capabilities: Capabilities;
};
type Attempt = {
  id: string;
  attemptNumber: number;
  workerId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};
type Job = {
  id: string;
  type: string;
  queue: string;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  createdAt: string;
  lockedBy: string | null;
  leaseExpiresAt: string | null;
  lastError: string | null;
  failureCode: string | null;
  attemptHistory: Attempt[];
  deadLetter: {
    reason: string;
    failedAt: string;
    recoveryCount: number;
    resolvedAt: string | null;
  } | null;
};
type Worker = {
  workerId: string;
  queues: string[];
  version: string | null;
  hostname: string | null;
  observedStatus: string;
  currentJobId: string | null;
  startedAt: string;
  lastSeenAt: string;
};
type Schedule = {
  id: string;
  key: string;
  jobType: string;
  queue: string;
  intervalSeconds: number;
  enabled: boolean;
  nextRunAt: string;
  lastEnqueuedAt: string | null;
};
type ExportJob = {
  id: string;
  type: string;
  status: string;
  rowCount: number | null;
  checksumSha256: string | null;
  createdAt: string;
  expiresAt: string | null;
  errorMessage: string | null;
  artifact: { byteSize: number } | null;
};
type Moderation = {
  id: string;
  category: string;
  detail: string;
  resourceType: string;
  resourceId: string;
  status: string;
  resolution: string | null;
  updatedAt: string;
};
type Support = {
  id: string;
  number: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  resolution: string | null;
  requester: { displayName: string | null; email: string };
  updatedAt: string;
};
type Security = {
  id: string;
  type: string;
  severity: string;
  resolvedAt: string | null;
  createdAt: string;
  metadata: unknown;
  user: { displayName: string | null; email: string } | null;
};
type Retention = {
  id: string;
  resourceType: string;
  retentionDays: number;
  legalHoldDefault: boolean;
  updatedAt: string;
};
type Tab =
  | "overview"
  | "jobs"
  | "workers"
  | "exports"
  | "moderation"
  | "support"
  | "security"
  | "retention";

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
  return [
    "COMPLETED",
    "RESOLVED",
    "CLOSED",
    "healthy",
    "ready",
    "ACTIVE",
  ].includes(status)
    ? "bg-emerald-50 text-emerald-700"
    : ["FAILED", "DEAD_LETTER", "CRITICAL", "HIGH", "unhealthy"].includes(
          status,
        )
      ? "bg-red-50 text-red-700"
      : "bg-amber-50 text-amber-700";
}

export function EnterpriseOperationsClient({
  capabilities,
  initialTab = "overview",
}: {
  capabilities: Capabilities;
  initialTab?: Tab;
}) {
  const t = useTranslations("Operations");
  const common = useTranslations("Common");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const time = (value?: string | null) =>
    value ? formatUaeDateTime(value, locale) : t("never");
  const statusText = (value: string) =>
    status.has(value) ? status(value) : value;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exports, setExports] = useState<ExportJob[]>([]);
  const [moderation, setModeration] = useState<Moderation[]>([]);
  const [support, setSupport] = useState<Support[]>([]);
  const [security, setSecurity] = useState<Security[]>([]);
  const [retention, setRetention] = useState<Retention[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextSummary, nextJobs, nextWorkers, nextSchedules] =
        await Promise.all([
          apiGet<Summary>("/api/operations/summary"),
          apiGet<{ items: Job[] }>("/api/operations/jobs?take=100"),
          apiGet<Worker[]>("/api/operations/workers"),
          apiGet<Schedule[]>("/api/operations/schedules"),
        ]);
      setSummary(nextSummary);
      setJobs(nextJobs.items);
      setWorkers(nextWorkers);
      setSchedules(nextSchedules);
      if (capabilities.exportData)
        setExports(
          (
            await apiGet<{ items: ExportJob[] }>(
              "/api/admin/data-exports?take=100",
            )
          ).items,
        );
      if (capabilities.manageModeration)
        setModeration(await apiGet<Moderation[]>("/api/admin/moderation"));
      if (capabilities.manageSupport)
        setSupport(await apiGet<Support[]>("/api/admin/support-cases"));
      if (capabilities.manageSecurity)
        setSecurity(await apiGet<Security[]>("/api/admin/security-events"));
      if (capabilities.manageRetention)
        setRetention(await apiGet<Retention[]>("/api/compliance/retention"));
    } catch (reason) {
      setError(message(reason, t("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [capabilities, t]);
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
      setError(message(reason, t("commandFailed")));
    } finally {
      setBusy("");
    }
  }

  async function createSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(
      "schedule",
      () =>
        apiMutation("/api/operations/schedules", "POST", {
          key: form.get("key"),
          jobType: form.get("jobType"),
          queue: "operations",
          payload: {},
          intervalSeconds: Number(form.get("intervalSeconds")),
          priority: 100,
          maxAttempts: 10,
          enabled: true,
          nextRunAt: new Date().toISOString(),
        }),
      t("scheduleCreated"),
    );
  }
  async function requestExport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(
      "export",
      () =>
        apiMutation("/api/admin/data-exports", "POST", {
          type: form.get("type"),
          filters: {},
        }),
      t("exportQueued"),
    );
  }
  async function createSupport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(
      "support-create",
      () =>
        apiMutation("/api/admin/support-cases", "POST", {
          subject: form.get("subject"),
          description: form.get("description"),
          priority: form.get("priority"),
        }),
      t("supportCreated"),
    );
  }
  async function saveRetention(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(
      "retention",
      () =>
        apiMutation("/api/compliance/retention", "PUT", {
          resourceType: form.get("resourceType"),
          retentionDays: Number(form.get("retentionDays")),
          legalHoldDefault: form.get("legalHoldDefault") === "on",
          configuration: {},
        }),
      t("retentionSaved"),
    );
  }

  const visibleTabs: Array<[Tab, string, boolean]> = [
    ["overview", t("tab.overview"), true],
    ["jobs", t("tab.jobs"), true],
    ["workers", t("tab.workers"), true],
    ["exports", t("tab.exports"), capabilities.exportData],
    ["moderation", t("tab.moderation"), capabilities.manageModeration],
    ["support", t("tab.support"), capabilities.manageSupport],
    ["security", t("tab.security"), capabilities.manageSecurity],
    ["retention", t("tab.retention"), capabilities.manageRetention],
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
      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          [
            t("readiness"),
            summary?.readiness.status
              ? statusText(summary.readiness.status)
              : t("unknown"),
          ],
          [t("activeWorkers"), summary?.operations.activeWorkers ?? 0],
          [t("pendingJobs"), summary?.queues.byStatus.PENDING ?? 0],
          [t("deadLetters"), summary?.queues.deadLetters ?? 0],
          [t("openSupport"), summary?.operations.openSupport ?? 0],
          [t("highSecurity"), summary?.operations.unresolvedHighSecurity ?? 0],
        ].map(([label, value]) => (
          <article key={label} className={card}>
            <p className="text-xs font-bold uppercase text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-[#0F4C5C]">{value}</p>
          </article>
        ))}
      </section>
      <nav
        aria-label={t("sections")}
        className="mt-7 flex gap-2 overflow-x-auto pb-2"
      >
        {visibleTabs
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

      {tab === "overview" ? (
        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <article className={card}>
            <h2 className="text-xl font-bold text-[#0F4C5C]">
              {t("runtimeHealth")}
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              {[
                [
                  t("database"),
                  t("latencyValue", {
                    status: statusText(
                      summary?.readiness.database.status ?? "unknown",
                    ),
                    count: summary?.readiness.database.latencyMs ?? 0,
                  }),
                ],
                [
                  t("realtime"),
                  statusText(summary?.readiness.realtime.status ?? "unknown"),
                ],
                [t("checked"), time(summary?.readiness.checkedAt)],
                [t("recurringSchedules"), summary?.operations.schedules ?? 0],
                [t("openModeration"), summary?.operations.openModeration ?? 0],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-4 border-b py-2"
                >
                  <dt className="font-bold text-slate-500">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </article>
          <article className={card}>
            <h2 className="text-xl font-bold text-[#0F4C5C]">
              {t("providerStatus")}
            </h2>
            <div className="mt-4 grid gap-3">
              {Object.entries(summary?.providers ?? {}).map(
                ([name, provider]) => {
                  const value =
                    provider.status ??
                    (provider.configured ? "configured" : "not_configured");
                  return (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded-xl bg-slate-50 p-3"
                    >
                      <strong className="capitalize">{name}</strong>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${tone(value)}`}
                      >
                        {status.has(value)
                          ? status(value)
                          : value === "configured"
                            ? t("configured")
                            : value === "not_configured"
                              ? t("notConfigured")
                              : value}
                      </span>
                    </div>
                  );
                },
              )}
            </div>
          </article>
        </section>
      ) : null}

      {tab === "jobs" ? (
        <section className="mt-5 grid gap-3">
          {jobs.map((job) => (
            <article key={job.id} className={card}>
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${tone(job.status)}`}
                  >
                    {statusText(job.status)}
                  </span>
                  <h3 className="mt-2 text-lg font-bold text-[#0F4C5C]">
                    {job.type}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {t("jobMeta", {
                      queue: job.queue,
                      attempts: job.attempts,
                      maxAttempts: job.maxAttempts,
                      id: job.id.slice(0, 12),
                      created: time(job.createdAt),
                    })}
                  </p>
                  {job.lastError ? (
                    <p className="mt-2 max-w-3xl text-sm text-red-600">
                      {job.failureCode}: {job.lastError}
                    </p>
                  ) : null}
                </div>
                {capabilities.manageJobs ? (
                  <div className="flex h-fit gap-2">
                    {["PENDING", "PROCESSING"].includes(job.status) ? (
                      <button
                        className={secondary}
                        onClick={() =>
                          void mutate(
                            `cancel:${job.id}`,
                            () =>
                              apiMutation(
                                `/api/operations/jobs/${job.id}/cancel`,
                                "POST",
                                { reason: t("jobCancelReason") },
                              ),
                            t("jobCancelled"),
                          )
                        }
                      >
                        {common("cancel")}
                      </button>
                    ) : null}
                    {["FAILED", "CANCELLED"].includes(job.status) ? (
                      <button
                        className={secondary}
                        onClick={() =>
                          void mutate(
                            `retry:${job.id}`,
                            () =>
                              apiMutation(
                                `/api/operations/jobs/${job.id}/retry`,
                                "POST",
                                { reason: t("jobRetryReason") },
                              ),
                            t("jobRequeued"),
                          )
                        }
                      >
                        {t("retry")}
                      </button>
                    ) : null}
                    {job.status === "DEAD_LETTER" ? (
                      <button
                        className={primary}
                        onClick={() =>
                          void mutate(
                            `recover:${job.id}`,
                            () =>
                              apiMutation(
                                `/api/operations/jobs/${job.id}/recover`,
                                "POST",
                                { reason: t("jobRecoverReason") },
                              ),
                            t("jobRecovered"),
                          )
                        }
                      >
                        {t("recover")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold">
                  {t("attemptHistory", { count: job.attemptHistory.length })}
                </summary>
                <div className="mt-2 grid gap-2">
                  {job.attemptHistory.map((attempt) => (
                    <div
                      key={attempt.id}
                      className="rounded-xl bg-slate-50 p-3 text-sm"
                    >
                      <strong>
                        #{attempt.attemptNumber} · {statusText(attempt.status)}
                      </strong>{" "}
                      · {attempt.workerId} · {time(attempt.startedAt)}
                      {attempt.errorMessage ? (
                        <p className="text-red-600">
                          {attempt.errorCode}: {attempt.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            </article>
          ))}
          {!jobs.length ? (
            <p className="rounded-3xl border border-dashed p-10 text-center text-slate-500">
              {t("noJobs")}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "workers" ? (
        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-3">
            {workers.map((worker) => (
              <article key={worker.workerId} className={card}>
                <div className="flex justify-between">
                  <div>
                    <h3 className="font-bold text-[#0F4C5C]">
                      {worker.workerId}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {worker.hostname ?? t("unknownHost")} ·{" "}
                      {worker.version ?? t("unknownVersion")}
                    </p>
                  </div>
                  <span
                    className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${tone(worker.observedStatus)}`}
                  >
                    {statusText(worker.observedStatus)}
                  </span>
                </div>
                <p className="mt-3 text-sm">
                  {t("workerMeta", {
                    queues: worker.queues.join(", ") || t("none"),
                    lastSeen: time(worker.lastSeenAt),
                    job: worker.currentJobId?.slice(0, 12) ?? t("idle"),
                  })}
                </p>
              </article>
            ))}
            <h2 className="mt-3 text-xl font-bold text-[#0F4C5C]">
              {t("schedules")}
            </h2>
            {schedules.map((schedule) => (
              <article key={schedule.id} className={card}>
                <strong>{schedule.jobType}</strong>
                <p className="text-sm text-slate-500">
                  {t("scheduleMeta", {
                    key: schedule.key,
                    seconds: schedule.intervalSeconds,
                    next: time(schedule.nextRunAt),
                  })}
                </p>
                {capabilities.manageJobs ? (
                  <button
                    className={`${secondary} mt-3`}
                    onClick={() =>
                      void mutate(
                        `schedule:${schedule.id}`,
                        () =>
                          apiMutation(
                            `/api/operations/schedules/${schedule.id}`,
                            "PATCH",
                            { enabled: !schedule.enabled },
                          ),
                        schedule.enabled
                          ? t("schedulePaused")
                          : t("scheduleEnabled"),
                      )
                    }
                  >
                    {schedule.enabled ? t("pause") : t("enable")}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
          {capabilities.manageJobs ? (
            <form
              onSubmit={(event) => void createSchedule(event)}
              className={`${card} grid h-fit gap-3`}
            >
              <h2 className="text-xl font-bold text-[#0F4C5C]">
                {t("newSchedule")}
              </h2>
              <input
                className={field}
                name="key"
                placeholder={t("scheduleKeyPlaceholder")}
                aria-label={t("scheduleKey")}
                required
              />
              <select
                className={field}
                name="jobType"
                aria-label={t("jobType")}
              >
                {["RETENTION_ENFORCE", "SEARCH_INCREMENTAL", "NOTIFICATION_DELIVERY"].map((value) => <option key={value} value={value}>{statusText(value)}</option>)}
              </select>
              <input
                className={field}
                type="number"
                min="60"
                name="intervalSeconds"
                defaultValue="86400"
                aria-label={t("intervalSeconds")}
                required
              />
              <button className={primary} disabled={busy === "schedule"}>
                {t("createSchedule")}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {tab === "exports" ? (
        <section className="mt-5 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <form
            onSubmit={(event) => void requestExport(event)}
            className={`${card} grid h-fit gap-3`}
          >
            <h2 className="text-xl font-bold text-[#0F4C5C]">
              {t("requestExport")}
            </h2>
            <select className={field} name="type" aria-label={t("exportType")}>
              {["ORGANIZATION", "PROJECT", "FINANCE", "AUDIT"].map((value) => <option key={value} value={value}>{statusText(value)}</option>)}
            </select>
            <button className={primary} disabled={busy === "export"}>
              {t("queueExport")}
            </button>
          </form>
          <div className="grid gap-3">
            {exports.map((item) => (
              <article key={item.id} className={card}>
                <div className="flex justify-between">
                  <div>
                    <strong>{item.type}</strong>
                    <p className="text-sm text-slate-500">
                      {t("exportMeta", {
                        records: item.rowCount ?? 0,
                        bytes: item.artifact?.byteSize ?? 0,
                        created: time(item.createdAt),
                      })}
                    </p>
                    {item.errorMessage ? (
                      <p className="text-sm text-red-600">
                        {item.errorMessage}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${tone(item.status)}`}
                  >
                    {statusText(item.status)}
                  </span>
                </div>
                {item.status === "COMPLETED" ? (
                  <a
                    className={`${secondary} mt-3 inline-block`}
                    href={`/api/admin/data-exports/${item.id}/download`}
                  >
                    {t("downloadVerified")}
                  </a>
                ) : null}
              </article>
            ))}
            {!exports.length ? (
              <p className="rounded-3xl border border-dashed p-10 text-center text-slate-500">
                {t("noExports")}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "moderation" ? (
        <section className="mt-5 grid gap-3">
          {moderation.map((item) => (
            <article key={item.id} className={card}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <strong>
                    {item.category} · {item.resourceType}
                  </strong>
                  <p className="text-sm text-slate-600">{item.detail}</p>
                  <p className="text-xs text-slate-500">
                    {item.resourceId} · {time(item.updatedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className={secondary}
                    onClick={() =>
                      void mutate(
                        `investigate:${item.id}`,
                        () =>
                          apiMutation("/api/admin/moderation", "PATCH", {
                            reportId: item.id,
                            status: "INVESTIGATING",
                            resolution: t("investigationReason"),
                          }),
                        t("investigationStarted"),
                      )
                    }
                  >
                    {t("investigate")}
                  </button>
                  <button
                    className={primary}
                    onClick={() =>
                      void mutate(
                        `action:${item.id}`,
                        () =>
                          apiMutation("/api/admin/moderation", "PATCH", {
                            reportId: item.id,
                            status: "ACTIONED",
                            resolution: t("moderationReason"),
                          }),
                        t("moderationRecorded"),
                      )
                    }
                  >
                    {t("action")}
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!moderation.length ? (
            <p className="rounded-3xl border border-dashed p-10 text-center text-slate-500">
              {t("noModeration")}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "support" ? (
        <section className="mt-5 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <form
            onSubmit={(event) => void createSupport(event)}
            className={`${card} grid h-fit gap-3`}
          >
            <h2 className="text-xl font-bold text-[#0F4C5C]">
              {t("createCase")}
            </h2>
            <input
              className={field}
              name="subject"
              placeholder={t("subject")}
              required
            />
            <textarea
              className={field}
              name="description"
              rows={4}
              placeholder={t("describeIssue")}
              required
            />
            <select
              className={field}
              name="priority"
              aria-label={t("priority")}
            >
              <option value="NORMAL">{t("normal")}</option>
              <option value="HIGH">{statusText("HIGH")}</option>
              <option value="URGENT">{statusText("URGENT")}</option>
              <option value="LOW">{statusText("LOW")}</option>
            </select>
            <button className={primary} disabled={busy === "support-create"}>
              {t("createSupport")}
            </button>
          </form>
          <div className="grid gap-3">
            {support.map((item) => (
              <article key={item.id} className={card}>
                <div className="flex justify-between">
                  <div>
                    <strong>
                      {item.number} · {item.subject}
                    </strong>
                    <p className="text-sm text-slate-600">{item.description}</p>
                    <p className="text-xs text-slate-500">
                      {item.requester.displayName ?? item.requester.email} ·{" "}
                      {time(item.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${tone(item.status)}`}
                  >
                    {statusText(item.priority)} · {statusText(item.status)}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    className={secondary}
                    onClick={() =>
                      void mutate(
                        `support:${item.id}`,
                        () =>
                          apiMutation(
                            `/api/admin/support-cases/${item.id}`,
                            "PATCH",
                            { status: "IN_PROGRESS" },
                          ),
                        t("supportAccepted"),
                      )
                    }
                  >
                    {t("accept")}
                  </button>
                  <button
                    className={primary}
                    onClick={() =>
                      void mutate(
                        `resolve:${item.id}`,
                        () =>
                          apiMutation(
                            `/api/admin/support-cases/${item.id}`,
                            "PATCH",
                            {
                              status: "RESOLVED",
                              resolution: t("supportResolution"),
                            },
                          ),
                        t("supportResolved"),
                      )
                    }
                  >
                    {t("resolve")}
                  </button>
                </div>
              </article>
            ))}
            {!support.length ? (
              <p className="rounded-3xl border border-dashed p-10 text-center text-slate-500">
                {t("noSupport")}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "security" ? (
        <section className="mt-5 grid gap-3">
          {security.map((item) => (
            <article key={item.id} className={card}>
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${tone(item.severity)}`}
                  >
                    {statusText(item.severity)}
                  </span>
                  <h3 className="mt-2 font-bold text-[#0F4C5C]">{item.type}</h3>
                  <p className="text-sm text-slate-500">
                    {item.user?.displayName ?? item.user?.email ?? t("system")}{" "}
                    · {time(item.createdAt)}
                  </p>
                </div>
                <button
                  className={secondary}
                  onClick={() =>
                    void mutate(
                      `security:${item.id}`,
                      () =>
                        apiMutation(
                          `/api/admin/security-events/${item.id}`,
                          "PATCH",
                          {
                            resolved: !item.resolvedAt,
                            note: item.resolvedAt
                              ? t("securityReopenReason")
                              : t("securityResolveReason"),
                          },
                        ),
                      item.resolvedAt
                        ? t("securityReopened")
                        : t("securityResolved"),
                    )
                  }
                >
                  {item.resolvedAt ? t("reopen") : t("resolve")}
                </button>
              </div>
            </article>
          ))}
          {!security.length ? (
            <p className="rounded-3xl border border-dashed p-10 text-center text-slate-500">
              {t("noSecurity")}
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "retention" ? (
        <section className="mt-5 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <form
            onSubmit={(event) => void saveRetention(event)}
            className={`${card} grid h-fit gap-3`}
          >
            <h2 className="text-xl font-bold text-[#0F4C5C]">
              {t("retentionPolicy")}
            </h2>
            <input
              className={field}
              name="resourceType"
              placeholder="DATA_EXPORT"
              aria-label={t("resourceType")}
              required
            />
            <input
              className={field}
              type="number"
              min="1"
              max="36500"
              name="retentionDays"
              defaultValue="30"
              aria-label={t("retentionDays")}
              required
            />
            <label className="text-sm font-bold">
              <input type="checkbox" name="legalHoldDefault" />{" "}
              {t("legalHoldDefault")}
            </label>
            <button className={primary} disabled={busy === "retention"}>
              {t("savePolicy")}
            </button>
          </form>
          <div className="grid gap-3">
            {retention.map((item) => (
              <article key={item.id} className={card}>
                <div className="flex justify-between">
                  <div>
                    <strong>{item.resourceType}</strong>
                    <p className="text-sm text-slate-500">
                      {t("retentionMeta", {
                        days: item.retentionDays,
                        updated: time(item.updatedAt),
                      })}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${item.legalHoldDefault ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                  >
                    {item.legalHoldDefault
                      ? t("legalHoldDefaultBadge")
                      : t("standardRetention")}
                  </span>
                </div>
              </article>
            ))}
            {!retention.length ? (
              <p className="rounded-3xl border border-dashed p-10 text-center text-slate-500">
                {t("noRetention")}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
