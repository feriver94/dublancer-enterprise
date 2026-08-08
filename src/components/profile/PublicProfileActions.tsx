"use client";

import Link from "next/link";
import { useState } from "react";
import { apiMutation } from "@/lib/client/api-client";

export default function PublicProfileActions({
  sharePath,
  report,
  inviteHref,
  hireHref,
  messageHref,
  followId,
  labels,
}: {
  sharePath: string;
  report: { resourceType: "CLIENT_PROFILE" | "FREELANCER_PROFILE" | "ORGANIZATION_PROFILE"; resourceId: string };
  inviteHref?: string;
  hireHref?: string;
  messageHref?: string;
  followId?: string;
  labels: { invite: string; hire: string; message: string; follow: string; share: string; report: string; reported: string };
}) {
  const [status, setStatus] = useState("");

  async function share() {
    try {
      const url = new URL(sharePath, window.location.origin).toString();
      if (navigator.share) await navigator.share({ title: document.title, url });
      else await navigator.clipboard.writeText(url);
      setStatus(labels.share);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : labels.share);
    }
  }

  async function reportProfile() {
    const detail = window.prompt(labels.report);
    if (!detail) return;
    try {
      await apiMutation("/api/profiles/report", "POST", { ...report, category: "PROFILE", detail });
      setStatus(labels.reported);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : labels.report);
    }
  }

  async function follow() {
    if (!followId) return;
    try {
      const result = await apiMutation<{ saved: boolean }>(`/api/profiles/follow/${followId}`, "POST", {});
      setStatus(result.saved ? labels.follow : "");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : labels.follow);
    }
  }

  return <div className="profile-actions" aria-live="polite">
    {inviteHref ? <Link href={inviteHref} className="profile-action profile-action--primary">{labels.invite}</Link> : null}
    {hireHref ? <Link href={hireHref} className="profile-action profile-action--primary">{labels.hire}</Link> : null}
    {messageHref ? <Link href={messageHref} className="profile-action">{labels.message}</Link> : null}
    {followId ? <button type="button" onClick={() => void follow()} className="profile-action">{labels.follow}</button> : null}
    <button type="button" onClick={() => void share()} className="profile-action">{labels.share}</button>
    <button type="button" onClick={() => void reportProfile()} className="profile-action profile-action--danger">{labels.report}</button>
    {status ? <span className="profile-action-status">{status}</span> : null}
  </div>;
}
