"use client";

import { useEffect, useState } from "react";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  actionUrl: string | null;
  status: "UNREAD" | "READ" | "ARCHIVED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  createdAt: string;
};

type NotificationsResponse = {
  data?: NotificationItem[];
};

const REFRESH_INTERVAL_MS = 30_000;

export default function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function refresh() {
      try {
        const response = await fetch("/api/notifications?take=25", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load notifications.");
        }

        const payload = (await response.json()) as NotificationsResponse;
        if (!active) return;

        setItems(payload.data ?? []);
        setError(null);
      } catch (requestError) {
        if (!active || controller.signal.aborted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load notifications.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const refreshTimer = window.setInterval(
      () => void refresh(),
      REFRESH_INTERVAL_MS,
    );

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(initialLoad);
      window.clearInterval(refreshTimer);
    };
  }, []);

  if (loading) {
    return (
      <div role="status" aria-live="polite">
        Loading notifications…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert">
        {error}
      </div>
    );
  }

  return (
    <section aria-labelledby="notification-center-title">
      <h2 id="notification-center-title">Notifications</h2>
      {items.length === 0 ? (
        <p>You’re all caught up.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li
              key={item.id}
              data-status={item.status}
              data-priority={item.priority}
            >
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              {item.actionUrl ? <a href={item.actionUrl}>Open</a> : null}
              <time dateTime={item.createdAt}>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(item.createdAt))}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
