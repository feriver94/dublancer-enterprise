import { readFile } from "node:fs/promises";

const flatten = (value, prefix = "") => Object.entries(value).flatMap(([key, nested]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return nested && typeof nested === "object" && !Array.isArray(nested) ? flatten(nested, path) : [path];
}).sort();

const en = JSON.parse(await readFile(new URL("../messages/en-AE.json", import.meta.url), "utf8"));
const ar = JSON.parse(await readFile(new URL("../messages/ar-AE.json", import.meta.url), "utf8"));
const enKeys = flatten(en);
const arKeys = flatten(ar);
if (JSON.stringify(enKeys) !== JSON.stringify(arKeys)) throw new Error("Locale keys do not match.");
const arText = JSON.stringify(ar);
if (!/[\u0600-\u06ff]/.test(arText)) throw new Error("Arabic locale does not contain Arabic text.");
console.log(`Locale parity verified (${enKeys.length} messages per locale).`);
