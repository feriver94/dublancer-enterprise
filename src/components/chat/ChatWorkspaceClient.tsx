"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiGet, apiGetWithMeta, apiMutation } from "@/lib/client/api-client";

type Channel = {
  id: string;
  type: "PROJECT" | "GROUP" | "DIRECT" | "ANNOUNCEMENT";
  name: string | null;
  description: string | null;
  sequence: string;
  unreadCount: string;
  isArchived: boolean;
  member: { role: string; lastReadSequence: string } | null;
  messages: Array<{ body: string; createdAt: string; deletedAt: string | null }>;
  _count: { members: number; messages: number };
};

type Reaction = {
  emoji: string;
  user: { id: string; displayName: string };
};

type Message = {
  id: string;
  parentId: string | null;
  sequence: string;
  body: string;
  format: "PLAIN_TEXT" | "MARKDOWN";
  replyCount: number;
  version: number;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  author: { id: string; displayName: string };
  mentions: Array<{ user: { id: string; displayName: string } }>;
  reactions: Reaction[];
};

type Member = {
  userId: string;
  role: string;
  lastReadSequence: string;
  lastReadAt: string | null;
  user: { displayName: string };
};

type Presence = {
  userId: string;
  status: "ONLINE" | "AWAY";
  expiresAt: string;
  user: { displayName: string };
};

type Me = { id: string; displayName: string };
type StreamState = "connecting" | "connected" | "reconnecting" | "unavailable";

const EMOJIS = ["👍", "✅", "❤️", "🎉"];

function displayChannel(channel: Channel) {
  return channel.name || (channel.type === "DIRECT" ? "Direct conversation" : `${channel.type.toLowerCase()} channel`);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Dubai",
  }).format(new Date(value));
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

export default function ChatWorkspaceClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelCursor, setChannelCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [olderSequence, setOlderSequence] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [threadRoot, setThreadRoot] = useState<Message | null>(null);
  const [threadReplies, setThreadReplies] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map());
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const [loading, setLoading] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [threadDraft, setThreadDraft] = useState("");
  const connectionId = useRef("");
  const typingTimer = useRef<number | null>(null);
  const typingActive = useRef(false);

  const selected = useMemo(
    () => channels.find((channel) => channel.id === selectedId) ?? null,
    [channels, selectedId],
  );

  const loadChannels = useCallback(async (append = false, cursor?: string | null) => {
    try {
      const response = await apiGetWithMeta<Channel[]>(
        `/api/chat/channels?take=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      setChannels((current) => append
        ? [...current, ...response.data.filter((entry) => !current.some((item) => item.id === entry.id))]
        : response.data);
      setChannelCursor(typeof response.meta.nextCursor === "string" ? response.meta.nextCursor : null);
      setError("");
      return response.data;
    } catch (reason) {
      setError(errorMessage(reason, "Unable to load chat channels."));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async (channelId: string) => {
    try {
      setMembers(await apiGet<Member[]>(`/api/chat/channels/${channelId}/members`));
    } catch (reason) {
      setError(errorMessage(reason, "Unable to load channel members."));
    }
  }, []);

  const loadPresence = useCallback(async (channelId: string) => {
    try {
      setPresence(await apiGet<Presence[]>(`/api/realtime/presence?channelId=${encodeURIComponent(channelId)}`));
    } catch {
      setPresence([]);
    }
  }, []);

  const markRead = useCallback(async (channelId: string, sequence?: string) => {
    if (!sequence || sequence === "0") return;
    try {
      await apiMutation(`/api/chat/channels/${channelId}/read`, "POST", { sequence });
      await Promise.all([loadMembers(channelId), loadChannels()]);
    } catch {
      // Read progress is retried on the next refresh and must never block conversation access.
    }
  }, [loadChannels, loadMembers]);

  const loadMessages = useCallback(async (channelId: string, before?: string) => {
    if (!before) setLoadingConversation(true);
    try {
      const response = await apiGetWithMeta<Message[]>(
        `/api/chat/channels/${channelId}/messages?take=50${before ? `&beforeSequence=${encodeURIComponent(before)}` : ""}`,
      );
      const ordered = [...response.data].reverse();
      setMessages((current) => before ? [...ordered, ...current] : ordered);
      setOlderSequence(typeof response.meta.nextSequence === "string" ? response.meta.nextSequence : null);
      if (!before) {
        const sequence = ordered.at(-1)?.sequence;
        await markRead(channelId, sequence);
      }
      setError("");
      return ordered;
    } catch (reason) {
      setError(errorMessage(reason, "Unable to load conversation."));
      return [];
    } finally {
      setLoadingConversation(false);
    }
  }, [markRead]);

  const refreshConversation = useCallback(async (channelId: string) => {
    await Promise.all([
      loadMessages(channelId),
      loadMembers(channelId),
      loadPresence(channelId),
      loadChannels(),
    ]);
  }, [loadChannels, loadMembers, loadMessages, loadPresence]);

  const loadThread = useCallback(async (channelId: string, root: Message) => {
    setThreadRoot(root);
    setThreadReplies([]);
    try {
      const response = await apiGetWithMeta<Message[]>(
        `/api/chat/channels/${channelId}/messages?parentId=${encodeURIComponent(root.id)}&take=100`,
      );
      setThreadReplies([...response.data].reverse());
    } catch (reason) {
      setError(errorMessage(reason, "Unable to load the thread."));
    }
  }, []);

  useEffect(() => {
    connectionId.current = crypto.randomUUID();
    const initialChannel = new URLSearchParams(window.location.search).get("channelId") ?? "";
    const task = window.setTimeout(() => {
      void Promise.all([apiGet<Me>("/api/me").then(setMe), loadChannels()]).then(async ([, items]) => {
        if (initialChannel && !items.some((item) => item.id === initialChannel)) {
          try {
            const requested = await apiGet<Channel>(`/api/chat/channels/${encodeURIComponent(initialChannel)}`);
            setChannels((current) => [requested, ...current.filter((item) => item.id !== requested.id)]);
            setSelectedId(requested.id);
            return;
          } catch {
            // The requested channel is inaccessible or gone; select the first visible channel.
            setSelectedId(items[0]?.id || "");
            return;
          }
        }
        setSelectedId(initialChannel || items[0]?.id || "");
      });
    }, 0);
    return () => window.clearTimeout(task);
  }, [loadChannels]);

  useEffect(() => {
    if (!selectedId) return;
    const query = new URLSearchParams(window.location.search);
    query.set("channelId", selectedId);
    window.history.replaceState(null, "", `/communications/chat?${query.toString()}`);
    const task = window.setTimeout(() => {
      setThreadRoot(null);
      setThreadReplies([]);
      setMessages([]);
      setOlderSequence(null);
      void refreshConversation(selectedId);
    }, 0);
    return () => window.clearTimeout(task);
  }, [refreshConversation, selectedId]);

  useEffect(() => {
    const messageId = new URLSearchParams(window.location.search).get("messageId");
    if (!messageId || !messages.some((message) => message.id === messageId)) return;
    const task = window.setTimeout(() => {
      document.getElementById(`message-${messageId}`)?.scrollIntoView({ block: "center" });
    }, 0);
    return () => window.clearTimeout(task);
  }, [messages]);

  useEffect(() => {
    if (!selectedId) return;
    let closed = false;
    const stream = new EventSource(`/api/realtime/stream?channelId=${encodeURIComponent(selectedId)}`);
    const connectingTask = window.setTimeout(() => setStreamState("connecting"), 0);

    stream.addEventListener("connected", () => setStreamState("connected"));
    stream.addEventListener("realtime-unavailable", () => setStreamState("unavailable"));
    stream.addEventListener("message", (event) => {
      if (closed) return;
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          eventType?: string;
          actorUserId?: string;
          payload?: { userId?: string; active?: boolean; expiresAt?: string };
        };
        if (payload.eventType === "chat.typing.updated" && payload.payload?.userId !== me?.id) {
          setTypingUsers((current) => {
            const next = new Map(current);
            if (payload.payload?.active) next.set(payload.payload.userId ?? "", Date.parse(payload.payload.expiresAt ?? ""));
            else next.delete(payload.payload?.userId ?? "");
            return next;
          });
          return;
        }
        if (payload.eventType?.startsWith("chat.") || payload.eventType === "presence.updated") {
          void refreshConversation(selectedId);
          if (threadRoot) void loadThread(selectedId, threadRoot);
        }
      } catch {
        // Ignore malformed provider messages; the next refresh restores authoritative state.
      }
    });
    stream.onerror = () => setStreamState("reconnecting");
    return () => {
      closed = true;
      window.clearTimeout(connectingTask);
      stream.close();
    };
  }, [loadThread, me?.id, refreshConversation, selectedId, threadRoot]);

  useEffect(() => {
    if (!selectedId || !connectionId.current) return;
    const heartbeat = async () => {
      try {
        await apiMutation("/api/realtime/presence/heartbeat", "POST", {
          connectionId: connectionId.current,
          resourceType: "CHAT_CHANNEL",
          resourceId: selectedId,
          status: document.visibilityState === "visible" ? "ONLINE" : "AWAY",
        });
        await loadPresence(selectedId);
      } catch {
        // Presence is advisory; chat remains available during a heartbeat failure.
      }
    };
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadPresence, selectedId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setTypingUsers((current) => new Map([...current].filter(([, expiresAt]) => expiresAt > now)));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function sendTyping(active: boolean) {
    if (!selectedId || typingActive.current === active) return;
    typingActive.current = active;
    try {
      const result = await apiMutation<{ realtimeAvailable: boolean }>(
        `/api/chat/channels/${selectedId}/typing`,
        "POST",
        { active },
      );
      if (!result.realtimeAvailable) setStreamState("unavailable");
    } catch {
      setStreamState("unavailable");
    }
  }

  function draftChanged(value: string, thread = false) {
    if (thread) setThreadDraft(value); else setDraft(value);
    void sendTyping(Boolean(value.trim()));
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => void sendTyping(false), 2_500);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>, parentId?: string) {
    event.preventDefault();
    const body = (parentId ? threadDraft : draft).trim();
    if (!body || !selectedId) return;
    const operation = parentId ? "thread:send" : "message:send";
    setPending(operation);
    setError("");
    try {
      await apiMutation<Message>(`/api/chat/channels/${selectedId}/messages`, "POST", {
        body,
        format: "PLAIN_TEXT",
        ...(parentId ? { parentId } : {}),
        clientMessageId: crypto.randomUUID(),
        mentionedUserIds: [],
      });
      if (parentId) setThreadDraft(""); else setDraft("");
      await sendTyping(false);
      await refreshConversation(selectedId);
      if (parentId && threadRoot) await loadThread(selectedId, threadRoot);
    } catch (reason) {
      setError(errorMessage(reason, "Message was not sent. Your draft has been preserved."));
    } finally {
      setPending("");
    }
  }

  async function react(message: Message, emoji: string) {
    if (!selectedId) return;
    const ownReaction = message.reactions.some((item) => item.emoji === emoji && item.user.id === me?.id);
    setPending(`reaction:${message.id}:${emoji}`);
    try {
      await apiMutation(
        `/api/chat/channels/${selectedId}/messages/${message.id}/reactions`,
        ownReaction ? "DELETE" : "POST",
        { emoji },
      );
      await refreshConversation(selectedId);
      if (threadRoot) await loadThread(selectedId, threadRoot);
    } catch (reason) {
      setError(errorMessage(reason, "Unable to update the reaction."));
    } finally {
      setPending("");
    }
  }

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    setPending("channel:create");
    try {
      const channel = await apiMutation<Channel>("/api/chat/channels", "POST", {
        type: "GROUP",
        visibility: "ORGANIZATION",
        name,
        memberUserIds: [],
      });
      form.reset();
      await loadChannels();
      setSelectedId(channel.id);
      setNotice("Channel created.");
    } catch (reason) {
      setError(errorMessage(reason, "Unable to create the channel."));
    } finally {
      setPending("");
    }
  }

  function renderMessage(message: Message, threaded = false) {
    const readBy = members.filter((member) => BigInt(member.lastReadSequence) >= BigInt(message.sequence));
    const groupedReactions = message.reactions.reduce<Record<string, Reaction[]>>((groups, reaction) => {
      (groups[reaction.emoji] ??= []).push(reaction);
      return groups;
    }, {});
    return (
      <article key={message.id} id={`message-${message.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-[#0F4C5C]">{message.author.displayName || "Member"}</strong>
          <time className="text-xs text-slate-500" dateTime={message.createdAt}>{dateTime(message.createdAt)}</time>
        </div>
        <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${message.deletedAt ? "italic text-slate-400" : "text-slate-700"}`}>
          {message.deletedAt ? "Message removed" : message.body}
        </p>
        {!message.deletedAt ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {EMOJIS.map((emoji) => (
              <button key={emoji} type="button" disabled={pending.startsWith(`reaction:${message.id}`)} onClick={() => void react(message, emoji)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs hover:border-[#009A44]">
                {emoji}{groupedReactions[emoji]?.length ? ` ${groupedReactions[emoji].length}` : ""}
              </button>
            ))}
            {!threaded ? <button type="button" onClick={() => void loadThread(selectedId, message)} className="text-xs font-bold text-[#009A44]">Thread {message.replyCount ? `(${message.replyCount})` : ""}</button> : null}
            <span className="ml-auto text-xs text-slate-400" title={readBy.map((member) => member.user.displayName).join(", ")}>{readBy.length ? `Read by ${readBy.length}` : "Sent"}</span>
          </div>
        ) : null}
      </article>
    );
  }

  const activeTyping = [...typingUsers.keys()].filter(Boolean).map((userId) => members.find((member) => member.userId === userId)?.user.displayName ?? "A member");

  return (
    <main className="py-10 lg:py-14">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-bold uppercase tracking-[.18em] text-[#009A44]">Enterprise collaboration</p><h1 className="text-4xl font-bold text-[#0F4C5C]">Realtime chat</h1><p className="mt-2 text-slate-600">Tenant-isolated channels with durable messages and recoverable realtime delivery.</p></div>
        <div aria-live="polite" className={`rounded-full px-4 py-2 text-sm font-bold ${streamState === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {streamState === "connected" ? "Live" : streamState === "unavailable" ? "Realtime unavailable · messages remain durable" : "Reconnecting…"}
        </div>
      </header>
      {error ? <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</div> : null}
      {notice ? <div role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-700">{notice}</div> : null}
      <div className="grid min-h-[680px] gap-4 lg:grid-cols-[290px_minmax(0,1fr)_330px]">
        <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-lg font-bold text-[#0F4C5C]">Channels</h2>
          <form onSubmit={createChannel} className="mt-3 flex gap-2"><input name="name" aria-label="New channel name" maxLength={120} placeholder="New channel" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2" /><button disabled={pending === "channel:create"} className="rounded-xl bg-[#009A44] px-3 py-2 font-bold text-white">Add</button></form>
          <div className="mt-4 grid gap-2">
            {loading ? <p className="text-sm text-slate-500">Loading channels…</p> : channels.length === 0 ? <p className="text-sm text-slate-500">No channels yet.</p> : channels.map((channel) => (
              <button key={channel.id} type="button" onClick={() => setSelectedId(channel.id)} className={`rounded-2xl border p-3 text-left ${channel.id === selectedId ? "border-[#009A44] bg-white" : "border-transparent hover:bg-white"}`}>
                <span className="flex items-center justify-between gap-2"><strong className="truncate text-[#0F4C5C]">{displayChannel(channel)}</strong>{BigInt(channel.unreadCount || "0") > BigInt(0) ? <span className="rounded-full bg-[#009A44] px-2 py-0.5 text-xs font-bold text-white">{channel.unreadCount}</span> : null}</span>
                <span className="mt-1 block truncate text-xs text-slate-500">{channel.messages[0]?.deletedAt ? "Message removed" : channel.messages[0]?.body || `${channel._count.members} members`}</span>
              </button>
            ))}
          </div>
          {channelCursor ? <button type="button" onClick={() => void loadChannels(true, channelCursor)} className="mt-4 w-full rounded-xl border border-slate-300 py-2 text-sm font-bold">Load more channels</button> : null}
        </aside>

        <section className="flex min-h-0 flex-col rounded-3xl border border-slate-200 bg-slate-50 p-4">
          {selected ? <><div className="border-b border-slate-200 pb-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-[#0F4C5C]">{displayChannel(selected)}</h2><p className="text-sm text-slate-500">{selected.description || `${selected._count.members} members · ${selected.type.toLowerCase()}`}</p></div><button type="button" onClick={() => void refreshConversation(selected.id)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold">Refresh</button></div><div className="mt-3 flex flex-wrap gap-2">{presence.map((entry) => <span key={entry.userId} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">● {entry.user.displayName} {entry.status.toLowerCase()}</span>)}</div></div>
            <div className="flex-1 space-y-3 overflow-y-auto py-4">
              {olderSequence ? <button type="button" onClick={() => void loadMessages(selected.id, olderSequence)} className="mx-auto block rounded-full border border-slate-300 px-4 py-2 text-sm font-bold">Load older messages</button> : null}
              {loadingConversation ? <p className="text-center text-sm text-slate-500">Loading conversation…</p> : messages.length ? messages.map((message) => renderMessage(message)) : <p className="text-center text-sm text-slate-500">Start this conversation.</p>}
            </div>
            <div aria-live="polite" className="min-h-6 text-xs text-slate-500">{activeTyping.length ? `${activeTyping.join(", ")} ${activeTyping.length === 1 ? "is" : "are"} typing…` : ""}</div>
            <form onSubmit={(event) => void sendMessage(event)} className="flex gap-2"><textarea value={draft} onChange={(event) => draftChanged(event.target.value)} rows={2} maxLength={12000} aria-label="Message" placeholder="Write a message" className="min-w-0 flex-1 resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3" /><button disabled={!draft.trim() || pending === "message:send" || selected.isArchived} className="rounded-2xl bg-[#009A44] px-5 font-bold text-white disabled:opacity-50">Send</button></form>
          </> : <p className="m-auto text-slate-500">Select a channel to begin.</p>}
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-4">
          {threadRoot ? <><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-[#0F4C5C]">Thread</h2><button type="button" onClick={() => { setThreadRoot(null); setThreadReplies([]); }} className="text-sm font-bold text-slate-500">Close</button></div><div className="mt-4 space-y-3">{renderMessage(threadRoot, true)}{threadReplies.map((message) => renderMessage(message, true))}</div><form onSubmit={(event) => void sendMessage(event, threadRoot.id)} className="mt-4 grid gap-2"><textarea value={threadDraft} onChange={(event) => draftChanged(event.target.value, true)} rows={3} maxLength={12000} aria-label="Thread reply" placeholder="Reply in thread" className="resize-none rounded-2xl border border-slate-300 px-4 py-3" /><button disabled={!threadDraft.trim() || pending === "thread:send"} className="rounded-2xl bg-[#0F4C5C] py-3 font-bold text-white disabled:opacity-50">Reply</button></form></> : <><h2 className="text-lg font-bold text-[#0F4C5C]">Members and read state</h2><div className="mt-4 grid gap-3">{members.map((member) => <div key={member.userId} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-[#0F4C5C]">{member.user.displayName}</strong><span className="text-xs font-bold text-slate-500">{member.role}</span></div><p className="mt-1 text-xs text-slate-500">Read through #{member.lastReadSequence}</p></div>)}</div></>}
        </aside>
      </div>
    </main>
  );
}
