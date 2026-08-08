"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";

type Target = { resourceType: "CLIENT_PROFILE" | "FREELANCER_PROFILE" | "ORGANIZATION_PROFILE"; resourceId: string };
type ActionState = {
  saved: boolean;
  following: boolean;
  listings: Array<{ id: string; title: string }>;
  capabilities: { save: boolean; follow: boolean; invite: boolean; compare: boolean; message: boolean; openOpportunities: boolean };
};

export default function PublicProfileActions({
  sharePath,
  report,
  messageHref,
  labels,
}: {
  sharePath: string;
  report: Target;
  inviteHref?: string;
  hireHref?: string;
  messageHref?: string;
  followId?: string;
  labels: {
    invite: string; hire: string; message: string; follow: string; share: string; report: string; reported: string;
    save?: string; unsave?: string; unfollow?: string; compare?: string; selectProject?: string; invited?: string; retry?: string; unavailable?: string;
  };
}) {
  const router = useRouter();
  const parameters = useMemo(() => new URLSearchParams({ resourceType: report.resourceType, resourceId: report.resourceId }).toString(), [report.resourceId, report.resourceType]);
  const resource = useApiResource<ActionState>(`/api/profile-actions?${parameters}`);
  const [pending, setPending] = useState("");
  const [status, setStatus] = useState("");
  const [listingId, setListingId] = useState("");

  async function mutate(key: string, operation: () => Promise<unknown>, notice: string) {
    if (pending) return;
    setPending(key); setStatus("");
    try { await operation(); setStatus(notice); await resource.refresh(); }
    catch (reason) { setStatus(reason instanceof Error ? reason.message : labels.unavailable ?? labels.retry ?? labels.report); }
    finally { setPending(""); }
  }

  async function share() {
    try {
      const url = new URL(sharePath, window.location.origin).toString();
      if (navigator.share) await navigator.share({ title: document.title, url });
      else await navigator.clipboard.writeText(url);
      setStatus(labels.share);
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : labels.share); }
  }

  async function reportProfile() {
    const detail = window.prompt(labels.report);
    if (!detail) return;
    await mutate("report", () => apiMutation("/api/profiles/report", "POST", { ...report, category: "PROFILE", detail }), labels.reported);
  }

  async function compare() {
    if (report.resourceType !== "FREELANCER_PROFILE") return;
    const stored = JSON.parse(window.localStorage.getItem("dublancer-provider-comparison") ?? "[]") as string[];
    const ids = [...new Set([...stored, report.resourceId])].slice(-4);
    window.localStorage.setItem("dublancer-provider-comparison", JSON.stringify(ids));
    if (ids.length >= 2) router.push(`/marketplace/compare?${ids.map((id) => `provider=${encodeURIComponent(id)}`).join("&")}`);
    else setStatus(labels.compare ?? "Add another provider to compare");
  }

  const state = resource.data;
  return <div className="profile-actions" aria-live="polite">
    {state?.capabilities.save ? <button type="button" disabled={Boolean(pending)} onClick={() => void mutate("save", () => apiMutation("/api/profile-actions", "POST", { action: "SAVE", active: !state.saved, ...(report.resourceType === "FREELANCER_PROFILE" ? { freelancerProfileId: report.resourceId } : { providerOrganizationId: report.resourceId }) }), state.saved ? (labels.unsave ?? labels.save ?? labels.follow) : (labels.save ?? labels.follow))} className="profile-action">{state.saved ? (labels.unsave ?? labels.save ?? labels.follow) : (labels.save ?? labels.follow)}</button> : null}
    {state?.capabilities.follow ? <button type="button" disabled={Boolean(pending)} onClick={() => void mutate("follow", () => apiMutation("/api/profile-actions", "POST", { action: "FOLLOW", active: !state.following, target: report }), state.following ? (labels.unfollow ?? labels.follow) : labels.follow)} className="profile-action">{state.following ? (labels.unfollow ?? labels.follow) : labels.follow}</button> : null}
    {state?.capabilities.invite ? <span className="profile-action-group"><label className="sr-only" htmlFor={`profile-project-${report.resourceId}`}>{labels.selectProject ?? labels.invite}</label><select id={`profile-project-${report.resourceId}`} value={listingId} onChange={(event) => setListingId(event.target.value)} disabled={Boolean(pending)}><option value="">{labels.selectProject ?? labels.invite}</option>{state.listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}</select><button type="button" disabled={!listingId || Boolean(pending)} onClick={() => void mutate("invite", () => apiMutation("/api/profile-actions", "POST", { action: "INVITE", listingId, ...(report.resourceType === "FREELANCER_PROFILE" ? { freelancerProfileId: report.resourceId } : { providerOrganizationId: report.resourceId }) }), labels.invited ?? labels.invite)} className="profile-action profile-action--primary">{labels.invite}</button></span> : null}
    {state?.capabilities.compare ? <button type="button" disabled={Boolean(pending)} onClick={() => void compare()} className="profile-action">{labels.compare ?? labels.hire}</button> : null}
    {state?.capabilities.message && messageHref ? <Link href={messageHref} className="profile-action">{labels.message}</Link> : null}
    {state?.capabilities.openOpportunities ? <Link href={`/marketplace?client=${encodeURIComponent(report.resourceId)}`} className="profile-action profile-action--primary">{labels.hire}</Link> : null}
    <button type="button" disabled={Boolean(pending)} onClick={() => void share()} className="profile-action">{labels.share}</button>
    <button type="button" disabled={Boolean(pending)} onClick={() => void reportProfile()} className="profile-action profile-action--danger">{labels.report}</button>
    {resource.error && !resource.loading ? <button type="button" onClick={() => void resource.refresh()} className="profile-action">{labels.retry ?? labels.unavailable ?? labels.report}</button> : null}
    {status ? <span className="profile-action-status" role="status">{status}</span> : null}
  </div>;
}
