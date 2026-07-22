"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, Card } from "@/components/ui";
import type { AppLocale } from "@/i18n/config";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import {
  formatAed,
  formatUaeDate,
  formatUaeDateTime,
} from "@/lib/locale/formatters";
import AdvancedDeliveryClient from "./AdvancedDeliveryClient";

type ProjectSummary = {
  id: string;
  ownerId: string;
  title: string;
  slug: string;
  description?: string | null;
  status: string;
  budgetMinor?: string | null;
  currency: string;
  updatedAt: string;
};
type User = { id: string; displayName: string; email?: string };
type Milestone = {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
};
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee?: User | null;
};
type Project = ProjectSummary & {
  milestones: Milestone[];
  tasks: Task[];
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: User;
  }>;
  memberships: Array<{ id: string; role: string; user: User }>;
  attachments: Array<{ id: string; filename: string; uploadedBy: User }>;
  activities: Array<{
    id: string;
    summary: string;
    type: string;
    createdAt: string;
  }>;
};
type FileNode = { id: string; name: string; type: string };

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export default function WorkspaceClient({ projectId }: { projectId?: string }) {
  return projectId ? (
    <ProjectWorkspace projectId={projectId} />
  ) : (
    <ProjectDirectory />
  );
}

function ProjectDirectory() {
  const t = useTranslations("Workspace");
  const common = useTranslations("Common");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const projects = useApiResource<ProjectSummary[]>("/api/projects?take=100");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const label = (value: string) =>
    status.has(value) ? status(value) : value.replaceAll("_", " ");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const title = String(data.get("title") ?? "");
      await apiMutation("/api/projects", "POST", {
        title,
        slug: slugify(String(data.get("slug") || title)),
        description: String(data.get("description") || "") || undefined,
        budgetMinor: data.get("budget")
          ? String(Math.round(Number(data.get("budget")) * 100))
          : undefined,
        currency: "AED",
      });
      form.reset();
      await projects.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("operationFailed"));
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-bold uppercase tracking-widest text-[#009A44]">
            {t("eyebrow")}
          </p>
          <h1 className="text-4xl font-bold text-[#0F4C5C]">
            {t("directoryTitle")}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void projects.refresh()}
          className="rounded-full border px-5 py-2 font-bold"
        >
          {common("refresh")}
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card variant="elevated">
          <h2 className="mb-5 text-2xl font-bold">{t("projects")}</h2>
          {projects.error ? (
            <p className="enterprise-error">{projects.error}</p>
          ) : null}
          {projects.loading ? (
            <p className="enterprise-loading">{t("loading")}</p>
          ) : projects.data?.length ? (
            <div className="grid gap-3">
              {projects.data.map((project) => (
                <Link
                  key={project.id}
                  href={`/workspace/project/${project.id}`}
                  className="rounded-2xl border p-5 hover:border-[#009A44]"
                >
                  <div className="flex justify-between gap-3">
                    <h3 className="font-bold text-[#0F4C5C]">
                      {project.title}
                    </h3>
                    <Badge
                      variant={
                        project.status === "COMPLETED" ? "success" : "info"
                      }
                    >
                      {label(project.status)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-slate-600">
                    {project.description || t("noDescription")}
                  </p>
                  <p className="mt-3 font-bold text-[#009A44]">
                    {formatAed(Number(project.budgetMinor ?? 0) / 100, locale)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="enterprise-empty">{t("noProjects")}</p>
          )}
        </Card>
        <Card variant="elevated">
          <h2 className="mb-4 text-xl font-bold">{t("createProject")}</h2>
          <form className="enterprise-form" onSubmit={create}>
            <label>
              {common("title")}
              <input name="title" minLength={3} required />
            </label>
            <label>
              {t("slug")} ({common("optional")})
              <input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
            </label>
            <label>
              {common("description")}
              <textarea name="description" />
            </label>
            <label>
              {t("budgetAed")}
              <input name="budget" type="number" min="0" step="0.01" />
            </label>
            {error ? <p className="enterprise-error">{error}</p> : null}
            <Button disabled={pending}>
              {pending ? t("creating") : t("createProject")}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

function ProjectWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations("Workspace");
  const common = useTranslations("Common");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const project = useApiResource<Project>(`/api/projects/${projectId}`);
  const files = useApiResource<FileNode[]>(
    `/api/files?projectId=${encodeURIComponent(projectId)}&take=100`,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const label = (value: string) =>
    status.has(value) ? status(value) : value.replaceAll("_", " ");
  async function mutate(
    key: string,
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
  ) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await apiMutation(path, method, body);
      setNotice(t("operationComplete"));
      await Promise.all([project.refresh(), files.refresh()]);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("operationFailed"));
      return false;
    } finally {
      setBusy("");
    }
  }
  async function formMutation(
    event: FormEvent<HTMLFormElement>,
    key: string,
    path: string,
    body: (data: FormData) => unknown,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await mutate(key, path, "POST", body(new FormData(form)))) form.reset();
  }
  async function removeProject() {
    if (!window.confirm(t("deleteConfirm"))) return;
    if (await mutate("delete", `/api/projects/${projectId}`, "DELETE"))
      router.replace("/workspace");
  }
  if (project.loading)
    return <main className="enterprise-loading py-24">{t("loading")}</main>;
  if (!project.data)
    return (
      <main className="py-24">
        <p className="enterprise-error">
          {project.error || t("projectNotFound")}
        </p>
        <Link href="/workspace">{t("return")}</Link>
      </main>
    );
  const data = project.data;
  return (
    <main className="py-12">
      <div className="mb-6">
        <Link href="/workspace" className="font-bold text-[#009A44]">
          {t("allProjects")}
        </Link>
        <div className="mt-3 flex flex-wrap justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-[#0F4C5C]">{data.title}</h1>
            <p className="text-slate-600">
              {data.description || t("noDescription")}
            </p>
          </div>
          <Badge variant={data.status === "COMPLETED" ? "success" : "info"}>
            {label(data.status)}
          </Badge>
        </div>
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
          <h2 className="mb-4 text-xl font-bold">{t("settings")}</h2>
          <form
            className="enterprise-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void mutate("project", `/api/projects/${projectId}`, "PATCH", {
                title: form.get("title"),
                description: String(form.get("description") || "") || undefined,
                status: form.get("status"),
              });
            }}
          >
            <label>
              {common("title")}
              <input
                name="title"
                defaultValue={data.title}
                minLength={3}
                required
              />
            </label>
            <label>
              {common("description")}
              <textarea
                name="description"
                defaultValue={data.description ?? ""}
              />
            </label>
            <label>
              {common("status")}
              <select name="status" defaultValue={data.status}>
                {[
                  "DRAFT",
                  "OPEN",
                  "IN_PROGRESS",
                  "COMPLETED",
                  "CANCELLED",
                  "DISPUTED",
                ].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-3">
              <Button disabled={busy === "project"}>{t("saveProject")}</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void removeProject()}
              >
                {t("deleteProject")}
              </Button>
            </div>
          </form>
        </Card>
        <Card variant="elevated">
          <h2 className="mb-4 text-xl font-bold">{t("milestones")}</h2>
          <form
            className="enterprise-form mb-5"
            onSubmit={(event) =>
              void formMutation(
                event,
                "milestone",
                `/api/projects/${projectId}/milestones`,
                (form) => ({
                  title: form.get("title"),
                  status: "PLANNED",
                  dueAt: form.get("dueAt") || undefined,
                }),
              )
            }
          >
            <label>
              {t("milestoneTitle")}
              <input name="title" minLength={2} required />
            </label>
            <label>
              {t("dueDate")}
              <input name="dueAt" type="date" />
            </label>
            <Button>{t("addMilestone")}</Button>
          </form>
          <List empty={t("noMilestones")}>
            {data.milestones.map((item) => (
              <Item
                key={item.id}
                title={item.title}
                detail={`${label(item.status)}${item.dueAt ? ` · ${formatUaeDate(item.dueAt, locale)}` : ""}`}
              />
            ))}
          </List>
        </Card>
        <Card variant="elevated">
          <h2 className="mb-4 text-xl font-bold">{t("tasks")}</h2>
          <form
            className="enterprise-form mb-5"
            onSubmit={(event) =>
              void formMutation(
                event,
                "task",
                `/api/projects/${projectId}/tasks`,
                (form) => ({
                  title: form.get("title"),
                  priority: form.get("priority"),
                  status: "TODO",
                  position: data.tasks.length,
                }),
              )
            }
          >
            <label>
              {t("taskTitle")}
              <input name="title" minLength={2} required />
            </label>
            <label>
              {t("priority")}
              <select name="priority">
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </label>
            <Button>{t("addTask")}</Button>
          </form>
          <List empty={t("noTasks")}>
            {data.tasks.map((task) => (
              <Item
                key={task.id}
                title={task.title}
                detail={`${label(task.priority)}${task.assignee ? ` · ${task.assignee.displayName}` : ""}`}
                actions={
                  <select
                    aria-label={t("taskStatus", { title: task.title })}
                    value={task.status}
                    onChange={(event) =>
                      void mutate(
                        `task:${task.id}`,
                        `/api/projects/${projectId}/tasks/${task.id}`,
                        "PATCH",
                        { status: event.target.value },
                      )
                    }
                  >
                    {[
                      "BACKLOG",
                      "TODO",
                      "IN_PROGRESS",
                      "IN_REVIEW",
                      "BLOCKED",
                      "DONE",
                      "CANCELLED",
                    ].map((value) => (
                      <option key={value} value={value}>
                        {label(
                          value === "IN_REVIEW" ? "IN_REVIEW_TASK" : value,
                        )}
                      </option>
                    ))}
                  </select>
                }
              />
            ))}
          </List>
        </Card>
        <Card variant="elevated">
          <h2 className="mb-4 text-xl font-bold">{t("comments")}</h2>
          <form
            className="enterprise-form mb-5"
            onSubmit={(event) =>
              void formMutation(
                event,
                "comment",
                `/api/projects/${projectId}/comments`,
                (form) => ({ body: form.get("body") }),
              )
            }
          >
            <label>
              {t("newComment")}
              <textarea name="body" required />
            </label>
            <Button>{t("postComment")}</Button>
          </form>
          <List empty={t("noComments")}>
            {data.comments.map((item) => (
              <Item
                key={item.id}
                title={item.body}
                detail={`${item.author.displayName} · ${formatUaeDateTime(item.createdAt, locale)}`}
              />
            ))}
          </List>
        </Card>
        <Card variant="elevated">
          <h2 className="mb-4 text-xl font-bold">{t("members")}</h2>
          <form
            className="enterprise-form mb-5"
            onSubmit={(event) =>
              void formMutation(
                event,
                "member",
                `/api/projects/${projectId}/members`,
                (form) => ({
                  userId: form.get("userId"),
                  role: form.get("role"),
                }),
              )
            }
          >
            <label>
              {t("userId")}
              <input name="userId" required />
            </label>
            <label>
              {t("projectRole")}
              <select name="role">
                {["MANAGER", "CONTRIBUTOR", "VIEWER"].map((value) => <option key={value} value={value}>{label(value)}</option>)}
              </select>
            </label>
            <Button>{t("addMember")}</Button>
          </form>
          <List empty={t("noMembers")}>
            {data.memberships.map((item) => (
              <Item
                key={item.id}
                title={item.user.displayName}
                detail={`${item.user.email ?? ""} · ${label(item.role)}`}
              />
            ))}
          </List>
        </Card>
        <Card variant="elevated">
          <h2 className="mb-4 text-xl font-bold">{t("files")}</h2>
          <form
            className="enterprise-form mb-5"
            onSubmit={(event) =>
              void formMutation(event, "folder", "/api/files", (form) => ({
                name: form.get("name"),
                projectId,
              }))
            }
          >
            <label>
              {t("folderName")}
              <input name="name" required />
            </label>
            <Button>{t("createFolder")}</Button>
          </form>
          <List empty={t("noFiles")}>
            {[
              ...(files.data ?? []).map((item) => (
                <Item
                  key={item.id}
                  title={item.name}
                  detail={label(item.type)}
                />
              )),
              ...data.attachments.map((item) => (
                <Item
                  key={item.id}
                  title={item.filename}
                  detail={`${t("attachment")} · ${item.uploadedBy.displayName}`}
                />
              )),
            ]}
          </List>
        </Card>
        <Card variant="elevated" className="xl:col-span-2">
          <h2 className="mb-4 text-xl font-bold">{t("activity")}</h2>
          <List empty={t("noActivity")}>
            {data.activities.map((item) => (
              <Item
                key={item.id}
                title={item.summary}
                detail={`${label(item.type)} · ${formatUaeDateTime(item.createdAt, locale)}`}
              />
            ))}
          </List>
        </Card>
      </div>
      <AdvancedDeliveryClient
        projectId={projectId}
        tasks={data.tasks.map(({ id, title }) => ({ id, title }))}
        members={data.memberships.map(({ user }) => user)}
      />
    </main>
  );
}

function List({ children, empty }: { children: ReactNode[]; empty: string }) {
  return children.length ? (
    <div className="grid gap-2">{children}</div>
  ) : (
    <p className="enterprise-empty">{empty}</p>
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
