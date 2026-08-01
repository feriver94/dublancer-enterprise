"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiGet, apiMutation, resetApiClientCsrf } from "@/lib/client/api-client";

type NavigationItem = { href: string; label: string };
type Profile = { displayName: string | null; email: string };
type SearchResult = {
  id: string;
  entityType: string;
  title: string;
  highlight: string;
  body: string;
  metadata: { href?: string } | null;
};

type Labels = {
  home: string;
  primaryNavigation: string;
  productModules: string;
  menu: string;
  closeMenu: string;
  more: string;
  search: string;
  searchPlaceholder: string;
  searchHint: string;
  noSearchResults: string;
  profile: string;
  account: string;
  logout: string;
  loggingOut: string;
  logoutFailed: string;
  organization: string;
  openWorkspace: string;
  dashboard: string;
  login: string;
  startFree: string;
};

function safeHref(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : null;
}

function initials(profile: Profile) {
  const source = profile.displayName?.trim() || profile.email;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function NavbarClient({
  items,
  authenticated,
  profile,
  canViewOrganization,
  workspaceHref,
  labels,
}: {
  items: NavigationItem[];
  authenticated: boolean;
  profile?: Profile | null;
  canViewOrganization: boolean;
  workspaceHref: string;
  labels: Labels;
}) {
  const router = useRouter();
  const searchInput = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const primaryItems = items.slice(0, 5);
  const overflowItems = items.slice(5);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (authenticated && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setMobileOpen(false);
        setProfileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authenticated]);

  useEffect(() => {
    if (!searchOpen) return;
    const focus = window.setTimeout(() => searchInput.current?.focus(), 0);
    return () => window.clearTimeout(focus);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || query.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const parameters = new URLSearchParams({ q: query.trim(), entityType: "all", take: "12" });
        setResults(await apiGet<SearchResult[]>(`/api/search?${parameters}`, { signal: controller.signal }));
      } catch (reason) {
        if (!controller.signal.aborted) {
          setSearchError(reason instanceof Error ? reason.message : labels.noSearchResults);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [labels.noSearchResults, query, searchOpen]);

  async function logout() {
    setLoggingOut(true);
    try {
      await apiMutation("/api/auth/logout", "POST", {});
      resetApiClientCsrf();
      window.sessionStorage.clear();
      router.replace("/login");
      router.refresh();
    } catch (reason) {
      setLoggingOut(false);
      window.alert(reason instanceof Error ? reason.message : labels.logoutFailed);
    }
  }

  function openResult(result: SearchResult) {
    const href = safeHref(result.metadata?.href);
    if (!href) return;
    setSearchOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <nav className="relative flex min-h-20 items-center gap-3 py-3" aria-label={labels.primaryNavigation}>
      <Link href={authenticated ? "/dashboard" : "/"} className="shrink-0" aria-label={labels.home}>
        <Image
          src="/images/Logo.jpg"
          alt="Dublancer"
          width={230}
          height={74}
          priority
          className="h-auto w-[145px] object-contain sm:w-[180px] 2xl:w-[210px]"
        />
      </Link>

      <div className="hidden min-w-0 flex-1 items-center justify-center gap-4 text-sm font-bold text-[#0F4C5C] xl:flex" aria-label={labels.productModules}>
        {primaryItems.map((item) => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap hover:text-[#009A44]">
            {item.label}
          </Link>
        ))}
        {overflowItems.length ? (
          <details className="group relative">
            <summary className="cursor-pointer list-none whitespace-nowrap rounded-full border border-slate-200 px-3 py-2 hover:text-[#009A44]">
              {labels.more}
            </summary>
            <div className="absolute end-0 top-full z-50 mt-2 grid min-w-52 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              {overflowItems.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-xl px-4 py-2 hover:bg-slate-50 hover:text-[#009A44]">
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <div className="ms-auto flex shrink-0 items-center gap-2">
        {authenticated ? (
          <>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="hidden rounded-full border border-slate-200 px-3 py-2 text-sm font-bold text-[#0F4C5C] hover:border-[#009A44] sm:block"
              aria-keyshortcuts="Control+K Meta+K"
            >
              {labels.search} <kbd className="ms-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
            </button>
            {profile ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((current) => !current)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 p-1.5 pe-3 text-start hover:border-[#009A44]"
                  aria-expanded={profileOpen}
                  aria-label={labels.profile}
                >
                  <span className="grid size-9 place-items-center rounded-full bg-[#0F4C5C] text-xs font-bold text-white">{initials(profile)}</span>
                  <span className="hidden max-w-32 truncate text-sm font-bold text-[#0F4C5C] lg:block">{profile.displayName || profile.email}</span>
                </button>
                {profileOpen ? (
                  <div className="absolute end-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                    <p className="truncate font-bold text-[#0F4C5C]">{profile.displayName || labels.account}</p>
                    <p className="truncate text-xs text-slate-500">{profile.email}</p>
                    <div className="my-3 border-t border-slate-100" />
                    {canViewOrganization ? <Link href="/organization" className="block rounded-xl px-3 py-2 text-sm font-bold hover:bg-slate-50">{labels.organization}</Link> : null}
                    <Link href="/identity" className="block rounded-xl px-3 py-2 text-sm font-bold hover:bg-slate-50">{labels.account}</Link>
                    <button type="button" disabled={loggingOut} onClick={() => void logout()} className="mt-1 w-full rounded-xl px-3 py-2 text-start text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">
                      {loggingOut ? labels.loggingOut : labels.logout}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setMobileOpen((current) => !current)}
              className="rounded-full border border-slate-200 px-3 py-2 text-sm font-bold text-[#0F4C5C] xl:hidden"
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? labels.closeMenu : labels.menu}
            >
              {mobileOpen ? "×" : "☰"}
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="hidden font-bold text-[#0F4C5C] sm:block">{labels.login}</Link>
            <Link href="/register" className="rounded-full bg-[#009A44] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#007A36]">{labels.startFree}</Link>
          </>
        )}
      </div>

      {authenticated && mobileOpen ? (
        <div className="absolute inset-x-0 top-full z-40 max-h-[calc(100vh-5rem)] overflow-y-auto border-t border-slate-200 bg-white p-4 shadow-xl xl:hidden">
          <button type="button" onClick={() => { setMobileOpen(false); setSearchOpen(true); }} className="mb-3 w-full rounded-xl border border-slate-200 px-4 py-3 text-start font-bold text-[#0F4C5C]">
            {labels.search} · Ctrl K
          </button>
          <div className="grid gap-1">
            {items.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="rounded-xl px-4 py-3 font-bold text-[#0F4C5C] hover:bg-slate-50">
                {item.label}
              </Link>
            ))}
            {canViewOrganization ? <Link href="/organization" onClick={() => setMobileOpen(false)} className="rounded-xl px-4 py-3 font-bold text-[#0F4C5C] hover:bg-slate-50">{labels.organization}</Link> : null}
            <Link href={workspaceHref} onClick={() => setMobileOpen(false)} className="mt-2 rounded-xl bg-[#009A44] px-4 py-3 text-center font-bold text-white">{workspaceHref === "/workspace" ? labels.openWorkspace : labels.dashboard}</Link>
          </div>
        </div>
      ) : null}

      {authenticated && searchOpen ? (
        <div className="fixed inset-0 z-[80] bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={labels.search} onMouseDown={(event) => { if (event.currentTarget === event.target) setSearchOpen(false); }}>
          <section className="mx-auto mt-[8vh] max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-200 p-4">
              <input ref={searchInput} value={query} onChange={(event) => { const value = event.target.value; setQuery(value); if (value.trim().length < 2) { setResults([]); setSearchError(""); } }} placeholder={labels.searchPlaceholder} className="min-w-0 flex-1 border-0 px-2 py-2 text-lg outline-none" />
              <button type="button" onClick={() => setSearchOpen(false)} className="rounded-full border px-3 py-1.5 text-sm font-bold">Esc</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-3">
              {searchError ? <p className="rounded-xl bg-red-50 p-3 text-red-700" role="alert">{searchError}</p> : null}
              {query.trim().length < 2 ? <p className="p-6 text-center text-slate-500">{labels.searchHint}</p> : searching ? <p className="p-6 text-center text-slate-500">{labels.search}…</p> : results.length ? (
                <div className="grid gap-1">
                  {results.map((result) => (
                    <button key={result.id} type="button" disabled={!safeHref(result.metadata?.href)} onClick={() => openResult(result)} className="rounded-2xl p-4 text-start hover:bg-slate-50 disabled:cursor-default">
                      <span className="text-xs font-bold uppercase tracking-wide text-[#009A44]">{result.entityType.replaceAll("_", " ")}</span>
                      <strong className="mt-1 block text-[#0F4C5C]">{result.title}</strong>
                      <span className="mt-1 line-clamp-2 block text-sm text-slate-500">{result.highlight || result.body}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="p-6 text-center text-slate-500">{labels.noSearchResults}</p>}
            </div>
          </section>
        </div>
      ) : null}
    </nav>
  );
}
