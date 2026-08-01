"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";

type User = { id: string; displayName: string; email?: string | null };
type ProjectMember = { id: string; role: string; user: User };
type MemberOptions = {
  owner: User;
  members: ProjectMember[];
  eligible: Array<{
    membershipId: string;
    userId: string;
    displayName: string;
    email?: string | null;
    organizationRole?: string | null;
  }>;
};

const assignableRoles = ["MANAGER", "CONTRIBUTOR", "VIEWER"] as const;

export default function ProjectMemberManagement({
  projectId,
  owner,
  members,
  onChanged,
}: {
  projectId: string;
  owner: User;
  members: ProjectMember[];
  onChanged: () => void | Promise<unknown>;
}) {
  const t = useTranslations("Workspace");
  const status = useTranslations("Status");
  const management = useApiResource<MemberOptions>(
    `/api/projects/${encodeURIComponent(projectId)}/members`,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const label = (value: string) =>
    status.has(value) ? status(value) : value.replaceAll("_", " ");

  async function mutate(
    key: string,
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
    success: string,
  ) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await apiMutation(path, method, body);
      await Promise.all([management.refresh(), onChanged()]);
      setNotice(success);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("operationFailed"));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form);
    if (
      await mutate(
        "add",
        `/api/projects/${encodeURIComponent(projectId)}/members`,
        "POST",
        { userId: input.get("userId"), role: input.get("role") },
        t("memberAdded"),
      )
    ) {
      form.reset();
    }
  }

  async function updateRole(
    event: FormEvent<HTMLFormElement>,
    userId: string,
  ) {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    await mutate(
      `role:${userId}`,
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      "PATCH",
      { role: input.get("role") },
      t("memberRoleUpdated"),
    );
  }

  async function removeMember(user: User) {
    if (!window.confirm(t("removeMemberConfirm", { name: user.displayName }))) {
      return;
    }
    await mutate(
      `remove:${user.id}`,
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(user.id)}`,
      "DELETE",
      { confirmation: "REMOVE" },
      t("memberRemoved"),
    );
  }

  const canManage = Boolean(management.data);
  return (
    <div className="grid gap-5">
      {canManage ? (
        <form className="enterprise-form" onSubmit={addMember}>
          <label>
            {t("memberPicker")}
            <select name="userId" required defaultValue="">
              <option value="" disabled>
                {t("chooseMember")}
              </option>
              {management.data?.eligible.map((candidate) => (
                <option key={candidate.userId} value={candidate.userId}>
                  {candidate.displayName} · {candidate.email ?? t("noEmail")} ·{" "}
                  {candidate.organizationRole ?? t("member")}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("projectRole")}
            <select name="role" defaultValue="CONTRIBUTOR">
              {assignableRoles.map((role) => (
                <option key={role} value={role}>
                  {label(role)}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy === "add" || !management.data?.eligible.length}>
            {management.data?.eligible.length
              ? t("addMember")
              : t("noEligibleMembers")}
          </Button>
        </form>
      ) : null}

      {error ? <p className="enterprise-error" role="alert">{error}</p> : null}
      {notice ? <p className="enterprise-success" role="status">{notice}</p> : null}

      <div className="grid gap-3">
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>{owner.displayName}</strong>
              <p className="text-sm text-slate-600">{owner.email ?? t("noEmail")}</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0F4C5C]">
              {t("projectOwner")}
            </span>
          </div>
        </article>
        {members.map((membership) => (
          <article key={membership.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong>{membership.user.displayName}</strong>
                <p className="text-sm text-slate-600">
                  {membership.user.email ?? t("noEmail")}
                </p>
              </div>
              {canManage ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(event) => void updateRole(event, membership.user.id)}
                >
                  <label className="sr-only" htmlFor={`role-${membership.user.id}`}>
                    {t("memberRoleFor", { name: membership.user.displayName })}
                  </label>
                  <select
                    id={`role-${membership.user.id}`}
                    name="role"
                    defaultValue={membership.role}
                    className="rounded-lg border px-3 py-2"
                  >
                    {assignableRoles.map((role) => (
                      <option key={role} value={role}>
                        {label(role)}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" disabled={Boolean(busy)}>
                    {t("updateRole")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={Boolean(busy)}
                    onClick={() => void removeMember(membership.user)}
                  >
                    {t("removeMember")}
                  </Button>
                </form>
              ) : (
                <span className="text-sm font-bold text-[#0F4C5C]">
                  {label(membership.role)}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
