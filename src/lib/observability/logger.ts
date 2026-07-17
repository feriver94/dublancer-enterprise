const sensitive = /authorization|cookie|password|secret|token|api[-_]?key|session/i;

function sanitize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sensitive.test(key) ? "[REDACTED]" : sanitize(nested)]));
  return value;
}

function write(level: "info" | "warn" | "error", event: string, attributes: Record<string, unknown> = {}) {
  const record = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...sanitize(attributes) as Record<string, unknown> });
  if (level === "error") console.error(record); else if (level === "warn") console.warn(record); else console.info(record);
}

export const logger = {
  info: (event: string, attributes?: Record<string, unknown>) => write("info", event, attributes),
  warn: (event: string, attributes?: Record<string, unknown>) => write("warn", event, attributes),
  error: (event: string, attributes?: Record<string, unknown>) => write("error", event, attributes),
};
