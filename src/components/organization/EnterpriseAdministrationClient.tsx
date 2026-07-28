"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import type { AppLocale } from "@/i18n/config";
import { formatAed, formatUaeDate } from "@/lib/locale/formatters";

type SubscriptionDashboard = {
  subscription: {
    status: string;
    version: number;
    currentPeriodEnd: string;
    plan: { id: string; name: string; priceMinor: string };
  };
  quotaUsage: Array<{
    unit: string;
    limit: string;
    used: string;
    exceeded: boolean;
  }>;
  activeSeats: number;
};
type Plan = { id: string; name: string };
type MemberDashboard = {
  members: Array<{
    id: string;
    status: string;
    user: { email: string; displayName?: string | null };
    role?: { id: string; name: string } | null;
  }>;
  roles: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; _count: { teams: number } }>;
  teams: Array<{ id: string; name: string; department?: { name: string } | null }>;
  accessReviews: Array<{ id: string; title: string; status: string }>;
  permissionAudits: Array<{ id: string; findings: unknown[]; createdAt: string }>;
};
type EmailMessage = {
  id: string;
  recipient: string;
  templateKey: string;
  status: string;
  attempts: number;
  createdAt: string;
};
type SecurityDashboard = {
  decisions: Array<{ id: string; score: number; action: string }>;
  locks: Array<{
    id: string;
    status: string;
    lockedUntil: string;
    user: { email: string };
  }>;
  devices: Array<{ id: string; status: string }>;
};

export function EnterpriseAdministrationClient({
  organizationId,
  capabilities,
}: {
  organizationId: string;
  capabilities: {
    manageBilling: boolean;
    manageMembers: boolean;
    reviewSecurity: boolean;
  };
}) {
  const t = useTranslations("Administration");
  const common = useTranslations("Common");
  const status = useTranslations("Status");
  const locale = useLocale() as AppLocale;
  const subscription =
    useApiResource<SubscriptionDashboard>("/api/billing/subscription/lifecycle");
  const plans = useApiResource<Plan[]>("/api/billing/plans");
  const members = useApiResource<MemberDashboard>(
    `/api/organizations/${organizationId}/administration`,
  );
  const email = useApiResource<EmailMessage[]>(
    `/api/organizations/${organizationId}/email-operations`,
  );
  const security =
    useApiResource<SecurityDashboard>("/api/security/administration");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    await Promise.all([
      subscription.refresh(),
      plans.refresh(),
      members.refresh(),
      email.refresh(),
      security.refresh(),
    ]);
  }

  async function mutate(label: string, operation: () => Promise<unknown>) {
    setPending(label);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(common("completed"));
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("requestFailed"));
    } finally {
      setPending("");
    }
  }

  async function lifecycle(action: "RENEW" | "SUSPEND" | "REACTIVATE") {
    if (!subscription.data) return;
    await mutate(action, () =>
      apiMutation("/api/billing/subscription/lifecycle", "POST", {
        action,
        expectedVersion: subscription.data!.subscription.version,
        ...(action === "SUSPEND"
          ? { reason: t("administrativeReason") }
          : {}),
      }),
    );
  }

  async function bulkInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const roleId = String(data.get("roleId") ?? "") || undefined;
    const invitations = String(data.get("emails") ?? "")
      .split(/[\n,;]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((address) => ({ email: address, roleId, expiresInHours: 168 }));
    await mutate("invite", () =>
      apiMutation(
        `/api/organizations/${organizationId}/invitations/bulk`,
        "POST",
        { invitations },
      ),
    );
    form.reset();
  }

  async function bulkRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const roleId = String(new FormData(event.currentTarget).get("roleId") ?? "");
    await mutate("role", () =>
      apiMutation(
        `/api/organizations/${organizationId}/members/bulk-role`,
        "PATCH",
        { membershipIds: selectedMembers, roleId },
      ),
    );
    setSelectedMembers([]);
  }

  async function createStructure(
    event: FormEvent<HTMLFormElement>,
    action: "department.create" | "team.create",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await mutate(action, () =>
      apiMutation(
        `/api/organizations/${organizationId}/administration`,
        "POST",
        {
          action,
          name: data.get("name"),
          ...(action === "team.create" && data.get("departmentId")
            ? { departmentId: data.get("departmentId") }
            : {}),
        },
      ),
    );
    form.reset();
  }

  const resourceError =
    subscription.error || members.error || email.error || security.error;
  const current = subscription.data?.subscription;
  return (
    <main className="py-16">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-bold uppercase tracking-widest text-[#009A44]">
            {t("eyebrow")}
          </p>
          <h1 className="text-4xl font-bold text-[#0F4C5C]">{t("title")}</h1>
          <p className="mt-2 max-w-3xl text-slate-600">{t("description")}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-full border px-5 py-2 font-bold"
        >
          {common("refresh")}
        </button>
      </header>
      {resourceError || error ? (
        <p className="enterprise-error mb-6" role="alert">
          {resourceError || error}
        </p>
      ) : null}
      {notice ? (
        <p className="enterprise-notice mb-6" role="status">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card variant="elevated">
          <h2 className="text-2xl font-bold text-[#0F4C5C]">
            {t("subscription")}
          </h2>
          {current ? (
            <div className="mt-5 grid gap-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <strong>{current.plan.name}</strong>
                  <p className="text-sm text-slate-500">
                    {t("renewal")}: {formatUaeDate(current.currentPeriodEnd, locale)}
                  </p>
                </div>
                <div className="text-end">
                  <Badge variant={current.status === "ACTIVE" ? "success" : "info"}>
                    {status.has(current.status) ? status(current.status) : current.status}
                  </Badge>
                  <p>{formatAed(Number(current.plan.priceMinor) / 100, locale)}</p>
                </div>
              </div>
              <p>
                <strong>{t("seats")}:</strong> {subscription.data?.activeSeats}
              </p>
              {subscription.data?.quotaUsage.map((quota) => (
                <div key={quota.unit} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex justify-between gap-3 text-sm">
                    <span>{status.has(quota.unit) ? status(quota.unit) : quota.unit}</span>
                    <span>{quota.used} / {quota.limit}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded bg-slate-200">
                    <div
                      className={`h-full ${quota.exceeded ? "bg-red-500" : "bg-[#009A44]"}`}
                      style={{
                        width: `${Math.min(100, (Number(quota.used) / Math.max(1, Number(quota.limit))) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {capabilities.manageBilling ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={Boolean(pending)} onClick={() => void lifecycle("RENEW")}>
                    {t("renew")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(pending)}
                    onClick={() => void lifecycle(current.status === "SUSPENDED" ? "REACTIVATE" : "SUSPEND")}
                  >
                    {current.status === "SUSPENDED" ? t("reactivate") : t("suspend")}
                  </Button>
                </div>
              ) : null}
              <p className="text-sm text-slate-500">
                {t("plans")}: {plans.data?.map((plan) => plan.name).join(", ")}
              </p>
            </div>
          ) : (
            <p className="enterprise-empty mt-5">{common("noRecords")}</p>
          )}
        </Card>

        <Card variant="elevated">
          <h2 className="text-2xl font-bold text-[#0F4C5C]">{t("members")}</h2>
          <div className="mt-5 grid gap-3">
            {members.data?.members.map((member) => (
              <label
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-xl border p-3"
              >
                <span className="flex items-center gap-3">
                  {capabilities.manageMembers ? (
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(member.id)}
                      onChange={(event) =>
                        setSelectedMembers((currentIds) =>
                          event.target.checked
                            ? [...currentIds, member.id]
                            : currentIds.filter((id) => id !== member.id),
                        )
                      }
                    />
                  ) : null}
                  <span>
                    <strong>{member.user.displayName ?? member.user.email}</strong>
                    <span className="block text-xs text-slate-500">
                      {member.user.email} · {member.role?.name ?? t("notAvailable")}
                    </span>
                  </span>
                </span>
                <Badge variant={member.status === "ACTIVE" ? "success" : "info"}>
                  {status.has(member.status) ? status(member.status) : member.status}
                </Badge>
              </label>
            ))}
          </div>
          {capabilities.manageMembers ? (
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <form className="enterprise-form" onSubmit={(event) => void bulkInvite(event)}>
                <h3 className="font-bold">{t("bulkInvitations")}</h3>
                <label>{t("emailAddresses")}<textarea name="emails" required /></label>
                <label>{t("role")}<select name="roleId"><option value="">{common("optional")}</option>{members.data?.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
                <Button size="sm" disabled={Boolean(pending)}>{common("submit")}</Button>
              </form>
              <form className="enterprise-form" onSubmit={(event) => void bulkRole(event)}>
                <h3 className="font-bold">{t("bulkRoleChanges")}</h3>
                <label>{t("role")}<select name="roleId" required><option value="">{t("select")}</option>{members.data?.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
                <Button size="sm" disabled={!selectedMembers.length || Boolean(pending)}>{common("update")}</Button>
              </form>
            </div>
          ) : null}
        </Card>

        <Card variant="elevated">
          <h2 className="text-2xl font-bold text-[#0F4C5C]">{t("structure")}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div><h3 className="font-bold">{t("departments")}</h3>{members.data?.departments.map((item) => <p key={item.id} className="mt-2 rounded-xl border p-3">{item.name} · {item._count.teams} {t("teams")}</p>)}</div>
            <div><h3 className="font-bold">{t("teams")}</h3>{members.data?.teams.map((item) => <p key={item.id} className="mt-2 rounded-xl border p-3">{item.name}{item.department ? ` · ${item.department.name}` : ""}</p>)}</div>
          </div>
          {capabilities.manageMembers ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <form className="enterprise-form" onSubmit={(event) => void createStructure(event, "department.create")}><label>{t("departmentName")}<input name="name" required /></label><Button size="sm">{common("create")}</Button></form>
              <form className="enterprise-form" onSubmit={(event) => void createStructure(event, "team.create")}><label>{t("teamName")}<input name="name" required /></label><label>{t("departments")}<select name="departmentId"><option value="">{common("optional")}</option>{members.data?.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Button size="sm">{common("create")}</Button></form>
            </div>
          ) : null}
        </Card>

        <Card variant="elevated">
          <h2 className="text-2xl font-bold text-[#0F4C5C]">{t("access")}</h2>
          {capabilities.manageMembers ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" disabled={Boolean(pending)} onClick={() => void mutate("audit", () => apiMutation(`/api/organizations/${organizationId}/administration`, "POST", { action: "permissionAudit.run" }))}>{t("permissionAudit")}</Button>
              <Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={() => void mutate("review", () => apiMutation(`/api/organizations/${organizationId}/administration`, "POST", { action: "accessReview.create", title: `${t("accessReviews")} ${new Date().toISOString().slice(0, 10)}` }))}>{t("accessReviews")}</Button>
            </div>
          ) : null}
          <p className="mt-4 text-sm text-slate-500">{t("permissionAudit")}: {members.data?.permissionAudits.length ?? 0} · {t("accessReviews")}: {members.data?.accessReviews.length ?? 0}</p>
        </Card>

        <Card variant="elevated">
          <h2 className="text-2xl font-bold text-[#0F4C5C]">{t("emailOperations")}</h2>
          <div className="mt-5 grid gap-3">
            {email.data?.slice(0, 8).map((message) => (
              <div key={message.id} className="rounded-xl border p-3">
                <div className="flex justify-between gap-3">
                  <strong>{message.templateKey}</strong>
                  <Badge variant={message.status === "DELIVERED" ? "success" : ["FAILED", "BOUNCED"].includes(message.status) ? "danger" : "info"}>{status.has(message.status) ? status(message.status) : message.status}</Badge>
                </div>
                <p className="text-sm text-slate-500">{message.recipient} · {formatUaeDate(message.createdAt, locale)} · {t("attempts")}: {message.attempts}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="elevated">
          <h2 className="text-2xl font-bold text-[#0F4C5C]">{t("security")}</h2>
          <p className="mt-4 text-sm">{t("riskDecisions")}: {security.data?.decisions.length ?? 0} · {t("devices")}: {security.data?.devices.length ?? 0}</p>
          <div className="mt-4 grid gap-3">
            {security.data?.locks.slice(0, 6).map((lock) => (
              <div key={lock.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div><strong>{lock.user.email}</strong><p className="text-xs text-slate-500">{formatUaeDate(lock.lockedUntil, locale)}</p></div>
                {capabilities.reviewSecurity && lock.status === "ACTIVE" ? (
                  <Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={() => void mutate("unlock", () => apiMutation("/api/security/administration", "POST", { action: "RELEASE_LOCK", id: lock.id, note: t("administrativeReason") }))}>{t("releaseLock")}</Button>
                ) : <Badge variant="info">{status.has(lock.status) ? status(lock.status) : lock.status}</Badge>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
