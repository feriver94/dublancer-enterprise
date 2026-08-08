import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";

const certificatePath = process.env.TLS_CERT_PATH?.trim();
const keyPath = process.env.TLS_KEY_PATH?.trim();
const target = new URL(process.env.TLS_PROXY_TARGET?.trim() || "http://127.0.0.1:3000");
const host = process.env.TLS_PROXY_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.TLS_PROXY_PORT || 3443);

if (!certificatePath || !keyPath) {
  throw new Error("TLS_CERT_PATH and TLS_KEY_PATH are required for the HTTPS reverse proxy.");
}
if (!["http:", "https:"].includes(target.protocol)) {
  throw new Error("TLS_PROXY_TARGET must use HTTP or HTTPS.");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("TLS_PROXY_PORT must be a valid TCP port.");
}

const [certificate, key] = await Promise.all([
  readFile(certificatePath),
  readFile(keyPath),
]);
const forward = target.protocol === "https:" ? httpsRequest : httpRequest;

const server = createHttpsServer({ cert: certificate, key }, (incoming, outgoing) => {
  const headers = {
    ...incoming.headers,
    host: incoming.headers.host ?? target.host,
    "x-forwarded-host": incoming.headers.host ?? target.host,
    "x-forwarded-proto": "https",
  };
  const upstream = forward({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || (target.protocol === "https:" ? 443 : 80),
    method: incoming.method,
    path: incoming.url,
    headers,
  }, (response) => {
    outgoing.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(outgoing);
  });
  upstream.on("error", () => {
    if (!outgoing.headersSent) {
      outgoing.writeHead(502, { "content-type": "application/json", "cache-control": "no-store" });
    }
    outgoing.end('{"status":"unhealthy"}');
  });
  incoming.pipe(upstream);
});

server.listen(port, host, () => {
  console.log(`HTTPS reverse proxy listening on https://${host}:${port}.`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
