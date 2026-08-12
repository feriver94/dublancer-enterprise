"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Persona = { id: string; type: "CLIENT" | "FREELANCER" | "ORGANIZATION"; label: string; organizationName: string };
type Profile = { displayName: string | null; email: string; username?: string | null; avatarUrl?: string | null };
type Theme = "light" | "dark" | "system";

export default function AccountPanel({ profile, personas, activePersonaId, labels, busyPersonaId, loggingOut, onClose, onSwitchPersona, onLogout }: {
  profile: Profile;
  personas: Persona[];
  activePersonaId?: string | null;
  labels: Record<string, string>;
  busyPersonaId: string;
  loggingOut: boolean;
  onClose: () => void;
  onSwitchPersona: (id: string) => void;
  onLogout: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? null);
  const active = personas.find((persona) => persona.id === activePersonaId);
  const name = profile.displayName?.trim() || labels.account;
  const fallback = (name || profile.email).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const personaLabel = (type: Persona["type"]) => type === "CLIENT" ? labels.clientPersona : type === "FREELANCER" ? labels.freelancerPersona : labels.organizationPersona;

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
    const currentAvatar = window.sessionStorage.getItem("dublancer-profile-avatar");
    if (currentAvatar) queueMicrotask(() => setAvatarUrl(currentAvatar));
    const saved = window.localStorage.getItem("dublancer-theme");
    const value: Theme = saved === "light" || saved === "dark" ? saved : "system";
    queueMicrotask(() => setTheme(value));
  }, []);

  useEffect(() => {
    if (mounted) panel.current?.querySelector<HTMLElement>("a,button")?.focus();
  }, [mounted]);

  useEffect(() => {
    function update(event: Event) {
      const detail = (event as CustomEvent<{ asset?: string; url?: string | null }>).detail;
      if (detail?.asset === "avatar" || detail?.asset === "logo") setAvatarUrl(detail.url ?? null);
    }
    window.addEventListener("dublancer:profile-media", update);
    return () => window.removeEventListener("dublancer:profile-media", update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "system" ? "light dark" : theme;
  }, [theme]);

  function chooseTheme(value: Theme) {
    setTheme(value);
    window.localStorage.setItem("dublancer-theme", value);
  }

  function trap(event: React.KeyboardEvent) {
    if (event.key !== "Tab") return;
    const focusable = [...(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? [])];
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  if (!mounted) return null;

  return createPortal(<div className="fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-label={labels.profile} onKeyDown={trap} className="absolute inset-x-0 bottom-0 max-h-[calc(100vh-4rem)] overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 text-slate-800 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:end-4 sm:top-20 sm:w-[390px] sm:max-h-[calc(100vh-6rem)] sm:rounded-3xl">
      <div className="mb-2 flex items-center justify-between px-1"><strong className="text-sm text-[#0F4C5C]">{labels.account}</strong><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-600" aria-label={labels.closeAccountPanel}>×</button></div>
      <section className="rounded-2xl bg-gradient-to-br from-[#0F4C5C] to-[#087A52] p-4 text-white">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/15 text-lg font-black" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined} aria-label={labels.profile}>{avatarUrl ? null : fallback}</span>
          <div className="min-w-0"><strong className="block truncate text-lg">{name}</strong><span className="block truncate text-sm text-white/80">{profile.email}</span>{profile.username ? <span className="block truncate text-xs text-white/65">@{profile.username}</span> : null}</div>
        </div>
        <div className="mt-4 flex items-start justify-between gap-3 border-t border-white/15 pt-3 text-sm"><span>{labels.activePersona}</span><div className="min-w-0 text-end"><strong className="block truncate">{active?.label || labels.unavailable}</strong>{active ? <span className="block truncate text-xs text-white/70">{personaLabel(active.type)} · {active.organizationName}</span> : null}</div></div>
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2" aria-label={labels.accountTools}>
        {[{ href: "/settings/profiles", label: labels.profileSettings }, { href: "/analytics", label: labels.analytics }, { href: "/payments", label: labels.payments }].map((item) => <Link key={item.href} href={item.href} onClick={onClose} className="rounded-xl border border-slate-200 px-2 py-3 text-center text-xs font-bold text-[#0F4C5C] hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-600">{item.label}</Link>)}
      </section>

      <section className="mt-4 border-t border-slate-100 pt-4">
        <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">{labels.appearance}</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={labels.appearance}>{(["light", "dark", "system"] as Theme[]).map((value) => <button key={value} type="button" role="radio" aria-checked={theme === value} onClick={() => chooseTheme(value)} className={`rounded-xl border px-2 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-emerald-600 ${theme === value ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200"}`}>{labels[value]}</button>)}</div>
      </section>

      {personas.length ? <section className="mt-4 border-t border-slate-100 pt-4" aria-label={labels.switchPersona}>
        <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">{labels.switchPersona}</p>
        <div className="grid gap-1">{personas.map((persona) => <button key={persona.id} type="button" disabled={Boolean(busyPersonaId) || persona.id === activePersonaId} onClick={() => onSwitchPersona(persona.id)} aria-current={persona.id === activePersonaId ? "true" : undefined} className={`rounded-xl border px-3 py-2.5 text-start hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-80 ${persona.id === activePersonaId ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-transparent"}`}><strong className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{busyPersonaId === persona.id ? labels.switchingPersona : persona.label}</span>{persona.id === activePersonaId ? <span className="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase tracking-wide">{labels.currentPersona}</span> : null}</strong><span className="block truncate text-xs text-slate-500">{personaLabel(persona.type)} · {persona.organizationName}</span></button>)}</div>
        <Link href="/account/personas" onClick={onClose} className="mt-1 block rounded-xl px-3 py-2 text-sm font-bold text-[#0F4C5C] hover:bg-slate-50">{labels.managePersonas}</Link>
      </section> : null}

      <section className="mt-3 border-t border-slate-100 pt-3">
        <Link href="/identity" onClick={onClose} className="block rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-slate-50">{labels.account}</Link>
        <button type="button" disabled={loggingOut} onClick={onLogout} className="w-full rounded-xl px-3 py-2.5 text-start text-sm font-bold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-60">{loggingOut ? labels.loggingOut : labels.logout}</button>
      </section>
    </div>
  </div>, document.body);
}
