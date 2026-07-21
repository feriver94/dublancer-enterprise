import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors/app-error";

export type SignedStorageOperation = {
  url: string;
  method: "GET" | "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export interface StorageProvider {
  readonly key: string;
  createUpload(input: {
    organizationId: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
  }): Promise<SignedStorageOperation>;
  createDownload(input: {
    organizationId: string;
    storageKey: string;
    downloadName: string;
  }): Promise<SignedStorageOperation>;
  verifyUpload(input: {
    organizationId: string;
    storageKey: string;
    expectedMimeType: string;
    expectedSizeBytes: number;
    expectedChecksumSha256: string;
  }): Promise<{
    providerReference: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
    etag?: string;
  }>;
}

export type AiCompletion = {
  output: unknown;
  inputTokens: number;
  outputTokens: number;
  model: string;
  providerReference?: string;
  costMinor?: number;
};

export type AiProviderStatus = {
  key: string;
  status: "healthy" | "degraded" | "not_configured";
  configured: boolean;
  latencyMs: number;
  checkedAt: string;
  message?: string;
};

export interface AiProvider {
  readonly key: string;
  complete(input: {
    model: string;
    system: string;
    user: string;
    metadata: Record<string, string>;
    maxOutputTokens?: number;
  }): Promise<AiCompletion>;
  status(): Promise<AiProviderStatus>;
}

export type PaymentOperation = {
  providerReference: string;
  status: "PROCESSING" | "SUCCEEDED";
  raw: unknown;
};

function paymentOperation(value: unknown): PaymentOperation {
  if (!value || typeof value !== "object") {
    throw new AppError("SERVICE_UNAVAILABLE", "Payment provider returned an invalid operation.", 503);
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.providerReference !== "string" ||
    candidate.providerReference.length < 1 ||
    candidate.providerReference.length > 255 ||
    !["PROCESSING", "SUCCEEDED"].includes(String(candidate.status))
  ) {
    throw new AppError("SERVICE_UNAVAILABLE", "Payment provider returned an invalid operation.", 503);
  }
  return {
    providerReference: candidate.providerReference,
    status: candidate.status as PaymentOperation["status"],
    raw: candidate.raw ?? value,
  };
}

export interface PaymentProvider {
  readonly key: string;
  createCharge(input: {
    organizationId: string;
    amountMinor: string;
    currency: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<PaymentOperation>;
  createRefund(input: {
    organizationId: string;
    originalProviderReference: string;
    amountMinor: string;
    currency: string;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<PaymentOperation>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

export interface NotificationProvider {
  readonly key: string;
  deliver(input: { channel: "EMAIL" | "SMS" | "PUSH"; recipient: string; title: string; body: string; actionUrl?: string | null; idempotencyKey: string; locale: string }): Promise<{ providerReference?: string }>;
}

export interface FileScanProvider {
  readonly key: string;
  submit(input: {
    organizationId: string;
    fileVersionId: string;
    storageProvider: string;
    storageKey: string;
    mimeType: string;
    checksumSha256: string;
  }): Promise<{ providerReference: string }>;
  verifyWebhook(rawBody: string, signature: string): boolean;
}

type BrokerResponse = {
  url: string;
  method: "GET" | "PUT";
  headers?: Record<string, string>;
  expiresAt: string;
};

async function postJson<T>(
  url: string,
  token: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "The configured external provider is unavailable.",
      503,
    );
  }

  if (!response.ok) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      `External provider request failed with status ${response.status}.`,
      503,
    );
  }

  return (await response.json()) as T;
}

class SigningBrokerStorageProvider implements StorageProvider {
  readonly key = process.env.STORAGE_PROVIDER_KEY ?? "signing-broker";

  private config() {
    const endpoint = process.env.STORAGE_SIGNING_ENDPOINT;
    const token = process.env.STORAGE_SIGNING_TOKEN;
    if (!endpoint || !token) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "Enterprise storage is not configured.",
        503,
      );
    }
    return { endpoint: endpoint.replace(/\/$/, ""), token };
  }

  async createUpload(input: Parameters<StorageProvider["createUpload"]>[0]) {
    const config = this.config();
    const result = await postJson<BrokerResponse>(
      `${config.endpoint}/v1/sign/upload`,
      config.token,
      input,
    );
    return { ...result, headers: result.headers ?? {} };
  }

  async createDownload(input: Parameters<StorageProvider["createDownload"]>[0]) {
    const config = this.config();
    const result = await postJson<BrokerResponse>(
      `${config.endpoint}/v1/sign/download`,
      config.token,
      input,
    );
    return { ...result, headers: result.headers ?? {} };
  }

  async verifyUpload(input: Parameters<StorageProvider["verifyUpload"]>[0]) {
    const config = this.config();
    const result = await postJson<{
      providerReference?: string;
      mimeType?: string;
      sizeBytes?: number;
      checksumSha256?: string;
      etag?: string;
    }>(`${config.endpoint}/v1/uploads/verify`, config.token, input);
    if (
      !result.providerReference ||
      !result.mimeType ||
      !Number.isSafeInteger(result.sizeBytes) ||
      !result.checksumSha256 ||
      !/^[a-f0-9]{64}$/i.test(result.checksumSha256)
    ) {
      throw new AppError("SERVICE_UNAVAILABLE", "Storage provider returned invalid upload evidence.", 503);
    }
    return {
      providerReference: result.providerReference,
      mimeType: result.mimeType,
      sizeBytes: result.sizeBytes as number,
      checksumSha256: result.checksumSha256.toLowerCase(),
      ...(result.etag ? { etag: result.etag } : {}),
    };
  }
}

class OpenAiCompatibleProvider implements AiProvider {
  readonly key = process.env.AI_PROVIDER_KEY ?? "openai-compatible";

  async complete(input: Parameters<AiProvider["complete"]>[0]) {
    const baseUrl = process.env.AI_PROVIDER_BASE_URL;
    const apiKey = process.env.AI_PROVIDER_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new AppError("SERVICE_UNAVAILABLE", "AI provider is not configured.", 503);
    }
    const result = await postJson<{
      id?: string;
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost_minor?: number };
    }>(`${baseUrl.replace(/\/$/, "")}/chat/completions`, apiKey, {
      model: input.model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      temperature: 0.2,
      ...(input.maxOutputTokens ? { max_completion_tokens: input.maxOutputTokens } : {}),
      user: createHash("sha256").update(input.metadata.userId ?? "unknown").digest("hex"),
    });
    return {
      output: { text: result.choices?.[0]?.message?.content ?? "" },
      inputTokens: result.usage?.prompt_tokens ?? 0,
      outputTokens: result.usage?.completion_tokens ?? 0,
      model: result.model ?? input.model,
      providerReference: result.id,
      costMinor: Number.isSafeInteger(result.usage?.cost_minor) ? result.usage?.cost_minor : undefined,
    };
  }

  async status(): Promise<AiProviderStatus> {
    const started = Date.now();
    const checkedAt = new Date().toISOString();
    const baseUrl = process.env.AI_PROVIDER_BASE_URL;
    const apiKey = process.env.AI_PROVIDER_API_KEY;
    if (!baseUrl || !apiKey) {
      return { key: this.key, status: "not_configured", configured: false, latencyMs: 0, checkedAt, message: "AI provider credentials are not configured." };
    }
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
      if (!response.ok) {
        return { key: this.key, status: "degraded", configured: true, latencyMs: Date.now() - started, checkedAt, message: `Provider health request returned ${response.status}.` };
      }
      return { key: this.key, status: "healthy", configured: true, latencyMs: Date.now() - started, checkedAt };
    } catch {
      return { key: this.key, status: "degraded", configured: true, latencyMs: Date.now() - started, checkedAt, message: "AI provider health request failed." };
    }
  }
}

class HttpPaymentProvider implements PaymentProvider {
  readonly key = process.env.PAYMENT_PROVIDER_KEY ?? "payment-broker";

  private config() {
    const endpoint = process.env.PAYMENT_PROVIDER_BASE_URL;
    const apiKey = process.env.PAYMENT_PROVIDER_API_KEY;
    if (!endpoint || !apiKey) {
      throw new AppError("SERVICE_UNAVAILABLE", "Payment provider is not configured.", 503);
    }
    return { endpoint: endpoint.replace(/\/$/, ""), apiKey };
  }

  async createCharge(input: Parameters<PaymentProvider["createCharge"]>[0]) {
    const config = this.config();
    return paymentOperation(await postJson<unknown>(
      `${config.endpoint}/v1/charges`,
      config.apiKey,
      input,
      input.idempotencyKey,
    ));
  }

  async createRefund(input: Parameters<PaymentProvider["createRefund"]>[0]) {
    const config = this.config();
    return paymentOperation(await postJson<unknown>(
      `${config.endpoint}/v1/refunds`,
      config.apiKey,
      input,
      input.idempotencyKey,
    ));
  }

  verifyWebhook(rawBody: string, signature: string) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest();
    const provided = Buffer.from(signature, "hex");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }
}

class HttpNotificationProvider implements NotificationProvider {
  readonly key = process.env.NOTIFICATION_PROVIDER_KEY ?? "notification-broker";
  async deliver(input: Parameters<NotificationProvider["deliver"]>[0]) {
    const endpoint = process.env.NOTIFICATION_PROVIDER_BASE_URL;
    const apiKey = process.env.NOTIFICATION_PROVIDER_API_KEY;
    if (!endpoint || !apiKey) throw new AppError("SERVICE_UNAVAILABLE", "Notification provider is not configured.", 503);
    return postJson<{ providerReference?: string }>(`${endpoint.replace(/\/$/, "")}/v1/deliveries`, apiKey, input, input.idempotencyKey);
  }
}

class HmacFileScanProvider implements FileScanProvider {
  readonly key = process.env.FILE_SCAN_PROVIDER_KEY ?? "malware-scan-broker";
  async submit(input: Parameters<FileScanProvider["submit"]>[0]) {
    const endpoint = process.env.FILE_SCAN_PROVIDER_BASE_URL;
    const token = process.env.FILE_SCAN_PROVIDER_API_KEY ?? process.env.FILE_SCAN_PROVIDER_TOKEN;
    if (!endpoint || !token) {
      throw new AppError("SERVICE_UNAVAILABLE", "Malware scanning is not configured.", 503);
    }
    const result = await postJson<{ providerReference?: string }>(
      `${endpoint.replace(/\/$/, "")}/v1/scans`,
      token,
      input,
      `file-scan:${input.fileVersionId}`,
    );
    if (!result.providerReference) {
      throw new AppError("SERVICE_UNAVAILABLE", "Malware scanner returned invalid submission evidence.", 503);
    }
    return { providerReference: result.providerReference };
  }
  verifyWebhook(rawBody: string, signature: string) {
    const secret = process.env.FILE_SCAN_WEBHOOK_SECRET;
    if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest();
    const provided = Buffer.from(signature, "hex");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }
}

export const storageProvider: StorageProvider = new SigningBrokerStorageProvider();
export const aiProvider: AiProvider = new OpenAiCompatibleProvider();
export const paymentProvider: PaymentProvider = new HttpPaymentProvider();
export const notificationProvider: NotificationProvider = new HttpNotificationProvider();
export const fileScanProvider: FileScanProvider = new HmacFileScanProvider();

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
