"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiGetWithMeta, apiMutation } from "@/lib/client/api-client";

type Version = { id: string; version: number; mimeType: string; sizeBytes: string; checksumSha256: string; scanStatus: "PENDING" | "CLEAN" | "INFECTED" | "FAILED" | "NOT_CONFIGURED"; createdAt: string };
type FileItem = { id: string; type: "FILE" | "FOLDER"; name: string; parentId: string | null; projectId: string | null; currentVersionNumber: number; legalHold: boolean; retentionUntil: string | null; deletedAt: string | null; metadata: Record<string, unknown> | null; versions: Version[]; lock: { lockedById: string; expiresAt: string; lockedBy?: { displayName: string | null } } | null; _count: { children: number } };
type Breadcrumb = { id: string; name: string };
type UploadIntent = { intent: { id: string }; upload: { url: string; method: "PUT"; headers: Record<string, string> } };

function errorMessage(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
function size(value: string | number) { const bytes = Number(value); if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`; if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`; return `${(bytes / 1024 ** 3).toFixed(1)} GB`; }
function timestamp(value: string) { return new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

async function checksum(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function putFile(operation: UploadIntent["upload"], file: File, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(operation.method, operation.url);
    for (const [key, value] of Object.entries(operation.headers)) request.setRequestHeader(key, value);
    request.upload.onprogress = (event) => event.lengthComputable ? progress(Math.round((event.loaded / event.total) * 100)) : undefined;
    request.onerror = () => reject(new Error("Storage upload failed before completion."));
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(`Storage upload failed with status ${request.status}.`));
    request.send(file);
  });
}

export function FileBrowserClient({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deleted, setDeleted] = useState<"active" | "only" | "all">("active");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ label: string; value: number } | null>(null);
  const [selected, setSelected] = useState<FileItem | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [stream, setStream] = useState<"connected" | "reconnecting" | "unavailable">("reconnecting");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (append = false, next?: string | null) => {
    setLoading(true); setError("");
    try {
      const parameters = new URLSearchParams({ take: "25", parentId: parentId ?? "root", deleted });
      if (query.trim()) parameters.set("query", query.trim());
      if (next) parameters.set("cursor", next);
      const result = await apiGetWithMeta<FileItem[]>(`/api/files?${parameters}`);
      setItems((current) => append ? [...current, ...result.data] : result.data);
      setCursor(typeof result.meta.nextCursor === "string" ? result.meta.nextCursor : null);
      setBreadcrumbs(Array.isArray(result.meta.breadcrumbs) ? result.meta.breadcrumbs as Breadcrumb[] : []);
    } catch (reason) { setError(errorMessage(reason, "Unable to load files.")); }
    finally { setLoading(false); }
  }, [deleted, parentId, query]);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    const source = new EventSource("/api/realtime/stream");
    source.addEventListener("connected", () => setStream("connected"));
    source.addEventListener("realtime-unavailable", () => setStream("unavailable"));
    source.onerror = () => setStream("reconnecting");
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { eventType?: string };
        if (!payload.eventType?.startsWith("file.")) return;
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => void load(), 250);
      } catch { /* ignore non-product events */ }
    };
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); source.close(); };
  }, [load]);

  async function mutation(label: string, action: () => Promise<unknown>, success: string) {
    setBusy(label); setError(""); setNotice("");
    try { await action(); setNotice(success); await load(); }
    catch (reason) { setError(errorMessage(reason, `Unable to ${label}.`)); }
    finally { setBusy(""); }
  }

  async function upload(file: File, target?: FileItem) {
    const label = target ? `version:${target.id}` : "upload";
    setBusy(label); setError(""); setNotice(""); setUploadProgress({ label: "Calculating SHA-256", value: 5 });
    try {
      const checksumSha256 = await checksum(file);
      setUploadProgress({ label: "Creating signed upload", value: 10 });
      const lockToken = target ? sessionStorage.getItem(`dublancer:file-lock:${target.id}`) ?? undefined : undefined;
      const intent = target
        ? await apiMutation<UploadIntent>(`/api/files/${target.id}/versions/upload-intents`, "POST", { mimeType: file.type || "application/octet-stream", sizeBytes: file.size, checksumSha256, expectedFileVersion: target.currentVersionNumber, lockToken })
        : await apiMutation<UploadIntent>("/api/files/upload-intents", "POST", { name: file.name, parentId: parentId ?? undefined, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, checksumSha256 });
      setUploadProgress({ label: "Uploading to governed storage", value: 12 });
      await putFile(intent.upload, file, (value) => setUploadProgress({ label: "Uploading to governed storage", value: 12 + Math.round(value * 0.8) }));
      setUploadProgress({ label: "Verifying provider evidence", value: 95 });
      await apiMutation(`/api/files/upload-intents/${intent.intent.id}/complete`, "POST", {});
      setUploadProgress({ label: "Queued for malware scan", value: 100 });
      setNotice(`${target ? "Version" : "File"} uploaded. Download remains blocked until the malware scan is clean.`);
      await load();
    } catch (reason) { setError(errorMessage(reason, "Unable to complete the governed upload.")); }
    finally { setBusy(""); setTimeout(() => setUploadProgress(null), 1200); }
  }

  async function openDetails(item: FileItem) {
    setSelected(item);
    if (item.type === "FILE") {
      try { setVersions(await apiGet<Version[]>(`/api/files/${item.id}/versions`)); }
      catch (reason) { setError(errorMessage(reason, "Unable to load file versions.")); }
    } else setVersions([]);
  }

  async function download(item: FileItem, versionId?: string) {
    setBusy(`download:${item.id}`); setError("");
    try {
      const operation = await apiGet<{ url: string; headers: Record<string, string>; fileName: string }>(`/api/files/${item.id}/download${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""}`);
      const response = await fetch(operation.url, { headers: operation.headers });
      if (!response.ok) throw new Error(`Storage download failed with status ${response.status}.`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = operation.fileName; link.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(errorMessage(reason, "Unable to download the file.")); }
    finally { setBusy(""); }
  }

  async function toggleLock(item: FileItem) {
    if (item.lock) {
      const token = sessionStorage.getItem(`dublancer:file-lock:${item.id}`);
      if (!token) { setError("This browser session does not own the active lock token."); return; }
      await mutation(`unlock:${item.id}`, async () => { await apiMutation(`/api/files/${item.id}/lock`, "DELETE", { lockToken: token }); sessionStorage.removeItem(`dublancer:file-lock:${item.id}`); }, "File unlocked.");
    } else {
      await mutation(`lock:${item.id}`, async () => { const result = await apiMutation<{ lockToken: string }>(`/api/files/${item.id}/lock`, "POST", { expiresInMinutes: 30 }); sessionStorage.setItem(`dublancer:file-lock:${item.id}`, result.lockToken); }, "File locked for this browser session.");
    }
  }

  function goToFolder(id: string | null) { setParentId(id); setQuery(""); setSelected(null); }

  return <main className="py-12 lg:py-16">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-bold uppercase tracking-[.18em] text-[#009A44]">Governed workspace content</p><h1 className="text-4xl font-bold text-[#0F4C5C]">Enterprise files</h1><p className="mt-2 text-slate-600">Signed uploads, verified versions, malware quarantine, retention and legal hold.</p></div>
      <span className={`rounded-full px-3 py-2 text-xs font-bold ${stream === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{stream === "connected" ? "Live refresh" : stream === "unavailable" ? "Realtime unavailable" : "Reconnecting"}</span>
    </header>
    {error ? <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</div> : null}
    {notice ? <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-700">{notice}</div> : null}
    {uploadProgress ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="mb-2 flex justify-between text-sm font-bold text-emerald-800"><span>{uploadProgress.label}</span><span>{uploadProgress.value}%</span></div><progress className="w-full" max="100" value={uploadProgress.value} /></div> : null}

    <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => goToFolder(null)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold">Root</button>
        {breadcrumbs.map((crumb) => <button key={crumb.id} type="button" onClick={() => goToFolder(crumb.id)} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-[#0F4C5C]">{crumb.name}</button>)}
        <form className="ml-auto flex gap-2" onSubmit={(event) => { event.preventDefault(); void load(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this folder" className="rounded-full border border-slate-300 px-4 py-2" /><button className="rounded-full bg-[#0F4C5C] px-4 py-2 text-sm font-bold text-white">Search</button></form>
        <select value={deleted} onChange={(event) => setDeleted(event.target.value as typeof deleted)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold"><option value="active">Active</option><option value="only">Deleted</option><option value="all">All</option></select>
      </div>
      {canManage ? <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => { const value = prompt("Folder name"); if (value) void mutation("create folder", () => apiMutation("/api/files", "POST", { name: value, parentId: parentId ?? undefined }), "Folder created."); }} className="rounded-full bg-[#009A44] px-5 py-3 text-sm font-bold text-white">New folder</button>
        <label className="cursor-pointer rounded-full border border-[#009A44] px-5 py-3 text-sm font-bold text-[#007a36]">Upload file<input type="file" className="sr-only" disabled={busy === "upload"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} /></label>
      </div> : null}
    </section>

    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        {loading ? <div role="status" className="p-8 text-slate-500">Loading governed files…</div> : items.length === 0 ? <div className="p-10 text-center text-slate-500">No files or folders match this view.</div> : <div className="divide-y divide-slate-100">{items.map((item) => { const latest = item.versions[0]; return <article key={item.id} className={`p-5 ${selected?.id === item.id ? "bg-emerald-50/50" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><button type="button" onClick={() => item.type === "FOLDER" ? goToFolder(item.id) : void openDetails(item)} className="text-left"><span className="text-xs font-bold uppercase tracking-wider text-[#009A44]">{item.type}{item.deletedAt ? " · Deleted" : ""}</span><h2 className="mt-1 text-lg font-bold text-[#0F4C5C]">{item.name}</h2><p className="mt-1 text-sm text-slate-500">{item.type === "FOLDER" ? `${item._count.children} children` : latest ? `${size(latest.sizeBytes)} · v${latest.version} · ${latest.scanStatus}` : "Awaiting version"}</p></button>
          {item.lock ? <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Locked until {timestamp(item.lock.expiresAt)}</span> : null}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            {item.type === "FILE" ? <button type="button" onClick={() => void openDetails(item)} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold">Versions</button> : null}
            {item.type === "FILE" && latest?.scanStatus === "CLEAN" && !item.deletedAt ? <button type="button" disabled={busy === `download:${item.id}`} onClick={() => void download(item)} className="rounded-full bg-[#0F4C5C] px-3 py-1.5 text-xs font-bold text-white">Download</button> : null}
            {canManage && item.type === "FILE" && !item.deletedAt ? <label className="cursor-pointer rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold">New version<input className="sr-only" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, item); event.currentTarget.value = ""; }} /></label> : null}
            {canManage && item.type === "FILE" && !item.deletedAt ? <button type="button" onClick={() => void toggleLock(item)} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold">{item.lock ? "Unlock" : "Lock"}</button> : null}
            {canManage ? <button type="button" onClick={() => { const value = prompt("New name", item.name); if (value && value !== item.name) void mutation(`rename:${item.id}`, () => apiMutation(`/api/files/${item.id}`, "PATCH", { name: value, lockToken: sessionStorage.getItem(`dublancer:file-lock:${item.id}`) ?? undefined }), "Name updated."); }} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold">Rename</button> : null}
            {canManage ? <button type="button" onClick={() => void mutation(`hold:${item.id}`, () => apiMutation(`/api/files/${item.id}`, "PATCH", { legalHold: !item.legalHold, lockToken: sessionStorage.getItem(`dublancer:file-lock:${item.id}`) ?? undefined }), item.legalHold ? "Legal hold released." : "Legal hold applied.")} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold">{item.legalHold ? "Release hold" : "Legal hold"}</button> : null}
            {canManage ? <button type="button" onClick={() => void mutation(`${item.deletedAt ? "restore" : "delete"}:${item.id}`, () => apiMutation(`/api/files/${item.id}`, "PATCH", { deleted: !item.deletedAt, lockToken: sessionStorage.getItem(`dublancer:file-lock:${item.id}`) ?? undefined }), item.deletedAt ? "Item restored." : "Item deleted.")} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold">{item.deletedAt ? "Restore" : "Delete"}</button> : null}
          </div>
        </article>; })}</div>}
        {cursor ? <button type="button" onClick={() => void load(true, cursor)} className="w-full border-t border-slate-200 py-4 font-bold text-[#0F4C5C]">Load more</button> : null}
      </section>

      <aside className="h-fit rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-xl font-bold text-[#0F4C5C]">Version evidence</h2>
        {!selected ? <p className="mt-3 text-sm text-slate-600">Select a file to inspect checksums, scan state and prior versions.</p> : selected.type === "FOLDER" ? <p className="mt-3 text-sm text-slate-600">{selected.name} is a folder.</p> : <div className="mt-4 grid gap-3">{versions.map((version) => <article key={version.id} className="rounded-2xl bg-white p-4"><div className="flex items-center justify-between"><strong className="text-[#0F4C5C]">Version {version.version}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${version.scanStatus === "CLEAN" ? "bg-emerald-50 text-emerald-700" : version.scanStatus === "INFECTED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{version.scanStatus}</span></div><p className="mt-2 text-xs text-slate-500">{size(version.sizeBytes)} · {timestamp(version.createdAt)}</p><code className="mt-2 block break-all text-[10px] text-slate-500">SHA-256 {version.checksumSha256}</code>{version.scanStatus === "CLEAN" ? <button type="button" onClick={() => void download(selected, version.id)} className="mt-3 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold">Download this version</button> : null}</article>)}</div>}
      </aside>
    </div>
  </main>;
}
