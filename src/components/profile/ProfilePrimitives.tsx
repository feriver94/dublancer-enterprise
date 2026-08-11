import type { ReactNode } from "react";

export function ProfileHero({ bannerUrl, avatarUrl, title, subtitle, badges, children }: { bannerUrl?: string | null; avatarUrl?: string | null; title: string; subtitle?: string | null; badges?: ReactNode; children?: ReactNode }) {
  return <section className="profile-hero">
    <div className="profile-hero__banner" style={bannerUrl ? { backgroundImage: `linear-gradient(110deg, rgba(15,76,92,.72), rgba(0,154,68,.45)), url(${bannerUrl})` } : undefined} />
    <div className="profile-hero__body">
      <div className="profile-avatar" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined} aria-label={title}>{avatarUrl ? null : title.slice(0, 2).toUpperCase()}</div>
      <div className="profile-hero__identity"><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}<div className="profile-badges">{badges}</div></div>
      {children}
    </div>
  </section>;
}

export function ProfileSection({ title, children, empty }: { title: string; children: ReactNode; empty?: boolean }) {
  return <section className="profile-section"><h2>{title}</h2>{empty ? <p className="profile-empty">—</p> : children}</section>;
}

export function ProfileStats({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return <div className="profile-stats">{items.map((item) => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}</div>;
}

export function TagList({ items }: { items: string[] }) {
  return <div className="profile-tags">{items.map((item) => <span key={item}>{item}</span>)}</div>;
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase());
}

function detailValue(value: unknown, yes: string, no: string): ReactNode {
  if (typeof value === "boolean") return value ? yes : no;
  if (Array.isArray(value)) return <TagList items={value.map((item) => typeof item === "string" ? humanize(item) : String(item))} />;
  if (value && typeof value === "object") return <StructuredDetails value={value} yes={yes} no={no} />;
  if (typeof value === "string") return /^[A-Z][A-Z0-9_]*$/.test(value) || /^[a-z]+$/.test(value) ? humanize(value.toLocaleLowerCase()) : value;
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function StructuredDetails({ value, yes, no }: { value: unknown; yes: string; no: string }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return <dl className="profile-details">{Object.entries(value as Record<string, unknown>).map(([key, item]) => <div key={key}><dt>{humanize(key)}</dt><dd>{detailValue(item, yes, no)}</dd></div>)}</dl>;
}
