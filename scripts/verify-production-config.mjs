import { access, readFile } from "node:fs/promises";

const files = [
  "Dockerfile",
  "deploy/kubernetes/base/deployment.yaml",
  "deploy/kubernetes/base/hpa.yaml",
  "deploy/kubernetes/base/pdb.yaml",
  "deploy/kubernetes/base/network-policy.yaml",
  "deploy/kubernetes/overlays/uae-north/kustomization.yaml",
  "deploy/kubernetes/overlays/europe-west/kustomization.yaml",
  "deploy/kubernetes/profiles/blue-green.yaml",
  "deploy/backup/backup-cronjob.yaml",
  "deploy/backup/restore-verification-cronjob.yaml",
  "deploy/observability/otel-collector.yaml",
  "deploy/observability/prometheus-rules.yaml",
  "deploy/observability/alertmanager.example.yaml",
  "deploy/observability/grafana-platform-overview.json",
  "deploy/observability/grafana-performance.json",
];
for (const file of files) await access(new URL(`../${file}`, import.meta.url));
const deployment = await readFile(new URL("../deploy/kubernetes/base/deployment.yaml", import.meta.url), "utf8");
for (const contract of ["maxUnavailable: 0", "/api/health/ready", "/api/health/live", "runAsNonRoot: true", "readOnlyRootFilesystem: true", "topologySpreadConstraints:"]) {
  if (!deployment.includes(contract)) throw new Error(`Deployment contract missing: ${contract}`);
}
const hpa = await readFile(new URL("../deploy/kubernetes/base/hpa.yaml", import.meta.url), "utf8");
if (!hpa.includes("autoscaling/v2") || !hpa.includes("stabilizationWindowSeconds")) throw new Error("Autoscaling behavior is incomplete.");
const collector = await readFile(new URL("../deploy/observability/otel-collector.yaml", import.meta.url), "utf8");
for (const signal of ["traces:", "metrics:", "logs:", "memory_limiter", "tail_sampling"]) {
  if (!collector.includes(signal)) throw new Error(`Collector contract missing: ${signal}`);
}
for (const file of files.filter((entry) => entry.endsWith(".json"))) JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
console.log(`Production configuration checks passed (${files.length} deployment and operations artifacts).`);
