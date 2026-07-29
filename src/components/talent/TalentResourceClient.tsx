"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import { brand } from "@/constants/design";

type Dashboard = {
  members: Array<{ id: string; user: { displayName?: string | null; email: string }; role?: { name: string } | null }>;
  profiles: Array<{
    id: string;
    title: string;
    status: string;
    targetUtilizationPercent: number;
    membership: { user: { displayName?: string | null; email: string }; role?: { name: string } | null };
    skills: Array<{ proficiency: string; yearsExperience: number; skill: { nameEn: string; nameAr?: string | null } }>;
    certifications: Array<{ id: string; name: string; issuer: string; status: string }>;
    staffingAssignments: Array<{ id: string; allocationPercent: number; status: string; resourcePlan: { name: string } }>;
    benchEntries: Array<{ id: string; status: string; startedAt: string }>;
    performanceHistory: Array<{ id: string; rating: string; periodEnd: string }>;
  }>;
  plans: Array<{
    id: string;
    name: string;
    status: string;
    startsAt: string;
    endsAt: string;
    requirements: Array<{ id: string; roleTitle: string; status: string; requiredProfiles: number; filledProfiles: number }>;
    assignments: Array<{ id: string; allocationPercent: number; status: string; talentProfile: { membership: { user: { displayName?: string | null; email: string } } } }>;
  }>;
  skillsMatrix: Array<{ proficiency: string; _count: number; skill?: { nameEn: string; nameAr?: string | null } | null }>;
  analytics: {
    capacity: { _avg: { utilizationPercent?: number | null }; _sum: { availableHours?: number | null; allocatedHours?: number | null } };
    bench: Array<{ status: string; _count: number }>;
    performance: Array<{ rating: string; _count: number }>;
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

export function TalentResourceClient({ canManage }: { canManage: boolean }) {
  const t = useTranslations("Phase9Talent");
  const common = useTranslations("Common");
  const dashboard = useApiResource<Dashboard>("/api/talent/overview");
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

  async function upsertProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("profile", () =>
      apiMutation("/api/talent/overview", "POST", {
        action: "profile.upsert",
        membershipId: String(values.get("membershipId")),
        title: String(values.get("title")),
        summary: String(values.get("summary") || "") || undefined,
        status: "ACTIVE",
        timezone: "Asia/Dubai",
        currency: "AED",
        targetUtilizationPercent: 80,
      }),
    );
    form.reset();
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    await mutate("plan", () =>
      apiMutation("/api/talent/overview", "POST", {
        action: "plan.create",
        name: String(values.get("name")),
        startsAt: new Date(String(values.get("startsAt"))).toISOString(),
        endsAt: new Date(String(values.get("endsAt"))).toISOString(),
        activate: true,
      }),
    );
    form.reset();
  }

  if (dashboard.loading) return <p>{common("loading")}</p>;
  const data = dashboard.data;
  const benchCount =
    data?.analytics.bench
      .filter((row) => ["ON_BENCH", "PARTIALLY_ALLOCATED"].includes(row.status))
      .reduce((sum, row) => sum + row._count, 0) ?? 0;

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
          [t("profiles"), data?.profiles.length ?? 0],
          [t("plans"), data?.plans.length ?? 0],
          [t("utilization"), `${Math.round(data?.analytics.capacity._avg.utilizationPercent ?? 0)}%`],
          [t("bench"), benchCount],
          [t("skillsMatrix"), data?.skillsMatrix.length ?? 0],
          [t("performance"), data?.analytics.performance.reduce((sum, row) => sum + row._count, 0) ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)} variant="glass">
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ display: "block", fontSize: 26, color: brand.colors.navy, marginTop: 8 }}>{value}</strong>
          </Card>
        ))}
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 20 }}>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("profiles")}</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {(data?.profiles ?? []).map((profile) => (
              <div key={profile.id} style={{ border: `1px solid ${brand.colors.border}`, borderRadius: brand.radius.md, padding: 12 }}>
                <strong>{profile.membership.user.displayName ?? profile.membership.user.email}</strong>
                <div style={{ color: brand.colors.muted }}>{profile.title} · {profile.status} · {profile.targetUtilizationPercent}%</div>
                <small>{profile.skills.map((row) => `${row.skill.nameEn} (${row.proficiency})`).join(" · ") || "—"}</small>
              </div>
            ))}
            {!data?.profiles.length && <p>{t("noData")}</p>}
          </div>
          {canManage && (
            <form onSubmit={upsertProfile} style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <h3>{t("newProfile")}</h3>
              <select required name="membershipId" style={field} defaultValue="">
                <option value="" disabled>{t("member")}</option>
                {(data?.members ?? []).map((membership) => (
                  <option key={membership.id} value={membership.id}>
                    {membership.user.displayName ?? membership.user.email} · {membership.role?.name ?? "—"}
                  </option>
                ))}
              </select>
              <input required name="title" placeholder={t("titleLabel")} style={field} />
              <textarea name="summary" placeholder={t("summary")} style={field} />
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
          )}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("staffing")}</h2>
          {(data?.plans ?? []).map((plan) => (
            <div key={plan.id} style={{ borderBottom: `1px solid ${brand.colors.border}`, padding: "10px 0" }}>
              <strong>{plan.name}</strong>
              <div style={{ color: brand.colors.muted }}>{plan.status} · {plan.assignments.length} {t("profiles").toLocaleLowerCase()}</div>
              {plan.requirements.map((requirement) => (
                <small key={requirement.id} style={{ display: "block" }}>
                  {requirement.roleTitle}: {requirement.filledProfiles}/{requirement.requiredProfiles} · {requirement.status}
                </small>
              ))}
            </div>
          ))}
          {canManage && (
            <form onSubmit={createPlan} style={{ display: "grid", gap: 10, marginTop: 18 }}>
              <h3>{t("newPlan")}</h3>
              <input required name="name" placeholder={t("planName")} style={field} />
              <label>{t("startsAt")}<input required name="startsAt" type="datetime-local" style={field} /></label>
              <label>{t("endsAt")}<input required name="endsAt" type="datetime-local" style={field} /></label>
              <Button type="submit" disabled={Boolean(pending)}>{t("create")}</Button>
            </form>
          )}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("skillsMatrix")}</h2>
          {(data?.skillsMatrix ?? []).map((row, index) => (
            <div key={`${row.skill?.nameEn}-${row.proficiency}-${index}`} style={{ padding: "8px 0", borderBottom: `1px solid ${brand.colors.border}` }}>
              <strong>{row.skill?.nameEn ?? "Skill"}</strong>
              <div style={{ color: brand.colors.muted }}>{row.proficiency} · {row._count}</div>
            </div>
          ))}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("performance")}</h2>
          {(data?.analytics.performance ?? []).map((row) => (
            <div key={row.rating} style={{ padding: "8px 0" }}>{row.rating} · {row._count}</div>
          ))}
          {!data?.analytics.performance.length && <p>{t("noData")}</p>}
        </Card>
      </section>
    </main>
  );
}
