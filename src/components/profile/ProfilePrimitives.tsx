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
