"use client";

export type ChatRealtimeEnvelope = {
  id: string;
  eventType: string;
  organizationId: string;
  projectId?: string | null;
  actorUserId?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

type ChatStreamHandlers = {
  onConnected?: (data: { topics: string[]; connectedAt: string }) => void;
  onEvent: (event: ChatRealtimeEnvelope) => void;
  onError?: (event: Event) => void;
};

export function subscribeToChatChannel(
  channelId: string,
  handlers: ChatStreamHandlers,
) {
  const stream = new EventSource(
    `/api/realtime/stream?channelId=${encodeURIComponent(channelId)}`,
    { withCredentials: true },
  );

  stream.addEventListener("connected", (event) => {
    handlers.onConnected?.(JSON.parse((event as MessageEvent<string>).data));
  });
  stream.addEventListener("message", (event) => {
    const envelope = JSON.parse((event as MessageEvent<string>).data) as
      ChatRealtimeEnvelope & { channel?: string };
    handlers.onEvent(envelope);
  });
  if (handlers.onError) stream.addEventListener("error", handlers.onError);

  return () => stream.close();
}

async function csrfToken() {
  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to establish CSRF protection.");
  const payload = (await response.json()) as { data?: { csrfToken?: string } };
  if (!payload.data?.csrfToken) throw new Error("CSRF token was not returned.");
  return payload.data.csrfToken;
}

export async function chatMutation<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
) {
  const token = await csrfToken();
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": token,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    data?: T;
    error?: { code: string; message: string };
  };
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? "Chat request failed.");
  }
  return payload.data as T;
}
