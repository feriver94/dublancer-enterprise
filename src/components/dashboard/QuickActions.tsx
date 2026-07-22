"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, Button, Badge } from "@/components/ui";
import { brand } from "@/constants/design";
import { apiGet, apiMutation } from "@/lib/client/api-client";

type Action = "project" | "proposal" | "invite";
type Listing = { id: string; title: string; currency: string };
type Organization = { id: string; name: string };

const definitions = ["project", "proposal", "invite", "workspace"] as const;

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function QuickActions({ onChanged }: { onChanged?: () => void }) {
  const t = useTranslations("Dashboard");
  const common = useTranslations("Common");
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);

  useEffect(() => {
    if (action !== "proposal") return;
    let active = true;
    void apiGet<Listing[]>("/api/marketplace/listings?status=PUBLISHED&take=100")
      .then((data) => { if (active) setListings(data); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : t("loadListingsFailed")); });
    return () => { active = false; };
  }, [action]);

  function open(key: string) {
    setError("");
    setNotice("");
    if (key === "workspace") {
      router.push("/workspace");
      return;
    }
    setAction(key as Action);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      if (action === "project") {
        const title = String(data.get("title") ?? "");
        await apiMutation("/api/projects", "POST", {
          title,
          slug: slugify(String(data.get("slug") || title)),
          description: String(data.get("description") || "") || undefined,
          currency: "AED",
        });
        setNotice(t("projectCreated"));
      } else if (action === "proposal") {
        const amount = Number(data.get("bid") ?? 0);
        await apiMutation("/api/marketplace/proposals", "POST", {
          listingId: data.get("listingId"),
          coverLetter: data.get("coverLetter"),
          bidMinor: String(Math.round(amount * 100)),
          currency: "AED",
          estimatedDays: Number(data.get("estimatedDays")),
          submit: true,
        });
        setNotice(t("proposalSubmitted"));
      } else {
        const organization = await apiGet<Organization>("/api/organizations");
        await apiMutation(`/api/organizations/${organization.id}/invitations`, "POST", {
          email: data.get("email"),
          expiresInHours: 168,
        });
        setNotice(t("invitationCreated"));
      }
      setAction(null);
      onChanged?.();
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("actionFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card variant="elevated">
      <div style={{ marginBottom: 24 }}>
        <Badge variant="info">{t("quickActions")}</Badge>
        <h3 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, fontWeight: brand.typography.weight.bold, marginTop: 18, marginBottom: 0 }}>{t("moveWorkForward")}</h3>
      </div>
      {notice ? <p className="enterprise-notice" role="status">{notice}</p> : null}
      <div style={{ display: "grid", gap: 12 }}>
        {definitions.map((key, index) => (
          <Button key={key} type="button" variant={index === 0 ? "primary" : "outline"} onClick={() => open(key)}>{t(`action.${key}`)}</Button>
        ))}
      </div>

      {action ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setAction(null); }}>
          <Card variant="elevated" className="max-h-[90vh] w-full max-w-xl overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="quick-action-title">
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 id="quick-action-title" className="text-2xl font-bold text-[#0F4C5C]">
                {t(`action.${action}`)}
              </h2>
              <button type="button" className="rounded-full px-3 py-1 text-xl" aria-label={common("close")} onClick={() => setAction(null)}>×</button>
            </div>
            <form className="enterprise-form" onSubmit={submit}>
              {action === "project" ? (
                <>
                  <label>{t("projectTitle")}<input name="title" minLength={3} maxLength={160} required autoFocus /></label>
                  <label>{t("projectSlug")}<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder={t("slugPlaceholder")} /></label>
                  <label>{common("description")}<textarea name="description" maxLength={10000} /></label>
                </>
              ) : null}
              {action === "proposal" ? (
                <>
                  <label>{t("marketplaceProject")}<select name="listingId" required autoFocus defaultValue=""><option value="" disabled>{t("selectListing")}</option>{listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}</option>)}</select></label>
                  <label>{t("coverLetter")}<textarea name="coverLetter" minLength={20} maxLength={10000} required /></label>
                  <label>{t("bidAed")}<input name="bid" type="number" min="0" step="0.01" required /></label>
                  <label>{t("estimatedDays")}<input name="estimatedDays" type="number" min="1" max="3650" required /></label>
                </>
              ) : null}
              {action === "invite" ? <label>{t("teamEmail")}<input name="email" type="email" required autoFocus /></label> : null}
              {error ? <p className="enterprise-error" role="alert">{error}</p> : null}
              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="submit" disabled={pending}>{pending ? common("working") : t("confirm")}</Button>
                <Button type="button" variant="ghost" onClick={() => setAction(null)} disabled={pending}>{common("cancel")}</Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </Card>
  );
}
