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
for (const namespace of ["Dashboard", "Marketplace", "Files", "Analytics", "Search", "Notifications", "Chat", "Finance", "Contracts", "Workspace", "AiGovernance", "Operations", "Status", "Errors"]) {
  if (!en[namespace] || !ar[namespace]) throw new Error(`Required locale namespace ${namespace} is missing.`);
}
const rootLayout = await readFile(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
if (!rootLayout.includes("dir={locale.direction}") || !rootLayout.includes("lang={locale.locale}")) throw new Error("Root locale direction or language binding is missing.");
const formatters = await readFile(new URL("../src/lib/locale/formatters.ts", import.meta.url), "utf8");
if (!formatters.includes('const UAE_TIMEZONE = "Asia/Dubai"') || !formatters.includes('const UAE_CURRENCY = "AED"')) throw new Error("UAE date/currency formatting contract is missing.");
const canonicalClients = [
  "src/components/layout/Navbar.tsx",
  "src/components/layout/Footer.tsx",
  "src/components/dashboard/DashboardClient.tsx",
  "src/components/dashboard/QuickActions.tsx",
  "src/components/dashboard/AIWidget.tsx",
  "src/components/marketplace/MarketplaceClient.tsx",
  "src/components/marketplace/ProposalReviewClient.tsx",
  "src/components/payments/PaymentsClient.tsx",
  "src/components/chat/ChatWorkspaceClient.tsx",
  "src/components/notifications/NotificationInboxClient.tsx",
  "src/components/files/FileBrowserClient.tsx",
  "src/components/search/SearchProductClient.tsx",
  "src/components/analytics/AnalyticsDashboardClient.tsx",
  "src/components/ai-platform/AiGovernanceWorkspaceClient.tsx",
  "src/components/admin/EnterpriseOperationsClient.tsx",
  "src/components/contracts/ContractDetailClient.tsx",
  "src/components/contracts/ContractsClient.tsx",
  "src/components/workspace/WorkspaceClient.tsx",
  "src/components/workspace/AdvancedDeliveryClient.tsx",
];
for (const file of canonicalClients) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  if (!source.includes("useTranslations") && !source.includes("getTranslations")) throw new Error(`${file} is not localized.`);
  if (/(?:toLocale(?:String|DateString)|Intl\.(?:DateTimeFormat|NumberFormat))\(\"en-AE\"/.test(source)) throw new Error(`${file} contains hard-coded locale formatting.`);
  if (/\b(?:text-left|ml-auto|mr-auto)\b/.test(source)) throw new Error(`${file} contains a direction-specific layout class.`);
}
console.log(`Locale parity verified (${enKeys.length} messages per locale).`);
