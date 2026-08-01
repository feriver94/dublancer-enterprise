const target = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
const expectedVersion = process.argv[3];
if (!/^https?:$/.test(target.protocol)) throw new Error("Release target must use HTTP or HTTPS.");
const paths = ["/api/health/live", "/api/health/ready"];
for (const path of paths) {
  const response = await fetch(new URL(path, target), {
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
    headers: { "user-agent": "dublancer-release-verifier/1.0" },
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}.`);
  const body = await response.json();
  if (!body.status) throw new Error(`${path} omitted status.`);
  if (path.endsWith("live") && expectedVersion && body.version !== expectedVersion) throw new Error(`Expected version ${expectedVersion}; received ${body.version}.`);
}
console.log(`Release smoke checks passed for ${target.origin}${expectedVersion ? ` at ${expectedVersion}` : ""}.`);
