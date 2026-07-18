"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";

type ProjectSummary = {
  id: string; title: string; slug: string; description?: string | null;
  status: string; budgetMinor?: string | null; currency: string; updatedAt: string;
};
type User = { id: string; displayName: string; email?: string };
type Milestone = { id: string; title: string; status: string; dueAt?: string | null };
type Task = { id: string; title: string; status: string; priority: string; assignee?: User | null };
type Comment = { id: string; body: string; createdAt: string; author: User };
type Membership = { id: string; role: string; user: User };
type Attachment = { id: string; filename: string; sizeBytes: string; createdAt: string; uploadedBy: Pick<User, "id" | "displayName"> };
type Activity = { id: string; summary: string; type: string; createdAt: string };
type Project = ProjectSummary & {
  milestones: Milestone[]; tasks: Task[]; comments: Comment[];
  memberships: Membership[]; attachments: Attachment[]; activities: Activity[];
};
type FileNode = { id: string; name: string; type: "FILE" | "FOLDER"; updatedAt: string };

const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-[#10233f]";
const money = (minor: string | null | undefined, currency: string) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency }).format(Number(minor ?? 0) / 100);
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function WorkspaceClient({ projectId }: { projectId?: string }) {
  return projectId ? <ProjectWorkspace projectId={projectId} /> : <ProjectDirectory />;
}

function ProjectDirectory() {
  const projects = useApiResource<ProjectSummary[]>("/api/projects?take=100");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const form = event.currentTarget; const data = new FormData(form);
    try {
      const title = String(data.get("title") ?? "");
      await apiMutation("/api/projects", "POST", { title, slug: slugify(String(data.get("slug") || title)), description: String(data.get("description") || "") || undefined, budgetMinor: data.get("budgetMinor") ? String(Math.round(Number(data.get("budgetMinor")) * 100)) : undefined, currency: "AED" });
      form.reset(); await projects.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create project."); }
    finally { setPending(false); }
  }

  return <main className="py-16">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="font-bold uppercase tracking-widest text-[#009A44]">Project workspace</p><h1 className="text-4xl font-bold text-[#0F4C5C]">Your live projects</h1></div><button type="button" onClick={() => void projects.refresh()} className="rounded-full border px-5 py-2 font-bold">Refresh</button></div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section><Card variant="elevated"><h2 className="mb-5 text-2xl font-bold text-[#0F4C5C]">Projects</h2>{projects.error ? <p className="enterprise-error">{projects.error}</p> : null}{projects.loading ? <p className="enterprise-loading">Loading workspace…</p> : projects.data?.length ? <div className="grid gap-3">{projects.data.map((project) => <Link key={project.id} href={`/workspace/project/${project.id}`} className="rounded-2xl border border-slate-200 p-5 hover:border-[#009A44]"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold text-[#0F4C5C]">{project.title}</h3><Badge variant={project.status === "COMPLETED" ? "success" : "info"}>{project.status.replaceAll("_", " ")}</Badge></div><p className="mt-2 text-slate-600">{project.description || "No description"}</p><p className="mt-3 text-sm font-bold text-[#009A44]">{money(project.budgetMinor, project.currency)}</p></Link>)}</div> : <p className="enterprise-empty">No projects yet.</p>}</Card></section>
      <aside><Card variant="elevated"><h2 className="mb-4 text-xl font-bold text-[#0F4C5C]">Create project</h2><form className="enterprise-form" onSubmit={create}><label>Title<input className={field} name="title" minLength={3} required /></label><label>Slug (optional)<input className={field} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label>Description<textarea name="description" /></label><label>Budget (AED)<input className={field} name="budgetMinor" type="number" min="0" step="0.01" /></label>{error ? <p className="enterprise-error">{error}</p> : null}<Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create Project"}</Button></form></Card></aside>
    </div>
  </main>;
}

function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const project = useApiResource<Project>(`/api/projects/${projectId}`);
  const files = useApiResource<FileNode[]>(`/api/files?projectId=${encodeURIComponent(projectId)}&take=100`);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function mutate(label: string, path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    setBusy(label); setError(""); setNotice("");
    try { await apiMutation(path, method, body); setNotice(`${label} completed.`); await Promise.all([project.refresh(), files.refresh()]); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : `${label} failed.`); return false; }
    finally { setBusy(""); }
  }

  async function formMutation(event: FormEvent<HTMLFormElement>, label: string, path: string, body: (data: FormData) => unknown) {
    event.preventDefault(); const form = event.currentTarget;
    if (await mutate(label, path, "POST", body(new FormData(form)))) form.reset();
  }

  async function taskStatus(task: Task, status: string) {
    const before = project.data;
    if (before) project.setData({ ...before, tasks: before.tasks.map((row) => row.id === task.id ? { ...row, status } : row) });
    if (!(await mutate("Task update", `/api/projects/${projectId}/tasks/${task.id}`, "PATCH", { status }))) project.setData(before);
  }

  async function removeProject() {
    if (!window.confirm("Delete this project permanently?")) return;
    if (await mutate("Project deletion", `/api/projects/${projectId}`, "DELETE")) router.replace("/workspace");
  }

  if (project.loading) return <main className="enterprise-loading py-24">Loading project workspace…</main>;
  if (!project.data) return <main className="py-24"><p className="enterprise-error">{project.error || "Project not found."}</p><Link href="/workspace">Return to workspace</Link></main>;
  const data = project.data;

  return <main className="py-12">
    <div className="mb-6"><Link href="/workspace" className="font-bold text-[#009A44]">← All projects</Link><div className="mt-3 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-4xl font-bold text-[#0F4C5C]">{data.title}</h1><p className="text-slate-600">{data.description || "No description"}</p></div><Badge variant={data.status === "COMPLETED" ? "success" : "info"}>{data.status.replaceAll("_", " ")}</Badge></div></div>
    {error ? <p className="enterprise-error" role="alert">{error}</p> : null}{notice ? <p className="enterprise-notice" role="status">{notice}</p> : null}
    <div className="grid gap-6 xl:grid-cols-2">
      <Card variant="elevated"><h2 className="mb-4 text-xl font-bold">Project settings</h2><form key={data.updatedAt} className="enterprise-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void mutate("Project update", `/api/projects/${projectId}`, "PATCH", { title: form.get("title"), description: String(form.get("description") || "") || undefined, status: form.get("status") }); }}><label>Title<input name="title" defaultValue={data.title} minLength={3} required /></label><label>Description<textarea name="description" defaultValue={data.description ?? ""} /></label><label>Status<select name="status" defaultValue={data.status}>{["DRAFT","OPEN","IN_PROGRESS","COMPLETED","CANCELLED","DISPUTED"].map((status) => <option key={status}>{status}</option>)}</select></label><div className="flex gap-3"><Button disabled={busy === "Project update"}>Save project</Button><Button type="button" variant="outline" onClick={() => void removeProject()}>Delete</Button></div></form></Card>
      <Card variant="elevated"><h2 className="mb-4 text-xl font-bold">Milestones</h2><form className="enterprise-form mb-5" onSubmit={(event) => void formMutation(event,"Milestone creation",`/api/projects/${projectId}/milestones`,(form) => ({ title: form.get("title"), status: "PLANNED", dueAt: form.get("dueAt") || undefined }))}><label>Milestone title<input name="title" minLength={2} required /></label><label>Due date<input name="dueAt" type="date" /></label><Button disabled={busy === "Milestone creation"}>Add milestone</Button></form><RecordList empty="No milestones yet." items={data.milestones.map((item) => ({ id: item.id, title: item.title, detail: `${item.status}${item.dueAt ? ` · ${new Date(item.dueAt).toLocaleDateString("en-AE")}` : ""}` }))} /></Card>
      <Card variant="elevated"><h2 className="mb-4 text-xl font-bold">Tasks</h2><form className="enterprise-form mb-5" onSubmit={(event) => void formMutation(event,"Task creation",`/api/projects/${projectId}/tasks`,(form) => ({ title: form.get("title"), priority: form.get("priority"), status: "TODO", position: data.tasks.length }))}><label>Task title<input name="title" minLength={2} required /></label><label>Priority<select name="priority" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></label><Button disabled={busy === "Task creation"}>Add task</Button></form><div className="grid gap-3">{data.tasks.length ? data.tasks.map((task) => <div key={task.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{task.title}</strong><p className="text-sm text-slate-500">{task.priority} priority{task.assignee ? ` · ${task.assignee.displayName}` : ""}</p></div><select aria-label={`Status for ${task.title}`} className={field} style={{width:"auto"}} value={task.status} onChange={(event) => void taskStatus(task,event.target.value)}>{["BACKLOG","TODO","IN_PROGRESS","IN_REVIEW","BLOCKED","DONE","CANCELLED"].map((status) => <option key={status}>{status}</option>)}</select></div></div>) : <p className="enterprise-empty">No tasks yet.</p>}</div></Card>
      <Card variant="elevated"><h2 className="mb-4 text-xl font-bold">Comments</h2><form className="enterprise-form mb-5" onSubmit={(event) => void formMutation(event,"Comment creation",`/api/projects/${projectId}/comments`,(form) => ({ body: form.get("body") }))}><label>New comment<textarea name="body" minLength={1} required /></label><Button disabled={busy === "Comment creation"}>Post comment</Button></form><div className="grid gap-3">{data.comments.length ? data.comments.map((comment) => <article key={comment.id} className="rounded-xl border p-3"><p>{comment.body}</p><small className="text-slate-500">{comment.author.displayName} · {new Date(comment.createdAt).toLocaleString("en-AE")}</small></article>) : <p className="enterprise-empty">No comments yet.</p>}</div></Card>
      <Card variant="elevated"><h2 className="mb-4 text-xl font-bold">Members</h2><form className="enterprise-form mb-5" onSubmit={(event) => void formMutation(event,"Member assignment",`/api/projects/${projectId}/members`,(form) => ({ userId: form.get("userId"), role: form.get("role") }))}><label>Organization user ID<input name="userId" required /></label><label>Project role<select name="role" defaultValue="CONTRIBUTOR"><option>MANAGER</option><option>CONTRIBUTOR</option><option>VIEWER</option></select></label><Button disabled={busy === "Member assignment"}>Add member</Button></form><RecordList empty="No project members yet." items={data.memberships.map((item) => ({ id:item.id,title:item.user.displayName,detail:`${item.user.email ?? ""} · ${item.role}` }))} /></Card>
      <Card variant="elevated"><h2 className="mb-4 text-xl font-bold">Files and folders</h2><form className="enterprise-form mb-5" onSubmit={(event) => void formMutation(event,"Folder creation","/api/files",(form) => ({ name: form.get("name"), projectId }))}><label>Folder name<input name="name" required /></label><Button disabled={busy === "Folder creation"}>Create folder</Button></form>{files.error ? <p className="enterprise-error">{files.error}</p> : null}<RecordList empty="No files or folders yet." items={[...(files.data ?? []).map((item) => ({id:item.id,title:item.name,detail:item.type})),...data.attachments.map((item) => ({id:item.id,title:item.filename,detail:`Attachment · ${item.uploadedBy.displayName}`}))]} /></Card>
      <Card variant="elevated" className="xl:col-span-2"><h2 className="mb-4 text-xl font-bold">Activity</h2><RecordList empty="No activity yet." items={data.activities.map((item) => ({id:item.id,title:item.summary,detail:`${item.type.replaceAll("_"," ")} · ${new Date(item.createdAt).toLocaleString("en-AE")}`}))} /></Card>
    </div>
  </main>;
}

function RecordList({ items, empty }: { items: Array<{id:string;title:string;detail:string}>; empty:string }) {
  return items.length ? <div className="grid gap-2">{items.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><strong>{item.title}</strong><p className="text-sm text-slate-500">{item.detail}</p></div>)}</div> : <p className="enterprise-empty">{empty}</p>;
}
