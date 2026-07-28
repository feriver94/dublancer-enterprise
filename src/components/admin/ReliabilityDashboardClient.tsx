"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import { brand } from "@/constants/design";

type Dashboard = {
  health: {
    database: { status: string; latencyMs: number };
    redis: { status: string };
    cache: {
      strategy: string;
      circuitOpen: boolean;
      localEntries: number;
    };
    activeWorkers: number;
  };
  queueGroups: Array<{
    queue: string;
    status: string;
    _count: { _all: number };
    _min: { availableAt?: string | null };
  }>;
  objectives: Array<{
    id: string;
    name: string;
    indicatorType: string;
    target: number;
    measurements: Array<{
      status: string;
      observedValue?: number | null;
      errorBudgetUsed?: number | null;
    }>;
  }>;
  hooks: Array<{ id: string; name: string; type: string; enabled: boolean }>;
  exportDestinations: Array<{
    id: string;
    name: string;
    type: string;
    runs: Array<{ status: string; eventCount: number }>;
  }>;
  scalingPolicies: Array<{
    id: string;
    queue: string;
    minWorkers: number;
    maxWorkers: number;
  }>;
  recommendations: Array<{
    id: string;
    queue: string;
    currentWorkers: number;
    desiredWorkers: number;
    reason: string;
  }>;
  profiles: Array<{
    id: string;
    operation: string;
    status: string;
    durationMs?: number | null;
  }>;
  loadTests: Array<{
    id: string;
    name: string;
    status: string;
    p95LatencyMs?: number | null;
  }>;
};

const field = {
  width: "100%",
  padding: "11px 12px",
  border: `1px solid ${brand.colors.border}`,
  borderRadius: brand.radius.md,
  background: brand.colors.white,
};

export function ReliabilityDashboardClient({
  canManage,
}: {
  canManage: boolean;
}) {
  const t = useTranslations("Reliability");
  const common = useTranslations("Common");
  const dashboard = useApiResource<Dashboard>("/api/observability/dashboard");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function mutate(label: string, operation: () => Promise<unknown>) {
    setPending(label);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(common("completed"));
      await dashboard.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("requestFailed"));
    } finally {
      setPending("");
    }
  }

  async function createDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("destination", () =>
      apiMutation("/api/observability/dashboard", "POST", {
        action: "auditDestination.create",
        name: String(values.get("name")),
        type: "WEBHOOK",
        endpoint: String(values.get("endpoint")),
        secret: String(values.get("secret")),
      }),
    );
    form.reset();
  }

  async function createScalingPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("scaling", () =>
      apiMutation("/api/observability/dashboard", "POST", {
        action: "scalingPolicy.upsert",
        queue: String(values.get("queue")),
        minWorkers: Number(values.get("minWorkers")),
        maxWorkers: Number(values.get("maxWorkers")),
        targetJobsPerWorker: 10,
        targetOldestJobAgeMs: 30000,
      }),
    );
    form.reset();
  }

  if (dashboard.loading) return <p>{common("loading")}</p>;

  const health = dashboard.data?.health;
  return (
    <main style={{ padding: "64px 0 96px", display: "grid", gap: 24 }}>
      <div>
        <Badge variant="success">{t("eyebrow")}</Badge>
        <h1 style={{ color: brand.colors.navy, fontSize: 40, margin: "16px 0 10px" }}>
          {t("title")}
        </h1>
        <p style={{ color: brand.colors.muted, maxWidth: 840 }}>{t("description")}</p>
      </div>
      {(notice || error || dashboard.error) && (
        <Card variant="glass">
          <strong style={{ color: error ? "#B42318" : brand.colors.green }}>
            {error || dashboard.error || notice}
          </strong>
        </Card>
      )}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
        {[
          [t("database"), health?.database.status ?? "unknown"],
          [t("redis"), health?.redis.status ?? "unknown"],
          [t("cache"), health?.cache.circuitOpen ? t("failover") : t("primary")],
          [t("workers"), health?.activeWorkers ?? 0],
          [t("slos"), dashboard.data?.objectives.length ?? 0],
          [t("alerts"), dashboard.data?.hooks.length ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)} variant="glass">
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ display: "block", fontSize: 25, color: brand.colors.navy, marginTop: 8 }}>{value}</strong>
          </Card>
        ))}
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 20 }}>
        <Card variant="elevated">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 style={{ color: brand.colors.navy }}>{t("sloDashboard")}</h2>
            {canManage && <Button disabled={Boolean(pending)} onClick={() => mutate("slo", () => apiMutation("/api/observability/dashboard", "POST", { action: "slo.evaluate" }))}>{t("evaluate")}</Button>}
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {(dashboard.data?.objectives ?? []).map((objective) => {
              const measurement = objective.measurements[0];
              return (
                <div key={objective.id} style={{ padding: 12, border: `1px solid ${brand.colors.border}`, borderRadius: brand.radius.md }}>
                  <strong style={{ color: brand.colors.navy }}>{objective.name}</strong>
                  <div style={{ color: brand.colors.muted }}>{objective.indicatorType} · {t("target")} {objective.target} · {measurement?.status ?? "NO_DATA"}</div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card variant="elevated">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 style={{ color: brand.colors.navy }}>{t("queueScaling")}</h2>
            {canManage && <Button variant="outline" onClick={() => mutate("scale", () => apiMutation("/api/observability/dashboard", "POST", { action: "scaling.evaluate" }))}>{t("evaluate")}</Button>}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {(dashboard.data?.queueGroups ?? []).map((row) => (
              <div key={`${row.queue}-${row.status}`}>{row.queue} · {row.status} · {row._count._all}</div>
            ))}
            {(dashboard.data?.recommendations ?? []).map((row) => (
              <div key={row.id} style={{ color: brand.colors.green }}>
                {row.queue}: {row.currentWorkers} → {row.desiredWorkers}
              </div>
            ))}
          </div>
          {canManage && (
            <form onSubmit={createScalingPolicy} style={{ display: "grid", gap: 10, marginTop: 16 }}>
              <input required name="queue" placeholder={t("queue")} style={field} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input required name="minWorkers" type="number" min="0" defaultValue="1" style={field} />
                <input required name="maxWorkers" type="number" min="1" defaultValue="10" style={field} />
              </div>
              <Button type="submit">{t("savePolicy")}</Button>
            </form>
          )}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("auditExport")}</h2>
          {(dashboard.data?.exportDestinations ?? []).map((destination) => (
            <div key={destination.id} style={{ padding: 10, borderBottom: `1px solid ${brand.colors.border}` }}>
              <strong>{destination.name}</strong> · {destination.type}
              {canManage && <Button variant="outline" onClick={() => mutate("export", () => apiMutation("/api/observability/dashboard", "POST", { action: "auditExport.run", destinationId: destination.id }))}>{t("exportNow")}</Button>}
            </div>
          ))}
          {canManage && (
            <form onSubmit={createDestination} style={{ display: "grid", gap: 10, marginTop: 16 }}>
              <input required name="name" placeholder={t("destinationName")} style={field} />
              <input required name="endpoint" type="url" placeholder={t("endpoint")} style={field} />
              <input required name="secret" type="password" minLength={16} placeholder={t("signingSecret")} style={field} />
              <Button type="submit">{t("addDestination")}</Button>
            </form>
          )}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("profilingLoadTests")}</h2>
          <p style={{ color: brand.colors.muted }}>{t("cacheStrategy", { strategy: health?.cache.strategy ?? "n/a" })}</p>
          <div style={{ display: "grid", gap: 8 }}>
            {(dashboard.data?.profiles ?? []).slice(0, 8).map((profile) => (
              <div key={profile.id}>{profile.operation} · {profile.status} · {profile.durationMs ?? 0} ms</div>
            ))}
            {(dashboard.data?.loadTests ?? []).map((run) => (
              <div key={run.id}>{run.name} · {run.status} · P95 {run.p95LatencyMs ?? 0} ms</div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
