"use client";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  meta?: Record<string, unknown>;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "REQUEST_FAILED",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

let csrfPromise: Promise<string> | null = null;

async function csrfToken(): Promise<string> {
  csrfPromise ??= fetch("/api/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  })
    .then(async (response) => {
      const body = (await response.json()) as ApiEnvelope<{ csrfToken: string }>;
      if (!response.ok || !body.data?.csrfToken) {
        throw new ApiClientError(
          body.error?.message ?? "Unable to establish a secure request.",
          response.status,
          body.error?.code,
          body.error?.details,
        );
      }
      return body.data.csrfToken;
    })
    .catch((error) => {
      csrfPromise = null;
      throw error;
    });
  return csrfPromise;
}

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok) {
    throw new ApiClientError(
      body.error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      body.error?.code,
      body.error?.details,
    );
  }
  return body.data as T;
}

async function parseWithMeta<T>(response: Response): Promise<{
  data: T;
  meta: Record<string, unknown>;
}> {
  const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok) {
    throw new ApiClientError(
      body.error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      body.error?.code,
      body.error?.details,
    );
  }
  return { data: body.data as T, meta: body.meta ?? {} };
}

export async function apiGet<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return parse<T>(
    await fetch(path, {
      ...init,
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json", ...init.headers },
    }),
  );
}

export async function apiGetWithMeta<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; meta: Record<string, unknown> }> {
  return parseWithMeta<T>(
    await fetch(path, {
      ...init,
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json", ...init.headers },
    }),
  );
}

export async function apiMutation<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const execute = async () =>
    fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token": await csrfToken(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  let response = await execute();
  if (response.status === 403) {
    csrfPromise = null;
    response = await execute();
  }
  return parse<T>(response);
}

export function resetApiClientCsrf(): void {
  csrfPromise = null;
}
