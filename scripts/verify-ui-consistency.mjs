import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const aliases = new Map([
  ["src/app/platform/page.tsx", "/admin"],
  ["src/app/admin-control/page.tsx", "/admin"],
  ["src/app/billing/page.tsx", "/payments"],
  ["src/app/ai-copilot/page.tsx", "/ai-platform"],
]);

for (const [path, destination] of aliases) {
  const source = await read(path);
  if (!source.includes(`redirect("${destination}")`)) {
    throw new Error(`${path} does not preserve its canonical compatibility redirect.`);
  }
  if (source.includes("enterprise-module-page")) {
    throw new Error(`${path} still renders the legacy platform console.`);
  }
}

const orchestration = await read("src/app/orchestration/page.tsx");
const navigation = await read("src/components/layout/Navbar.tsx");
const members = await read("src/components/workspace/ProjectMemberManagement.tsx");
const memberRoute = await read("src/app/api/projects/[projectId]/members/[userId]/route.ts");
const browser = await read("tests/browser/accessibility.spec.ts");
const workflow = await read(".github/workflows/browser-compatibility.yml");
if (!orchestration.includes("OrchestrationClient")) throw new Error("The live orchestration client is not mounted.");
if (!navigation.includes('href: "/ai-platform"') || navigation.includes('href: "/ai-copilot"')) {
  throw new Error("Primary navigation does not use the canonical AI workspace route.");
}
for (const contract of ["memberPicker", "updateRole", "removeMember"]) {
  if (!members.includes(contract)) throw new Error(`Member management is missing ${contract}.`);
}
if (!memberRoute.includes("PATCH") || !memberRoute.includes("DELETE")) throw new Error("Member role/removal routes are incomplete.");
if (!browser.includes("AxeBuilder") || !browser.includes("scrollWidth")) throw new Error("Accessibility or responsive browser automation is incomplete.");
for (const engine of ["chromium", "firefox", "webkit"]) {
  if (!workflow.includes(engine)) throw new Error(`Browser matrix is missing ${engine}.`);
}

console.log("UI consistency verified (4 compatibility aliases, live orchestration, member administration, 3 browser engines).\n");
