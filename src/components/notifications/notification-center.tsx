"use client";

import { useCallback, useEffect, useState } from "react";

type Notification = {
  id: string;
  title: string;
  body?: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: "UNREAD" | "READ" | "ARCHIVED";
  actionUrl?: string | null;
  createdAt: string;
};

export function NotificationCenter() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch("/api/notifications?take=25", {
      cache: "no-store",
    });

    if (!response.ok) return;

    const payload = await response.json();
    setItems(payload.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);

    const stream = new EventSource("/api/realtime/stream");

    stream.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.eventType === "notification.created") {
        void load();
      }
    });

    return () => {
      window.clearTimeout(initialLoad);
      stream.close();
    };
  }, [load]);

  if (loading) return <div aria-live="polite">Loading…</div>;

  return (
    <section aria-label="Notifications">
      {items.length === 0 ? (
        <p>No notifications.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} data-priority={item.priority}>
              <strong>{item.title}</strong>
              {item.body ? <p>{item.body}</p> : null}
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
