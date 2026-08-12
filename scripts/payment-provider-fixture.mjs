import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const host = process.env.PAYMENT_FIXTURE_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PAYMENT_FIXTURE_PORT || 4210);
const apiKey = process.env.PAYMENT_PROVIDER_API_KEY?.trim();

if (!apiKey) throw new Error("PAYMENT_PROVIDER_API_KEY is required for the payment fixture.");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PAYMENT_FIXTURE_PORT must be a valid TCP port.");
}

const expectedAuthorization = Buffer.from(`Bearer ${apiKey}`);
const operations = new Map();

function authorized(value = "") {
  const received = Buffer.from(value);
  return received.length === expectedAuthorization.length
    && timingSafeEqual(received, expectedAuthorization);
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end('{"status":"ready"}');
    return;
  }

  if (request.method === "GET" && request.url?.startsWith("/v1/operations?")) {
    if (!authorized(request.headers.authorization)) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end('{"error":"unauthorized"}');
      return;
    }
    const url = new URL(request.url, `http://${host}:${port}`);
    const type = url.searchParams.get("type");
    const idempotencyKey = url.searchParams.get("idempotencyKey");
    const operation = type && idempotencyKey ? operations.get(`${type}:${idempotencyKey}`) : undefined;
    response.writeHead(operation ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(operation ?? { error: "not_found" }));
    return;
  }

  if (request.method !== "POST" || !["/v1/charges", "/v1/refunds"].includes(request.url ?? "")) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"error":"not_found"}');
    return;
  }
  if (!authorized(request.headers.authorization)) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end('{"error":"unauthorized"}');
    return;
  }

  const idempotencyKey = request.headers["idempotency-key"];
  if (typeof idempotencyKey !== "string" || !idempotencyKey) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end('{"error":"missing_idempotency_key"}');
    return;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) {
      response.writeHead(413, { "content-type": "application/json" });
      response.end('{"error":"payload_too_large"}');
      return;
    }
    chunks.push(chunk);
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    response.writeHead(400, { "content-type": "application/json" });
    response.end('{"error":"invalid_json"}');
    return;
  }

  const type = request.url === "/v1/refunds" ? "refund" : "charge";
  const operationKey = `${type}:${idempotencyKey}`;
  const providerReference = operations.get(operationKey)?.providerReference
    ?? `release-${type}-${createHash("sha256").update(operationKey).digest("hex").slice(0, 24)}`;
  operations.set(operationKey, { providerReference, type, payload });
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({
    providerReference,
    status: "PROCESSING",
    raw: { fixture: "release-certification", type },
  }));
});

server.listen(port, host, () => {
  console.log(`Payment provider fixture listening on http://${host}:${port}.`);
});

server.on("error", (error) => {
  console.error(`Payment provider fixture failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
