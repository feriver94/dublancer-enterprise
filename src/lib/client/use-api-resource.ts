"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGetWithMeta } from "@/lib/client/api-client";

export function useApiResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!path) {
      setData(null);
      setMeta({});
      setLoading(false);
      return null;
    }

    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const next = await apiGetWithMeta<T>(path);
      if (requestId.current === currentRequest) {
        setData(next.data);
        setMeta(next.meta);
      }
      return next.data;
    } catch (reason) {
      if (requestId.current === currentRequest) {
        setError(reason instanceof Error ? reason.message : "Request failed.");
      }
      return null;
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [refresh]);

  return { data, setData, meta, loading, error, refresh };
}
