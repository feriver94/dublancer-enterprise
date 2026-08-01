import { meter } from "@/lib/observability/telemetry";
import type {
  Counter,
  Histogram as OtelHistogram,
  UpDownCounter,
} from "@opentelemetry/api";

type Labels = Record<string, string | number | boolean | undefined>;
type Histogram = {
  count: number;
  sum: number;
  buckets: Map<number, number>;
};

const histogramBounds = [5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000];
const globalMetrics = globalThis as unknown as {
  dublancerCounters?: Map<string, number>;
  dublancerHistograms?: Map<string, Histogram>;
  dublancerGauges?: Map<string, number>;
};
const counters =
  globalMetrics.dublancerCounters ?? new Map<string, number>();
const histograms =
  globalMetrics.dublancerHistograms ?? new Map<string, Histogram>();
const gauges = globalMetrics.dublancerGauges ?? new Map<string, number>();
const otelCounters = new Map<string, Counter>();
const otelHistograms = new Map<string, OtelHistogram>();
const otelGauges = new Map<string, UpDownCounter>();

globalMetrics.dublancerCounters = counters;
globalMetrics.dublancerHistograms = histograms;
globalMetrics.dublancerGauges = gauges;

function normalizedLabels(labels: Labels = {}) {
  return Object.entries(labels)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(",");
}

function metricAttributes(labels: Labels = {}) {
  return Object.fromEntries(
    Object.entries(labels).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean>;
}

function key(name: string, labels?: Labels) {
  return `${name}|${normalizedLabels(labels)}`;
}

function prometheusLabels(serialized: string) {
  if (!serialized) return "";
  const labels = serialized
    .split(",")
    .map((entry) => {
      const [name, ...value] = entry.split("=");
      return `${name}="${value.join("=").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
    })
    .join(",");
  return `{${labels}}`;
}

export function incrementMetric(
  name: string,
  labels?: Labels,
  amount = 1,
) {
  const metricKey = key(name, labels);
  counters.set(metricKey, (counters.get(metricKey) ?? 0) + amount);
  const instrument =
    otelCounters.get(name) ?? meter.createCounter(name);
  otelCounters.set(name, instrument);
  instrument.add(amount, metricAttributes(labels));
}

export function observeMetric(
  name: string,
  value: number,
  labels?: Labels,
) {
  const metricKey = key(name, labels);
  const histogram = histograms.get(metricKey) ?? {
    count: 0,
    sum: 0,
    buckets: new Map(histogramBounds.map((bound) => [bound, 0])),
  };
  histogram.count += 1;
  histogram.sum += value;
  for (const bound of histogramBounds) {
    if (value <= bound) {
      histogram.buckets.set(bound, (histogram.buckets.get(bound) ?? 0) + 1);
    }
  }
  histograms.set(metricKey, histogram);
  const instrument =
    otelHistograms.get(name) ?? meter.createHistogram(name);
  otelHistograms.set(name, instrument);
  instrument.record(value, metricAttributes(labels));
}

export function setMetric(name: string, value: number, labels?: Labels) {
  const metricKey = key(name, labels);
  const previous = gauges.get(metricKey) ?? 0;
  gauges.set(metricKey, value);
  const instrument =
    otelGauges.get(name) ?? meter.createUpDownCounter(name);
  otelGauges.set(name, instrument);
  instrument.add(value - previous, metricAttributes(labels));
}

export function metricsSnapshot() {
  return {
    counters: Object.fromEntries(counters),
    gauges: Object.fromEntries(gauges),
    histograms: Object.fromEntries(
      [...histograms].map(([metricKey, value]) => [
        metricKey,
        {
          count: value.count,
          sum: value.sum,
          buckets: Object.fromEntries(value.buckets),
        },
      ]),
    ),
    collectedAt: new Date().toISOString(),
  };
}

export function prometheusMetrics() {
  const lines = [
    "# Dublancer Enterprise in-process metrics",
    `dublancer_process_start_time_seconds ${Math.floor((Date.now() - process.uptime() * 1_000) / 1_000)}`,
  ];
  for (const [metricKey, value] of counters) {
    const [name, serialized = ""] = metricKey.split("|");
    lines.push(`${name}${prometheusLabels(serialized)} ${value}`);
  }
  for (const [metricKey, value] of gauges) {
    const [name, serialized = ""] = metricKey.split("|");
    lines.push(`${name}${prometheusLabels(serialized)} ${value}`);
  }
  for (const [metricKey, histogram] of histograms) {
    const [name, serialized = ""] = metricKey.split("|");
    for (const [bound, count] of histogram.buckets) {
      const joined = serialized ? `${serialized},le=${bound}` : `le=${bound}`;
      lines.push(`${name}_bucket${prometheusLabels(joined)} ${count}`);
    }
    const infinity = serialized ? `${serialized},le=+Inf` : "le=+Inf";
    lines.push(
      `${name}_bucket${prometheusLabels(infinity)} ${histogram.count}`,
      `${name}_sum${prometheusLabels(serialized)} ${histogram.sum}`,
      `${name}_count${prometheusLabels(serialized)} ${histogram.count}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
