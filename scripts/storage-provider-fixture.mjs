import { createHash } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.env.STORAGE_FIXTURE_PORT ?? 4211);
const token = process.env.STORAGE_SIGNING_TOKEN;
if (!token) throw new Error("STORAGE_SIGNING_TOKEN is required.");
const origin = `http://127.0.0.1:${port}`;
const objects = new Map();
const intents = new Map();
const hash = (value) => createHash("sha256").update(value).digest("hex");

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", origin);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const send = (status, value, headers = {}) => { response.writeHead(status, { "content-type": "application/json", ...headers }); response.end(value === undefined ? undefined : JSON.stringify(value)); };
  if (url.pathname === "/health") return send(200, { status: "ok" });
  if ((url.pathname.startsWith("/v1/sign/") || url.pathname === "/v1/uploads/verify") && request.headers.authorization !== `Bearer ${token}`) return send(401, { error: "unauthorized" });
  if (url.pathname === "/v1/sign/upload" && request.method === "POST") { const input = JSON.parse(body.toString()); intents.set(input.storageKey, input); return send(200, { url: `${origin}/objects/${encodeURIComponent(input.storageKey)}`, method: "PUT", headers: { "content-type": input.mimeType, "x-upload-token": token }, expiresAt: new Date(Date.now() + 600_000).toISOString() }); }
  if (url.pathname.startsWith("/objects/") && request.method === "PUT") { if (request.headers["x-upload-token"] !== token) return send(401, { error: "unauthorized" }); const key = decodeURIComponent(url.pathname.slice(9)); objects.set(key, { body, mimeType: String(request.headers["content-type"] ?? "application/octet-stream") }); return send(200); }
  if (url.pathname === "/v1/uploads/verify" && request.method === "POST") { const input = JSON.parse(body.toString()); const object = objects.get(input.storageKey); if (!object) return send(404, { error: "not found" }); return send(200, { providerReference: `object:${hash(input.storageKey).slice(0, 16)}`, mimeType: object.mimeType, sizeBytes: object.body.length, checksumSha256: hash(object.body), etag: hash(object.body).slice(0, 32) }); }
  if (url.pathname === "/v1/sign/download" && request.method === "POST") { const input = JSON.parse(body.toString()); return send(200, { url: `${origin}/objects/${encodeURIComponent(input.storageKey)}`, method: "GET", headers: { "x-download-token": token }, expiresAt: new Date(Date.now() + 600_000).toISOString() }); }
  if (url.pathname.startsWith("/objects/") && request.method === "GET") { if (request.headers["x-download-token"] !== token) return send(401, { error: "unauthorized" }); const object = objects.get(decodeURIComponent(url.pathname.slice(9))); if (!object) return send(404, { error: "not found" }); response.writeHead(200, { "content-type": object.mimeType }); return response.end(object.body); }
  return send(404, { error: "not found" });
}).listen(port, "127.0.0.1", () => process.stdout.write(`storage fixture ${origin}\n`));
