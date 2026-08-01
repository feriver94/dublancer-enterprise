import { access, readFile } from "node:fs/promises";

const documents = new Map([
  ["RELEASE_NOTES_v1.0.md", ["Release identity", "What is included", "Upgrade notes", "Known operational boundaries"]],
  ["DEPLOYMENT_GUIDE.md", ["Required configuration", "Database release procedure", "Rolling deployment", "Blue/green deployment", "Rollback"]],
  ["OPERATIONS_RUNBOOK.md", ["Service objectives", "Incident command", "High error rate", "Queue backlog or dead letters"]],
  ["DISASTER_RECOVERY.md", ["Recovery policy", "Backup requirements", "Restore verification", "Regional database disaster"]],
  ["SECURITY_BASELINE.md", ["Trust boundaries", "Authorization and tenant isolation", "Supply-chain baseline", "Security release gates"]],
  ["PERFORMANCE_REPORT.md", ["Performance objectives", "Implemented optimizations", "Load-test procedure", "Capacity decision rules"]],
  ["FINAL_ENTERPRISE_AUDIT.md", ["Conclusion", "Finding disposition", "Security outcome", "Final residual boundaries"]],
  ["ENTERPRISE_RELEASE_PACKAGE_v1.0.md", ["Completed phase history", "Required v1.0 documents", "Release verification entry points", "Release acceptance"]],
  ["PHASE10_IMPLEMENTATION_REPORT.md", ["Scope and authority", "Delivered milestones", "Prisma changes", "Verification evidence"]],
]);

for (const [file, headings] of documents) {
  const url = new URL(`../${file}`, import.meta.url);
  await access(url);
  const source = await readFile(url, "utf8");
  if (/\b(?:TODO|TBD|FIXME)\b/.test(source)) throw new Error(`${file} contains an unfinished marker.`);
  for (const heading of headings) {
    if (!source.includes(`## ${heading}`)) throw new Error(`${file} is missing section: ${heading}`);
  }
}

const packageIndex = await readFile(new URL("../ENTERPRISE_RELEASE_PACKAGE_v1.0.md", import.meta.url), "utf8");
for (let phase = 2; phase <= 10; phase += 1) {
  if (!packageIndex.includes(`PHASE${phase}_IMPLEMENTATION_REPORT.md`)) {
    throw new Error(`Release package is missing Phase ${phase} evidence.`);
  }
}
console.log(`Release documentation verified (${documents.size} required artifacts; Phases 2-10 indexed).`);
