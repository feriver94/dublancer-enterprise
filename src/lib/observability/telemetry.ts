import {
  context,
  metrics,
  propagation,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import type { Attributes } from "@opentelemetry/api";

const globalTelemetry = globalThis as unknown as {
  dublancerTelemetryStarted?: boolean;
};

function exporterHeaders() {
  const configured = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  if (!configured) return undefined;
  return Object.fromEntries(
    configured.split(",").flatMap((entry) => {
      const [key, ...value] = entry.split("=");
      return key && value.length
        ? [[key.trim(), decodeURIComponent(value.join("=").trim())]]
        : [];
    }),
  );
}

export async function registerTelemetry() {
  if (globalTelemetry.dublancerTelemetryStarted) return;
  globalTelemetry.dublancerTelemetryStarted = true;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;

  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { OTLPMetricExporter },
    { resourceFromAttributes },
    { PeriodicExportingMetricReader },
  ] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/exporter-metrics-otlp-http"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/sdk-metrics"),
  ]);
  const base = endpoint.replace(/\/$/, "");
  const headers = exporterHeaders();
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name":
        process.env.OTEL_SERVICE_NAME ?? "dublancer-enterprise",
      "service.version": process.env.APP_VERSION ?? "1.0.0",
      "deployment.environment.name":
        process.env.DEPLOYMENT_ENVIRONMENT ??
        process.env.NODE_ENV ??
        "development",
      "cloud.region": process.env.DEPLOYMENT_REGION ?? "unknown",
    }),
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
        `${base}/v1/traces`,
      headers,
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url:
            process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ??
            `${base}/v1/metrics`,
          headers,
        }),
        exportIntervalMillis: Number(
          process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 60_000,
        ),
      }),
    ],
  });
  sdk.start();
}

export const tracer = trace.getTracer("dublancer-enterprise", "1.0.0");
export const meter = metrics.getMeter("dublancer-enterprise", "1.0.0");

export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  operation: () => Promise<T>,
) {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(
        error instanceof Error ? error : new Error("Unknown operation error"),
      );
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

export async function withRequestSpan<T>(
  name: string,
  request: Request,
  attributes: Attributes,
  operation: () => Promise<T>,
) {
  const carrier = Object.fromEntries(request.headers.entries());
  const parent = propagation.extract(context.active(), carrier);
  return context.with(parent, () =>
    withSpan(
      name,
      {
        "http.request.method": request.method,
        ...attributes,
      },
      operation,
    ),
  );
}
