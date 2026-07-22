"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, Card } from "@/components/ui";
import type { AppLocale } from "@/i18n/config";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import { formatUaeDate, formatUaeDateTime } from "@/lib/locale/formatters";

type User = { id: string; displayName: string };
type Task = { id: string; title: string };
type Versioned = { id: string; status: string; version: number };
type Delivery = {
  role: string;
  timeEntries: Array<{
    id: string;
    startedAt: string;
    durationMinutes?: number | null;
    description?: string | null;
    user: User;
    task?: Task | null;
  }>;
  timesheets: Array<
    Versioned & {
      periodStart: string;
      periodEnd: string;
      totalMinutes: number;
      user: User;
      decisionNote?: string | null;
    }
  >;
  deliverables: Array<
    Versioned & { title: string; dueAt?: string | null; createdBy: User }
  >;
  dependencies: Array<{
    id: string;
    dependencyType: string;
    predecessorTask: Task;
    successorTask: Task;
  }>;
  issues: Array<
    Versioned & { title: string; severity: string; resolution?: string | null }
  >;
  risks: Array<
    Versioned & {
      title: string;
      severity: string;
      probability: number;
      impact: number;
      mitigation?: string | null;
    }
  >;
  changeRequests: Array<
    Versioned & {
      title: string;
      requestedBy: User;
      decisionNote?: string | null;
    }
  >;
  resourceAllocations: Array<{
    id: string;
    version: number;
    user: User;
    allocationPercent: number;
    roleLabel?: string | null;
    startsAt: string;
    endsAt?: string | null;
  }>;
  templates: Array<{
    id: string;
    version: number;
    name: string;
    isActive: boolean;
    createdBy: User;
  }>;
  health: {
    current: {
      score: number;
      grade: string;
      signals: Record<string, number>;
      calculatedAt: string;
    };
    latestSnapshot?: { score: number; createdAt: string } | null;
  };
};

export default function AdvancedDeliveryClient({
  projectId,
  tasks,
  members,
}: {
  projectId: string;
  tasks: Task[];
  members: User[];
}) {
  const t = useTranslations("Workspace");
  const common = useTranslations("Common");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const delivery = useApiResource<Delivery>(
    `/api/projects/${projectId}/delivery`,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const label = (value: string) =>
    status.has(value) ? status(value) : value.replaceAll("_", " ");

  async function mutate(key: string, method: "POST" | "PATCH", body: unknown) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await apiMutation(`/api/projects/${projectId}/delivery`, method, body);
      setNotice(t("operationComplete"));
      await delivery.refresh();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("operationFailed"));
      return false;
    } finally {
      setBusy("");
    }
  }
  async function submit(
    event: FormEvent<HTMLFormElement>,
    key: string,
    body: (data: FormData) => unknown,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await mutate(key, "POST", body(new FormData(form)))) form.reset();
  }
  const action = (
    type: string,
    id: string,
    expectedVersion: number,
    value: Record<string, unknown>,
  ) =>
    mutate(`${type}:${id}`, "PATCH", { type, id, expectedVersion, ...value });

  if (delivery.loading)
    return <p className="enterprise-loading">{t("loading")}</p>;
  if (!delivery.data)
    return (
      <p className="enterprise-error" role="alert">
        {delivery.error || t("operationFailed")}
      </p>
    );
  const data = delivery.data;

  return (
    <section className="mt-8" aria-labelledby="advanced-delivery-heading">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-bold uppercase tracking-widest text-[#009A44]">
            {t("deliveryTitle")}
          </p>
          <h2
            id="advanced-delivery-heading"
            className="text-3xl font-bold text-[#0F4C5C]"
          >
            {t("deliveryTitle")}
          </h2>
          <p className="mt-2 max-w-3xl text-slate-600">
            {t("deliveryDescription")}
          </p>
        </div>
        <Button variant="outline" onClick={() => void delivery.refresh()}>
          {common("refresh")}
        </Button>
      </div>
      {error ? (
        <p className="enterprise-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="enterprise-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card variant="elevated">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold">{t("health")}</h3>
              <p className="text-sm text-slate-500">
                {formatUaeDateTime(data.health.current.calculatedAt, locale)}
              </p>
            </div>
            <Badge
              variant={
                data.health.current.score >= 85
                  ? "success"
                  : data.health.current.score >= 65
                    ? "info"
                    : "danger"
              }
            >
              {label(data.health.current.grade)}
            </Badge>
          </div>
          <p className="mt-5 text-4xl font-bold text-[#0F4C5C]">
            {data.health.current.score}/100
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {Object.entries(data.health.current.signals).map(([key, value]) => (
              <p key={key}>
                <span className="text-slate-500">
                  {key.replaceAll(/([A-Z])/g, " $1")}
                </span>{" "}
                <strong>{value}</strong>
              </p>
            ))}
          </div>
          <Button
            className="mt-5"
            disabled={busy === "health"}
            onClick={() => void mutate("health", "POST", { type: "health" })}
          >
            {t("refreshHealth")}
          </Button>
        </Card>

        <Card variant="elevated">
          <h3 className="text-xl font-bold">{t("timeEntries")}</h3>
          <form
            className="enterprise-form mt-4"
            onSubmit={(event) =>
              void submit(event, "time", (form) => ({
                type: "timeEntry",
                taskId: form.get("taskId") || undefined,
                startedAt: form.get("startedAt"),
                durationMinutes: Number(form.get("durationMinutes")),
                description: form.get("description") || undefined,
                billable: true,
              }))
            }
          >
            <label>
              {t("startedAt")}
              <input name="startedAt" type="datetime-local" required />
            </label>
            <label>
              {t("durationMinutes")}
              <input
                name="durationMinutes"
                type="number"
                min="1"
                max="1440"
                required
              />
            </label>
            <label>
              {t("tasks")}
              <select name="taskId" defaultValue="">
                <option value="">—</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {common("description")}
              <textarea name="description" />
            </label>
            <Button>{t("recordTime")}</Button>
          </form>
          <Items empty={common("noRecords")}>
            {data.timeEntries.slice(0, 8).map((item) => (
              <Item
                key={item.id}
                title={`${item.user.displayName} · ${t("minutes", { count: item.durationMinutes ?? 0 })}`}
                detail={`${formatUaeDateTime(item.startedAt, locale)}${item.task ? ` · ${item.task.title}` : ""}`}
              />
            ))}
          </Items>
        </Card>

        <Card variant="elevated">
          <h3 className="text-xl font-bold">{t("timesheets")}</h3>
          <form
            className="enterprise-form mt-4"
            onSubmit={(event) =>
              void submit(event, "timesheet", (form) => ({
                type: "timesheet",
                periodStart: form.get("periodStart"),
                periodEnd: form.get("periodEnd"),
              }))
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                {t("periodStart")}
                <input name="periodStart" type="date" required />
              </label>
              <label>
                {t("periodEnd")}
                <input name="periodEnd" type="date" required />
              </label>
            </div>
            <Button>{t("createTimesheet")}</Button>
          </form>
          <Items empty={common("noRecords")}>
            {data.timesheets.map((item) => (
              <Item
                key={item.id}
                title={`${item.user.displayName} · ${t("minutes", { count: item.totalMinutes })}`}
                detail={`${label(item.status)} · ${formatUaeDate(item.periodStart, locale)} — ${formatUaeDate(item.periodEnd, locale)}`}
                actions={
                  <div className="flex flex-wrap gap-2">
                    {["DRAFT", "REJECTED"].includes(item.status) ? (
                      <Small
                        onClick={() =>
                          void action("timesheet", item.id, item.version, {
                            action: "SUBMIT",
                          })
                        }
                      >
                        {t("submitTimesheet")}
                      </Small>
                    ) : null}
                    {item.status === "SUBMITTED" ? (
                      <>
                        <Small
                          onClick={() =>
                            void action("timesheet", item.id, item.version, {
                              action: "APPROVE",
                              note: common("approve"),
                            })
                          }
                        >
                          {t("approveTimesheet")}
                        </Small>
                        <Small
                          onClick={() =>
                            void action("timesheet", item.id, item.version, {
                              action: "REJECT",
                              note: common("reject"),
                            })
                          }
                        >
                          {t("rejectTimesheet")}
                        </Small>
                      </>
                    ) : null}
                    {item.status === "APPROVED" ? (
                      <Small
                        onClick={() =>
                          void action("timesheet", item.id, item.version, {
                            action: "LOCK",
                          })
                        }
                      >
                        {t("lockTimesheet")}
                      </Small>
                    ) : null}
                  </div>
                }
              />
            ))}
          </Items>
        </Card>

        <Card variant="elevated">
          <h3 className="text-xl font-bold">{t("deliverables")}</h3>
          <form
            className="enterprise-form mt-4"
            onSubmit={(event) =>
              void submit(event, "deliverable", (form) => ({
                type: "deliverable",
                title: form.get("title"),
                description: form.get("description") || undefined,
                taskId: form.get("taskId") || undefined,
                dueAt: form.get("dueAt") || undefined,
              }))
            }
          >
            <label>
              {common("title")}
              <input name="title" minLength={3} required />
            </label>
            <label>
              {common("description")}
              <textarea name="description" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                {t("tasks")}
                <select name="taskId" defaultValue="">
                  <option value="">—</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("dueDate")}
                <input name="dueAt" type="date" />
              </label>
            </div>
            <Button>{t("addDeliverable")}</Button>
          </form>
          <Items empty={common("noRecords")}>
            {data.deliverables.map((item) => (
              <Item
                key={item.id}
                title={item.title}
                detail={`${label(item.status)} · ${item.createdBy.displayName}`}
                actions={
                  <select
                    aria-label={t("transition")}
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value)
                        void action("deliverable", item.id, item.version, {
                          action: event.target.value,
                          note:
                            event.target.value === "REJECT" ||
                            event.target.value === "REQUEST_REVISION"
                              ? label(event.target.value)
                              : undefined,
                        });
                      event.target.value = "";
                    }}
                  >
                    <option value="">{t("transition")}</option>
                    {deliverableActions(item.status).map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                }
              />
            ))}
          </Items>
        </Card>

        <Card variant="elevated">
          <h3 className="text-xl font-bold">{t("dependencies")}</h3>
          <form
            className="enterprise-form mt-4"
            onSubmit={(event) =>
              void submit(event, "dependency", (form) => ({
                type: "dependency",
                predecessorTaskId: form.get("predecessor"),
                successorTaskId: form.get("successor"),
                dependencyType: form.get("dependencyType"),
                lagMinutes: 0,
              }))
            }
          >
            <label>
              {t("predecessorTask")}
              <select name="predecessor" required>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("successorTask")}
              <select name="successor" required>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("dependencyType")}
              <select name="dependencyType">
                {["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH"].map((value) => <option key={value} value={value}>{label(value)}</option>)}
              </select>
            </label>
            <Button>{t("addDependency")}</Button>
          </form>
          <Items empty={common("noRecords")}>
            {data.dependencies.map((item) => (
              <Item
                key={item.id}
                title={`${item.predecessorTask.title} → ${item.successorTask.title}`}
                detail={label(item.dependencyType)}
              />
            ))}
          </Items>
        </Card>

        <LifecycleCard
          title={t("issues")}
          addLabel={t("addIssue")}
          fields={
            <>
              <label>
                {common("title")}
                <input name="title" minLength={3} required />
              </label>
              <label>
                {common("description")}
                <textarea name="description" />
              </label>
              <Severity />
            </>
          }
          onSubmit={(event) =>
            void submit(event, "issue", (form) => ({
              type: "issue",
              title: form.get("title"),
              description: form.get("description") || undefined,
              severity: form.get("severity"),
            }))
          }
        >
          {data.issues.map((item) => (
            <Item
              key={item.id}
              title={item.title}
              detail={`${label(item.severity)} · ${label(item.status)}`}
              actions={
                <select
                  aria-label={t("transition")}
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value)
                      void action("issue", item.id, item.version, {
                        status: event.target.value,
                        resolution: ["RESOLVED", "CLOSED"].includes(
                          event.target.value,
                        )
                          ? label(event.target.value)
                          : undefined,
                      });
                    event.target.value = "";
                  }}
                >
                  <option value="">{t("transition")}</option>
                  {["IN_PROGRESS", "BLOCKED", "RESOLVED", "CLOSED"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              }
            />
          ))}
        </LifecycleCard>

        <LifecycleCard
          title={t("risks")}
          addLabel={t("addRisk")}
          fields={
            <>
              <label>
                {common("title")}
                <input name="title" minLength={3} required />
              </label>
              <Severity />
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  {t("probability")}
                  <input
                    name="probability"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="50"
                  />
                </label>
                <label>
                  {t("impact")}
                  <input
                    name="impact"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="50"
                  />
                </label>
              </div>
              <label>
                {t("mitigation")}
                <textarea name="mitigation" />
              </label>
            </>
          }
          onSubmit={(event) =>
            void submit(event, "risk", (form) => ({
              type: "risk",
              title: form.get("title"),
              severity: form.get("severity"),
              probability: Number(form.get("probability")),
              impact: Number(form.get("impact")),
              mitigation: form.get("mitigation") || undefined,
            }))
          }
        >
          {data.risks.map((item) => (
            <Item
              key={item.id}
              title={item.title}
              detail={`${label(item.severity)} · ${label(item.status)} · ${item.probability}%/${item.impact}%`}
              actions={
                <select
                  aria-label={t("transition")}
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value)
                      void action("risk", item.id, item.version, {
                        status: event.target.value,
                        mitigation: item.mitigation,
                      });
                    event.target.value = "";
                  }}
                >
                  <option value="">{t("transition")}</option>
                  {["MITIGATING", "ACCEPTED", "CLOSED"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              }
            />
          ))}
        </LifecycleCard>

        <LifecycleCard
          title={t("changeRequests")}
          addLabel={t("addChangeRequest")}
          fields={
            <>
              <label>
                {common("title")}
                <input name="title" minLength={3} required />
              </label>
              <label>
                {common("description")}
                <textarea name="description" minLength={5} required />
              </label>
            </>
          }
          onSubmit={(event) =>
            void submit(event, "change", (form) => ({
              type: "changeRequest",
              title: form.get("title"),
              description: form.get("description"),
              submit: true,
            }))
          }
        >
          {data.changeRequests.map((item) => (
            <Item
              key={item.id}
              title={item.title}
              detail={`${label(item.status)} · ${item.requestedBy.displayName}`}
              actions={
                <select
                  aria-label={t("transition")}
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value)
                      void action("changeRequest", item.id, item.version, {
                        action: event.target.value,
                        note: ["APPROVE", "REJECT"].includes(event.target.value)
                          ? label(event.target.value)
                          : undefined,
                      });
                    event.target.value = "";
                  }}
                >
                  <option value="">{t("transition")}</option>
                  {changeActions(item.status).map((value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              }
            />
          ))}
        </LifecycleCard>

        <Card variant="elevated">
          <h3 className="text-xl font-bold">{t("resourceAllocations")}</h3>
          <form
            className="enterprise-form mt-4"
            onSubmit={(event) =>
              void submit(event, "allocation", (form) => ({
                type: "resourceAllocation",
                userId: form.get("userId"),
                allocationPercent: Number(form.get("allocationPercent")),
                startsAt: form.get("startsAt"),
                endsAt: form.get("endsAt") || undefined,
                roleLabel: form.get("roleLabel") || undefined,
              }))
            }
          >
            <label>
              {t("members")}
              <select name="userId" required>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("allocationPercent")}
              <input
                name="allocationPercent"
                type="number"
                min="1"
                max="100"
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                {t("periodStart")}
                <input name="startsAt" type="date" required />
              </label>
              <label>
                {t("periodEnd")}
                <input name="endsAt" type="date" />
              </label>
            </div>
            <label>
              {t("roleLabel")}
              <input name="roleLabel" />
            </label>
            <Button>{t("allocate")}</Button>
          </form>
          <Items empty={common("noRecords")}>
            {data.resourceAllocations.map((item) => (
              <Item
                key={item.id}
                title={`${item.user.displayName} · ${item.allocationPercent}%`}
                detail={`${item.roleLabel ?? ""} · ${formatUaeDate(item.startsAt, locale)}`}
              />
            ))}
          </Items>
        </Card>

        <Card variant="elevated">
          <h3 className="text-xl font-bold">{t("templates")}</h3>
          <form
            className="enterprise-form mt-4"
            onSubmit={(event) =>
              void submit(event, "template", (form) => ({
                type: "template",
                name: form.get("name"),
                description: form.get("description") || undefined,
                publish: form.get("publish") === "on",
              }))
            }
          >
            <label>
              {t("templateName")}
              <input name="name" minLength={3} required />
            </label>
            <label>
              {common("description")}
              <textarea name="description" />
            </label>
            <label className="flex-row">
              <input name="publish" type="checkbox" />
              {t("publish")}
            </label>
            <Button>{t("createTemplate")}</Button>
          </form>
          <Items empty={common("noRecords")}>
            {data.templates.map((item) => (
              <Item
                key={item.id}
                title={item.name}
                detail={`${item.createdBy.displayName} · ${item.isActive ? t("publish") : label("DRAFT")}`}
                actions={
                  <div className="flex gap-2">
                    {item.isActive ? (
                      <>
                        <Small
                          onClick={() =>
                            void action("template", item.id, item.version, {
                              action: "APPLY",
                            })
                          }
                        >
                          {t("applyTemplate")}
                        </Small>
                        <Small
                          onClick={() =>
                            void action("template", item.id, item.version, {
                              action: "ARCHIVE",
                            })
                          }
                        >
                          {t("archiveTemplate")}
                        </Small>
                      </>
                    ) : (
                      <Small
                        onClick={() =>
                          void action("template", item.id, item.version, {
                            action: "PUBLISH",
                          })
                        }
                      >
                        {t("publish")}
                      </Small>
                    )}
                  </div>
                }
              />
            ))}
          </Items>
          <Button
            className="mt-5"
            variant="outline"
            onClick={() =>
              void mutate("complete", "PATCH", { type: "completeProject" })
            }
          >
            {t("completeProject")}
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            {t("completionBlocked")}
          </p>
        </Card>
      </div>
    </section>
  );
}

function deliverableActions(status: string) {
  return (
    (
      {
        DRAFT: ["SUBMIT"],
        SUBMITTED: ["START_REVIEW", "REQUEST_REVISION", "ACCEPT", "REJECT"],
        IN_REVIEW: ["REQUEST_REVISION", "ACCEPT", "REJECT"],
        REVISION_REQUESTED: ["SUBMIT"],
      } as Record<string, string[]>
    )[status] ?? []
  );
}
function changeActions(status: string) {
  return (
    (
      {
        DRAFT: ["SUBMIT", "CANCEL"],
        SUBMITTED: ["START_REVIEW", "APPROVE", "REJECT", "CANCEL"],
        UNDER_REVIEW: ["APPROVE", "REJECT", "CANCEL"],
        APPROVED: ["IMPLEMENT", "CANCEL"],
      } as Record<string, string[]>
    )[status] ?? []
  );
}
function Severity() {
  const t = useTranslations("Workspace");
  const status = useTranslations("Status");
  return (
    <label>
      {t("severity")}
      <select name="severity" defaultValue="MEDIUM">
        <option value="LOW">{status("LOW")}</option>
        <option value="MEDIUM">{status("MEDIUM")}</option>
        <option value="HIGH">{status("HIGH")}</option>
        <option value="CRITICAL">{status("CRITICAL")}</option>
      </select>
    </label>
  );
}
function LifecycleCard({
  title,
  addLabel,
  fields,
  onSubmit,
  children,
}: {
  title: string;
  addLabel: string;
  fields: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <Card variant="elevated">
      <h3 className="text-xl font-bold">{title}</h3>
      <form className="enterprise-form mt-4" onSubmit={onSubmit}>
        {fields}
        <Button>{addLabel}</Button>
      </form>
      <Items empty="—">{children}</Items>
    </Card>
  );
}
function Items({ children, empty }: { children: ReactNode; empty: string }) {
  const array = Array.isArray(children) ? children : [children];
  return (
    <div className="mt-4 grid gap-2">
      {array.length ? children : <p className="enterprise-empty">{empty}</p>}
    </div>
  );
}
function Item({
  title,
  detail,
  actions,
}: {
  title: string;
  detail: string;
  actions?: ReactNode;
}) {
  return (
    <article className="rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>{title}</strong>
          <p className="text-sm text-slate-500">{detail}</p>
        </div>
        {actions}
      </div>
    </article>
  );
}
function Small({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-lg border px-2 py-1 text-xs font-bold"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
