"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import { brand } from "@/constants/design";

type Dashboard = {
  connectors: Array<{ id: string; name: string; key: string; type: string; status: string; baseUrl: string; method: string; path: string; authType: string; _count: { runs: number; subscriptions: number } }>;
  apiKeys: Array<{ id: string; name: string; prefix: string; scopes: string[]; status: string; lastUsedAt?: string | null }>;
  oauth: Array<{ id: string; provider: string; name: string; status: string; tokenExpiresAt?: string | null }>;
  webhooks: Array<{ id: string; name: string; url: string; status: string; eventTypes: string[]; lastSuccessAt?: string | null; lastFailureAt?: string | null; _count: { deliveries: number; subscriptions: number } }>;
  subscriptions: Array<{ id: string; eventType: string; enabled: boolean; endpoint?: { name: string } | null; connector?: { name: string } | null }>;
  events: Array<{ id: string; eventType: string; aggregateType: string; status: string; occurredAt: string; _count: { deliveries: number } }>;
  deliveries: Array<{ id: string; status: string; attempts: number; maxAttempts: number; lastError?: string | null; endpoint: { name: string }; event: { eventType: string } }>;
  runs: Array<{ id: string; status: string; attempts: number; lastError?: string | null; connector: { name: string; type: string } }>;
  monitoring: { deliveryCounts: Array<{ status: string; _count: number }>; runCounts: Array<{ status: string; _count: number }> };
};

const field = {
  width: "100%",
  border: `1px solid ${brand.colors.border}`,
  borderRadius: brand.radius.md,
  padding: "11px 12px",
  background: brand.colors.white,
  color: brand.colors.navy,
};

export function EnterpriseIntegrationsClient({
  canManage,
  canExecute,
}: {
  canManage: boolean;
  canExecute: boolean;
}) {
  const t = useTranslations("Phase9Integrations");
  const common = useTranslations("Common");
  const dashboard = useApiResource<Dashboard>("/api/integrations/overview");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");

  async function mutate(label: string, operation: () => Promise<unknown>) {
    setPending(label);
    setNotice("");
    setError("");
    try {
      const result = await operation();
      setNotice(common("completed"));
      await dashboard.refresh();
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("requestFailed"));
      return null;
    } finally {
      setPending("");
    }
  }

  async function createConnector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("connector", () =>
      apiMutation("/api/integrations/overview", "POST", {
        action: "connector.create",
        name: String(values.get("name")),
        key: String(values.get("key")),
        type: String(values.get("type")),
        baseUrl: String(values.get("baseUrl")),
        method: "POST",
        path: String(values.get("path") || "/"),
        authType: "NONE",
        activate: true,
      }),
    );
    form.reset();
  }

  async function createApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = (await mutate("apiKey", () =>
      apiMutation("/api/integrations/overview", "POST", {
        action: "apiKey.create",
        name: String(new FormData(form).get("name")),
        scopes: ["events.publish", "connectors.execute", "monitoring.read"],
      }),
    )) as { secret?: string } | null;
    if (result?.secret) setSecret(result.secret);
    form.reset();
  }

  async function createWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const eventTypes = String(values.get("eventTypes"))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const result = (await mutate("webhook", () =>
      apiMutation("/api/integrations/overview", "POST", {
        action: "webhook.create",
        name: String(values.get("name")),
        url: String(values.get("url")),
        eventTypes,
        maxAttempts: 5,
        timeoutMs: 10_000,
      }),
    )) as { endpoint?: { id: string }; secret?: string } | null;
    if (result?.secret) setSecret(result.secret);
    if (result?.endpoint?.id) {
      for (const eventType of eventTypes) {
        await mutate(`subscription-${eventType}`, () =>
          apiMutation("/api/integrations/overview", "POST", {
            action: "subscription.create",
            endpointId: result.endpoint?.id,
            eventType,
          }),
        );
      }
    }
    form.reset();
  }

  async function publishTestEvent() {
    await mutate("event", () =>
      apiMutation("/api/integrations/overview", "POST", {
        action: "event.publish",
        eventType: "crm.account.updated",
        aggregateType: "CrmAccount",
        aggregateId: `ui-${Date.now()}`,
        payload: { source: "integration-control-plane", testedAt: new Date().toISOString() },
        correlationId: `ui-${Date.now()}`,
      }),
    );
  }

  if (dashboard.loading) return <p>{common("loading")}</p>;
  const data = dashboard.data;

  return (
    <main style={{ padding: "64px 0 96px", display: "grid", gap: 24 }}>
      <div>
        <Badge variant="success">{t("eyebrow")}</Badge>
        <h1 style={{ color: brand.colors.navy, fontSize: 40, margin: "16px 0 10px" }}>{t("title")}</h1>
        <p style={{ color: brand.colors.muted, maxWidth: 880 }}>{t("description")}</p>
      </div>
      {(notice || error || dashboard.error) && (
        <Card variant="glass">
          <strong style={{ color: error ? "#B42318" : brand.colors.green }}>
            {error || dashboard.error || notice}
          </strong>
        </Card>
      )}
      {secret && (
        <Card variant="glass">
          <strong>{t("secretNotice")}</strong>
          <code style={{ display: "block", marginTop: 8, overflowWrap: "anywhere" }}>{secret}</code>
        </Card>
      )}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
        {[
          [t("connectors"), data?.connectors.length ?? 0],
          [t("apiKeys"), data?.apiKeys.filter((row) => row.status === "ACTIVE").length ?? 0],
          [t("oauth"), data?.oauth.length ?? 0],
          [t("webhooks"), data?.webhooks.length ?? 0],
          [t("deliveries"), data?.deliveries.length ?? 0],
          [t("runs"), data?.runs.length ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)} variant="glass">
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ display: "block", color: brand.colors.navy, fontSize: 26, marginTop: 8 }}>{value}</strong>
          </Card>
        ))}
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(350px,1fr))", gap: 20 }}>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("connectors")}</h2>
          {(data?.connectors ?? []).map((connector) => (
            <div key={connector.id} style={{ borderBottom: `1px solid ${brand.colors.border}`, padding: "10px 0" }}>
              <strong>{connector.name}</strong>
              <div style={{ color: brand.colors.muted }}>{connector.type} · {connector.status} · {connector.method} {connector.path}</div>
              <small>{connector._count.runs} {t("runs").toLocaleLowerCase()} · {connector._count.subscriptions} {t("events").toLocaleLowerCase()}</small>
            </div>
          ))}
          {!data?.connectors.length && <p>{t("noData")}</p>}
          {canManage && (
            <form onSubmit={createConnector} style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <h3>{t("newConnector")}</h3>
              <input required name="name" placeholder={t("name")} style={field} />
              <input required name="key" placeholder={t("key")} style={field} />
              <select name="type" style={field} defaultValue="REST">
                <option value="REST">REST</option>
                <option value="IMPORT">IMPORT</option>
                <option value="EXPORT">EXPORT</option>
              </select>
              <input required name="baseUrl" type="url" placeholder={t("baseUrl")} style={field} />
              <input required name="path" defaultValue="/" placeholder={t("path")} style={field} />
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
          )}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("webhooks")}</h2>
          {(data?.webhooks ?? []).map((webhook) => (
            <div key={webhook.id} style={{ borderBottom: `1px solid ${brand.colors.border}`, padding: "10px 0" }}>
              <strong>{webhook.name}</strong>
              <div style={{ color: brand.colors.muted }}>{webhook.status} · {webhook.eventTypes.join(", ")}</div>
              <small>{webhook._count.deliveries} {t("deliveries").toLocaleLowerCase()}</small>
            </div>
          ))}
          {canManage && (
            <form onSubmit={createWebhook} style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <h3>{t("newWebhook")}</h3>
              <input required name="name" placeholder={t("name")} style={field} />
              <input required name="url" type="url" placeholder={t("endpoint")} style={field} />
              <input required name="eventTypes" defaultValue="crm.account.updated" placeholder={t("eventTypes")} style={field} />
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
          )}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("apiKeys")}</h2>
          {(data?.apiKeys ?? []).map((key) => (
            <div key={key.id} style={{ padding: "9px 0", borderBottom: `1px solid ${brand.colors.border}` }}>
              <strong>{key.name}</strong>
              <div style={{ color: brand.colors.muted }}>{key.prefix} · {key.status} · {key.scopes.join(", ")}</div>
            </div>
          ))}
          {canManage && (
            <form onSubmit={createApiKey} style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <h3>{t("newApiKey")}</h3>
              <input required name="name" placeholder={t("name")} style={field} />
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
          )}
        </Card>
        <Card variant="elevated">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <h2 style={{ color: brand.colors.navy }}>{t("monitoring")}</h2>
            {canExecute && <Button variant="outline" disabled={Boolean(pending)} onClick={() => void publishTestEvent()}>{t("events")}</Button>}
          </div>
          {(data?.deliveries ?? []).map((delivery) => (
            <div key={delivery.id} style={{ padding: "10px 0", borderBottom: `1px solid ${brand.colors.border}` }}>
              <strong>{delivery.event.eventType} · {delivery.endpoint.name}</strong>
              <div style={{ color: brand.colors.muted }}>{delivery.status} · {delivery.attempts}/{delivery.maxAttempts}</div>
              {delivery.lastError && <small style={{ color: "#B42318" }}>{delivery.lastError}</small>}
              {canManage && ["RETRYING", "FAILED", "DEAD_LETTER"].includes(delivery.status) && (
                <div style={{ marginTop: 8 }}><Button variant="outline" onClick={() => void mutate(`retry-${delivery.id}`, () => apiMutation("/api/integrations/overview", "POST", { action: "delivery.retry", deliveryId: delivery.id }))}>{t("retry")}</Button></div>
              )}
            </div>
          ))}
        </Card>
      </section>
    </main>
  );
}
