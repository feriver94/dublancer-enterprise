"use client";

import { useId, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { countryOptions } from "@/lib/locale/countries";

export type OrganizationLocation = { label: string; countryCode: string };
export type OrganizationPortfolioItem = { title: string; description?: string | null; url?: string | null };

function normalizedStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

export function CountrySelect({ label, name, value, required = false }: { label: string; name: string; value?: string | null; required?: boolean }) {
  const locale = useLocale();
  const options = useMemo(() => countryOptions(locale, value), [locale, value]);
  return <label>{label}<select name={name} defaultValue={value?.toUpperCase() || "AE"} required={required}>{options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>;
}

export function MultiValueField({ label, name, values, placeholder, addLabel, removeLabel, help }: { label: string; name: string; values: string[]; placeholder: string; addLabel: string; removeLabel: string; help: string }) {
  const id = useId();
  const [items, setItems] = useState(() => normalizedStringList(values));
  const [draft, setDraft] = useState("");

  function add() {
    const candidates = draft.split(",").map((item) => item.trim()).filter(Boolean);
    if (!candidates.length) return;
    setItems((current) => [...current, ...candidates.filter((candidate) => !current.some((item) => item.toLocaleLowerCase() === candidate.toLocaleLowerCase()))]);
    setDraft("");
  }

  return <fieldset className="profile-tags-field">
    <legend>{label}</legend>
    <div className="profile-tags-field__items" aria-live="polite">{items.map((item) => <span key={item}>{item}<button type="button" onClick={() => setItems((current) => current.filter((entry) => entry !== item))} aria-label={`${removeLabel}: ${item}`}>×</button><input type="hidden" name={name} value={item} /></span>)}</div>
    <div className="profile-tags-field__entry"><input id={id} name={name} value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(); } else if (event.key === "Backspace" && !draft && items.length) { setItems((current) => current.slice(0, -1)); } }} /><button type="button" onClick={add} disabled={!draft.trim()}>{addLabel}</button></div>
    <small id={`${id}-help`}>{help}</small>
  </fieldset>;
}

export function MultiChoiceField({ label, name, values, options }: { label: string; name: string; values: string[]; options: Array<{ value: string; label: string }> }) {
  const known = new Set(options.map((option) => option.value));
  return <fieldset className="profile-choice-field"><legend>{label}</legend><div>{options.map((option) => <label key={option.value}><input type="checkbox" name={name} value={option.value} defaultChecked={values.includes(option.value)} />{option.label}</label>)}{values.filter((value) => !known.has(value)).map((value) => <label key={value}><input type="checkbox" name={name} value={value} defaultChecked />{value.replaceAll("_", " ").toLocaleLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase())}</label>)}</div></fieldset>;
}

function asLocations(value: unknown): OrganizationLocation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => item && typeof item === "object" && typeof (item as OrganizationLocation).label === "string" && typeof (item as OrganizationLocation).countryCode === "string" ? [{ label: (item as OrganizationLocation).label, countryCode: (item as OrganizationLocation).countryCode.toUpperCase() }] : []);
}

export function LocationsEditor({ label, value, cityLabel, countryLabel, addLabel, removeLabel, emptyLabel }: { label: string; value: unknown; cityLabel: string; countryLabel: string; addLabel: string; removeLabel: string; emptyLabel: string }) {
  const locale = useLocale();
  const [items, setItems] = useState(() => asLocations(value));
  const options = useMemo(() => countryOptions(locale, items.find((item) => item.countryCode)?.countryCode), [items, locale]);
  const update = (index: number, patch: Partial<OrganizationLocation>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return <fieldset className="profile-structured-editor profile-form__wide"><legend>{label}</legend>
    <input type="hidden" name="locations" value={JSON.stringify(items.filter((item) => item.label.trim()))} />
    {items.length ? <div className="profile-structured-editor__list">{items.map((item, index) => <div className="profile-structured-editor__row" key={index}>
      <label>{cityLabel}<input value={item.label} onChange={(event) => update(index, { label: event.target.value })} maxLength={160} required /></label>
      <label>{countryLabel}<select value={item.countryCode} onChange={(event) => update(index, { countryCode: event.target.value })}>{options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>
      <button type="button" className="profile-structured-editor__remove" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>{removeLabel}</button>
    </div>)}</div> : <p className="profile-empty">{emptyLabel}</p>}
    <button type="button" className="profile-structured-editor__add" onClick={() => setItems((current) => [...current, { label: "", countryCode: "AE" }])}>{addLabel}</button>
  </fieldset>;
}

function asPortfolio(value: unknown): OrganizationPortfolioItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => item && typeof item === "object" && typeof (item as OrganizationPortfolioItem).title === "string" ? [{ title: (item as OrganizationPortfolioItem).title, description: typeof (item as OrganizationPortfolioItem).description === "string" ? (item as OrganizationPortfolioItem).description : null, url: typeof (item as OrganizationPortfolioItem).url === "string" ? (item as OrganizationPortfolioItem).url : null }] : []);
}

export function PortfolioEditor({ label, value, titleLabel, descriptionLabel, urlLabel, addLabel, removeLabel, emptyLabel }: { label: string; value: unknown; titleLabel: string; descriptionLabel: string; urlLabel: string; addLabel: string; removeLabel: string; emptyLabel: string }) {
  const [items, setItems] = useState(() => asPortfolio(value));
  const update = (index: number, patch: Partial<OrganizationPortfolioItem>) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return <fieldset className="profile-structured-editor profile-form__wide"><legend>{label}</legend>
    <input type="hidden" name="portfolio" value={JSON.stringify(items.filter((item) => item.title.trim()))} />
    {items.length ? <div className="profile-structured-editor__list">{items.map((item, index) => <div className="profile-structured-editor__row profile-structured-editor__row--portfolio" key={index}>
      <label>{titleLabel}<input value={item.title} onChange={(event) => update(index, { title: event.target.value })} maxLength={160} required /></label>
      <label>{urlLabel}<input type="url" value={item.url ?? ""} onChange={(event) => update(index, { url: event.target.value || null })} /></label>
      <label className="profile-form__wide">{descriptionLabel}<textarea value={item.description ?? ""} onChange={(event) => update(index, { description: event.target.value || null })} maxLength={2000} /></label>
      <button type="button" className="profile-structured-editor__remove" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>{removeLabel}</button>
    </div>)}</div> : <p className="profile-empty">{emptyLabel}</p>}
    <button type="button" className="profile-structured-editor__add" onClick={() => setItems((current) => [...current, { title: "", description: null, url: null }])}>{addLabel}</button>
  </fieldset>;
}
