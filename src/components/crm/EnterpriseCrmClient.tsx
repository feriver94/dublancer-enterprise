"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import { brand } from "@/constants/design";

type Dashboard = {
  pipelines: Array<{
    id: string;
    name: string;
    stages: Array<{ id: string; name: string; probability: number; _count: { opportunities: number } }>;
  }>;
  leads: Array<{ id: string; firstName: string; lastName: string; companyName?: string | null; status: string; score: number }>;
  accounts: Array<{
    id: string;
    name: string;
    status: string;
    industry?: string | null;
    contacts: Array<{ id: string; firstName: string; lastName: string; email?: string | null }>;
    healthSnapshots: Array<{ score: number; band: string }>;
    _count: { contacts: number; opportunities: number; quotes: number };
  }>;
  opportunities: Array<{
    id: string;
    name: string;
    status: string;
    amountMinor: string;
    currency: string;
    account: { name: string };
    stage: { name: string };
  }>;
  activities: Array<{ id: string; type: string; subject: string; occurredAt: string; account?: { name: string } | null }>;
  quotes: Array<{ id: string; quoteNumber: string; status: string; totalMinor: string; currency: string; account: { name: string } }>;
  analytics: {
    openPipelineValueMinor: string;
    openOpportunities: number;
    health: Array<{ band: string; _count: number }>;
  };
};

const field = {
  width: "100%",
  border: `1px solid ${brand.colors.border}`,
  borderRadius: brand.radius.md,
  padding: "11px 12px",
  background: brand.colors.white,
  color: brand.colors.navy,
};

export function EnterpriseCrmClient({ canManage }: { canManage: boolean }) {
  const t = useTranslations("Phase9CRM");
  const common = useTranslations("Common");
  const dashboard = useApiResource<Dashboard>("/api/crm/overview");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function mutate(label: string, operation: () => Promise<unknown>) {
    setPending(label);
    setNotice("");
    setError("");
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

  async function createPipeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("pipeline", () =>
      apiMutation("/api/crm/overview", "POST", {
        action: "pipeline.create",
        name: String(values.get("name")),
        description: String(values.get("description") ?? ""),
        isDefault: dashboard.data?.pipelines.length === 0,
        stages: [
          { name: "Lead", probability: 10, category: "OPEN" },
          { name: "Qualified", probability: 35, category: "OPEN" },
          { name: "Proposal", probability: 70, category: "OPEN" },
          { name: "Won", probability: 100, category: "WON" },
          { name: "Lost", probability: 0, category: "LOST" },
        ],
      }),
    );
    form.reset();
  }

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("lead", () =>
      apiMutation("/api/crm/overview", "POST", {
        action: "lead.create",
        firstName: String(values.get("firstName")),
        lastName: String(values.get("lastName")),
        email: String(values.get("email") || "") || undefined,
        companyName: String(values.get("company") || "") || undefined,
        source: String(values.get("source") || "") || undefined,
        score: 25,
      }),
    );
    form.reset();
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("account", () =>
      apiMutation("/api/crm/overview", "POST", {
        action: "account.create",
        name: String(values.get("name")),
        industry: String(values.get("industry") || "") || undefined,
        countryCode: "AE",
      }),
    );
    form.reset();
  }

  if (dashboard.loading) return <p>{common("loading")}</p>;
  const data = dashboard.data;

  return (
    <main style={{ padding: "64px 0 96px", display: "grid", gap: 24 }}>
      <div>
        <Badge variant="success">{t("eyebrow")}</Badge>
        <h1 style={{ color: brand.colors.navy, fontSize: 40, margin: "16px 0 10px" }}>{t("title")}</h1>
        <p style={{ color: brand.colors.muted, maxWidth: 860 }}>{t("description")}</p>
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
          [t("accounts"), data?.accounts.length ?? 0],
          [t("leads"), data?.leads.length ?? 0],
          [t("opportunities"), data?.analytics.openOpportunities ?? 0],
          [t("pipelineValue"), `${data?.analytics.openPipelineValueMinor ?? "0"} AED`],
          [t("quotes"), data?.quotes.length ?? 0],
          [t("health"), data?.analytics.health.map((row) => `${row.band}:${row._count}`).join(" · ") || "—"],
        ].map(([label, value]) => (
          <Card key={String(label)} variant="glass">
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ display: "block", color: brand.colors.navy, fontSize: 24, marginTop: 8 }}>{value}</strong>
          </Card>
        ))}
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 20 }}>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("pipelines")}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {(data?.pipelines ?? []).map((pipeline) => (
              <div key={pipeline.id} style={{ border: `1px solid ${brand.colors.border}`, borderRadius: brand.radius.md, padding: 12 }}>
                <strong>{pipeline.name}</strong>
                <div style={{ color: brand.colors.muted, marginTop: 6 }}>
                  {pipeline.stages.map((stage) => `${stage.name} (${stage._count.opportunities})`).join(" → ")}
                </div>
              </div>
            ))}
            {!data?.pipelines.length && <p>{t("noData")}</p>}
          </div>
          {canManage && (
            <form onSubmit={createPipeline} style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <h3>{t("newPipeline")}</h3>
              <input required name="name" placeholder={t("name")} style={field} />
              <textarea name="description" placeholder={t("descriptionLabel")} style={field} />
              <small style={{ color: brand.colors.muted }}>{t("defaultStages")}</small>
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
          )}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("customerDirectory")}</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {(data?.accounts ?? []).map((account) => (
              <div key={account.id} style={{ borderBottom: `1px solid ${brand.colors.border}`, paddingBottom: 10 }}>
                <strong>{account.name}</strong>
                <div style={{ color: brand.colors.muted }}>
                  {account.status} · {account.industry ?? "—"} · {account._count.contacts} {t("accounts").toLocaleLowerCase()}
                  {account.healthSnapshots[0] ? ` · ${account.healthSnapshots[0].band} ${account.healthSnapshots[0].score}` : ""}
                </div>
              </div>
            ))}
          </div>
          {canManage && (
            <form onSubmit={createAccount} style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <h3>{t("newAccount")}</h3>
              <input required name="name" placeholder={t("name")} style={field} />
              <input name="industry" placeholder={t("industry")} style={field} />
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
          )}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("opportunities")}</h2>
          {(data?.opportunities ?? []).map((opportunity) => (
            <div key={opportunity.id} style={{ borderBottom: `1px solid ${brand.colors.border}`, padding: "10px 0" }}>
              <strong>{opportunity.name}</strong>
              <div style={{ color: brand.colors.muted }}>
                {opportunity.account.name} · {opportunity.stage.name} · {opportunity.amountMinor} {opportunity.currency}
              </div>
            </div>
          ))}
          {!data?.opportunities.length && <p>{t("noData")}</p>}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("recentActivities")}</h2>
          {(data?.activities ?? []).slice(0, 12).map((activity) => (
            <div key={activity.id} style={{ borderBottom: `1px solid ${brand.colors.border}`, padding: "9px 0" }}>
              <strong>{activity.subject}</strong>
              <div style={{ color: brand.colors.muted }}>{activity.type} · {activity.account?.name ?? "—"}</div>
            </div>
          ))}
        </Card>
        {canManage && (
          <Card variant="elevated">
            <h2 style={{ color: brand.colors.navy }}>{t("newLead")}</h2>
            <form onSubmit={createLead} style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input required name="firstName" placeholder={t("firstName")} style={field} />
                <input required name="lastName" placeholder={t("lastName")} style={field} />
              </div>
              <input name="email" type="email" placeholder={t("email")} style={field} />
              <input name="company" placeholder={t("company")} style={field} />
              <input name="source" placeholder={t("source")} style={field} />
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
          </Card>
        )}
      </section>
    </main>
  );
}
