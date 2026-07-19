"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiGetWithMeta, apiMutation } from "@/lib/client/api-client";

type NotificationStatus = "UNREAD" | "READ" | "ARCHIVED";
type Delivery = {
  channel: "IN_APP" | "EMAIL" | "PUSH" | "SMS";
  status: "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED" | "CANCELLED";
  attempts: number;
  deliveredAt: string | null;
  lastError: string | null;
};
type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  status: NotificationStatus;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  category: string;
  createdAt: string;
  readAt: string | null;
  deliveries: Delivery[];
};
type Preference = {
  id: string;
  category: string;
  channel: "IN_APP" | "EMAIL" | "PUSH" | "SMS";
  enabled: boolean;
};

const FILTERS = ["ALL", "UNREAD", "READ", "ARCHIVED"] as const;
const CATEGORIES = ["GENERAL", "CHAT", "PROJECT", "MARKETPLACE", "FINANCE", "SECURITY"];
const CHANNELS = ["IN_APP", "EMAIL", "PUSH", "SMS"] as const;

function safeActionUrl(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(new Date(value));
}

function message(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

export default function NotificationInboxClient() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [category, setCategory] = useState("ALL");
  const [cursor, setCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");
  const [stream, setStream] = useState<"connected" | "reconnecting" | "unavailable">("reconnecting");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ take: "25" });
    if (filter !== "ALL") params.set("status", filter);
    if (category !== "ALL") params.set("category", category);
    return params.toString();
  }, [category, filter]);

  const loadPreferences = useCallback(async () => {
    try {
      setPreferences(await apiGet<Preference[]>("/api/notification-preferences"));
    } catch (reason) {
      setError(message(reason, "Unable to load notification preferences."));
    }
  }, []);

  const load = useCallback(async (append = false, pageCursor?: string | null) => {
    if (!append) setLoading(true);
    try {
      const suffix = pageCursor ? `${query}&cursor=${encodeURIComponent(pageCursor)}` : query;
      const [notifications, count] = await Promise.all([
        apiGetWithMeta<NotificationItem[]>(`/api/notifications?${suffix}`),
        apiGet<{ count: number }>("/api/notifications/unread-count"),
      ]);
      setItems((current) => append
        ? [...current, ...notifications.data.filter((entry) => !current.some((item) => item.id === entry.id))]
        : notifications.data);
      setCursor(typeof notifications.meta.nextCursor === "string" ? notifications.meta.nextCursor : null);
      setUnread(count.count);
      setError("");
    } catch (reason) {
      setError(message(reason, "Unable to load notifications."));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const task = window.setTimeout(() => void Promise.all([load(), loadPreferences()]), 0);
    return () => window.clearTimeout(task);
  }, [load, loadPreferences]);

  useEffect(() => {
    const eventSource = new EventSource("/api/realtime/stream");
    eventSource.addEventListener("connected", () => setStream("connected"));
    eventSource.addEventListener("realtime-unavailable", () => setStream("unavailable"));
    eventSource.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { eventType?: string };
        if (payload.eventType?.startsWith("notification.")) {
          void Promise.all([load(), loadPreferences()]);
        }
      } catch {
        // Ignore malformed broker events; manual and interval refresh remain available.
      }
    });
    eventSource.onerror = () => setStream("reconnecting");
    const poll = window.setInterval(() => void load(), 30_000);
    return () => {
      eventSource.close();
      window.clearInterval(poll);
    };
  }, [load, loadPreferences]);

  async function updateStatus(item: NotificationItem, action: "read" | "unread" | "archive") {
    setPending(`${item.id}:${action}`);
    setError("");
    const previous = items;
    const nextStatus: NotificationStatus = action === "read" ? "READ" : action === "unread" ? "UNREAD" : "ARCHIVED";
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: nextStatus } : entry));
    try {
      await apiMutation(`/api/notifications/${item.id}`, "PATCH", { action });
      setNotice(`Notification marked ${nextStatus.toLowerCase()}.`);
      await load();
    } catch (reason) {
      setItems(previous);
      setError(message(reason, "Unable to update the notification."));
    } finally {
      setPending("");
    }
  }

  async function markAllRead() {
    setPending("read-all");
    try {
      await apiMutation("/api/notifications/read-all", "POST", {});
      setNotice("All current-organization notifications are read.");
      await load();
    } catch (reason) {
      setError(message(reason, "Unable to mark notifications as read."));
    } finally {
      setPending("");
    }
  }

  async function togglePreference(categoryName: string, channel: (typeof CHANNELS)[number], enabled: boolean) {
    const key = `preference:${categoryName}:${channel}`;
    setPending(key);
    try {
      await apiMutation("/api/notification-preferences", "PUT", {
        category: categoryName,
        channel,
        enabled,
      });
      await loadPreferences();
      setNotice("Notification preference saved.");
    } catch (reason) {
      setError(message(reason, "Unable to save the preference."));
    } finally {
      setPending("");
    }
  }

  function preferenceEnabled(categoryName: string, channel: (typeof CHANNELS)[number]) {
    const organizationPreference = preferences.find((item) => item.category === categoryName && item.channel === channel);
    return organizationPreference?.enabled ?? true;
  }

  return (
    <main className="py-12 lg:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-bold uppercase tracking-[.18em] text-[#009A44]">Actionable updates</p><h1 className="text-4xl font-bold text-[#0F4C5C]">Notification inbox</h1><p className="mt-2 text-slate-600">{unread} unread in the active organization.</p></div>
        <div className="flex items-center gap-3"><span className={`rounded-full px-3 py-2 text-xs font-bold ${stream === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{stream === "connected" ? "Live updates" : stream === "unavailable" ? "Realtime unavailable" : "Reconnecting"}</span><button type="button" disabled={!unread || pending === "read-all"} onClick={() => void markAllRead()} className="rounded-full bg-[#009A44] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Mark all read</button></div>
      </header>
      {error ? <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{error}</div> : null}
      {notice ? <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-700">{notice}</div> : null}
      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Notification filters">
            {FILTERS.map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full px-4 py-2 text-sm font-bold ${filter === value ? "bg-[#0F4C5C] text-white" : "border border-slate-300 text-[#0F4C5C]"}`}>{value}</button>)}
            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-[#0F4C5C]"><option value="ALL">All categories</option>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select>
            <button type="button" onClick={() => void load()} className="ml-auto rounded-full border border-slate-300 px-4 py-2 text-sm font-bold">Refresh</button>
          </div>
          <div className="grid gap-3">
            {loading ? <div role="status" className="rounded-2xl border border-slate-200 p-6">Loading notifications…</div> : items.length === 0 ? <div className="rounded-2xl border border-slate-200 p-8 text-center text-slate-500">No notifications match this view.</div> : items.map((item) => {
              const actionUrl = safeActionUrl(item.actionUrl);
              return <article key={item.id} className={`rounded-3xl border p-5 ${item.status === "UNREAD" ? "border-[#009A44] bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{item.category}</span><span className="text-xs font-bold text-[#009A44]">{item.priority}</span></div><h2 className="mt-3 text-lg font-bold text-[#0F4C5C]">{item.title}</h2>{item.body ? <p className="mt-2 leading-6 text-slate-600">{item.body}</p> : null}</div><time className="text-xs text-slate-500" dateTime={item.createdAt}>{dateTime(item.createdAt)}</time></div>
                <div className="mt-4 flex flex-wrap items-center gap-2">{actionUrl ? <Link href={actionUrl} onClick={() => item.status === "UNREAD" ? void updateStatus(item, "read") : undefined} className="rounded-full bg-[#0F4C5C] px-4 py-2 text-sm font-bold text-white">Open</Link> : null}{item.status === "UNREAD" ? <button type="button" onClick={() => void updateStatus(item, "read")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold">Mark read</button> : item.status === "READ" ? <button type="button" onClick={() => void updateStatus(item, "unread")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold">Mark unread</button> : null}{item.status !== "ARCHIVED" ? <button type="button" onClick={() => void updateStatus(item, "archive")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold">Archive</button> : null}</div>
                {item.deliveries.length ? <details className="mt-4 text-xs text-slate-500"><summary className="cursor-pointer font-bold">Delivery evidence</summary><div className="mt-2 flex flex-wrap gap-2">{item.deliveries.map((delivery) => <span key={delivery.channel} title={delivery.lastError ?? undefined} className="rounded-full bg-slate-100 px-3 py-1">{delivery.channel}: {delivery.status}{delivery.attempts ? ` · ${delivery.attempts} attempts` : ""}</span>)}</div></details> : null}
              </article>;
            })}
          </div>
          {cursor ? <button type="button" onClick={() => void load(true, cursor)} className="mt-4 w-full rounded-2xl border border-slate-300 py-3 font-bold">Load more notifications</button> : null}
        </section>

        <aside className="h-fit rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-xl font-bold text-[#0F4C5C]">Preferences</h2><p className="mt-2 text-sm text-slate-600">Organization-specific channel controls. External delivery still requires configured provider credentials.</p>
          <div className="mt-5 grid gap-4">{CATEGORIES.map((categoryName) => <section key={categoryName} className="rounded-2xl bg-white p-4"><h3 className="text-sm font-bold text-[#0F4C5C]">{categoryName}</h3><div className="mt-3 grid grid-cols-2 gap-2">{CHANNELS.map((channel) => { const enabled = preferenceEnabled(categoryName, channel); const key = `preference:${categoryName}:${channel}`; return <label key={channel} className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={enabled} disabled={pending === key} onChange={(event) => void togglePreference(categoryName, channel, event.target.checked)} />{channel.replace("_", " ")}</label>; })}</div></section>)}</div>
        </aside>
      </div>
    </main>
  );
}
