"use client";

import { useEffect, useRef, useState } from "react";
import { apiBinaryMutation, apiMutation } from "@/lib/client/api-client";
import { useTranslations } from "next-intl";

type Target = "client" | "freelancer" | "organization";
type Asset = "avatar" | "logo" | "banner";

async function digest(file: File) {
  const value = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function ProfileMediaControl({ target, asset, value, label, fallback, onChanged }: { target: Target; asset: Asset; value?: string | null; label: string; fallback: string; onChanged: () => Promise<unknown> }) {
  const t = useTranslations("ProfilePhaseB");
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function select(selected?: File) {
    setError("");
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) { setError(t("mediaTypeError")); return; }
    if (selected.size > 5 * 1024 * 1024) { setError(t("mediaSizeError")); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(selected); setPreview(URL.createObjectURL(selected));
  }
  async function upload() {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const intent = await apiMutation<{ uploadUrl: string }>("/api/profile/media/intents", "POST", { target, asset, mimeType: file.type, sizeBytes: file.size, checksumSha256: await digest(file) });
      const uploaded = await apiBinaryMutation<{ url: string }>(intent.uploadUrl, file);
      if (asset === "avatar" || asset === "logo") window.sessionStorage.setItem("dublancer-profile-avatar", uploaded.url);
      window.dispatchEvent(new CustomEvent("dublancer:profile-media", { detail: { target, asset, url: uploaded.url } }));
      URL.revokeObjectURL(preview); setPreview(""); setFile(null); if (input.current) input.current.value = ""; await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("mediaUploadFailed")); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try { await apiMutation("/api/profile/media", "DELETE", { target, asset }); if (asset === "avatar" || asset === "logo") window.sessionStorage.removeItem("dublancer-profile-avatar"); window.dispatchEvent(new CustomEvent("dublancer:profile-media", { detail: { target, asset, url: null } })); if (input.current) input.current.value = ""; await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("mediaRemoveFailed")); }
    finally { setBusy(false); }
  }
  const displayed = preview || value || "";
  return <section className={`profile-media profile-media--${asset}`} aria-label={label}>
    <div className="profile-media__preview" style={displayed ? { backgroundImage: `url(${displayed})` } : undefined}>{displayed ? null : fallback}</div>
    <div className="profile-media__body"><strong>{label}</strong><span>{t("mediaHelp")}</span><div className="profile-media__actions">
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => select(event.target.files?.[0])} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>{value ? t("changePhoto") : t("uploadPhoto")}</button>
      {file ? <><button type="button" disabled={busy} onClick={() => void upload()}>{t("confirmUpload")}</button><button type="button" onClick={() => { URL.revokeObjectURL(preview); setPreview(""); setFile(null); if (input.current) input.current.value = ""; }}>{t("cancel")}</button></> : null}
      {value && !file ? <button type="button" disabled={busy} onClick={() => void remove()}>{t("removePhoto")}</button> : null}
    </div>{error ? <p role="alert" className="enterprise-error">{error}</p> : null}</div>
  </section>;
}
