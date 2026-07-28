"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card } from "@/components/ui";
import { apiMutation } from "@/lib/client/api-client";
import { useApiResource } from "@/lib/client/use-api-resource";
import { brand } from "@/constants/design";

type IdentityDashboard = {
  policy: {
    requireMfa: boolean;
    requireTrustedDevice: boolean;
    allowPasswordLogin: boolean;
  } | null;
  providers: Array<{
    id: string;
    type: string;
    status: string;
    name: string;
    issuer: string;
    _count: { externalIdentities: number };
  }>;
  identities: Array<{
    id: string;
    email: string;
    provider: { name: string; type: string };
  }>;
  sessions: Array<{
    id: string;
    authMethod: string;
    assuranceLevel: string;
    deviceLabel?: string | null;
    user: { email: string };
  }>;
  scimTokens: Array<{
    id: string;
    name: string;
    tokenPrefix: string;
  }>;
  pamRequests: Array<{ id: string; status: string; reason: string }>;
  pamGrants: Array<{ id: string; permissions: string[]; expiresAt: string }>;
};

type MfaDashboard = {
  factors: Array<{ id: string; type: string; status: string; label?: string | null }>;
  passkeys: Array<{ id: string; label?: string | null; deviceType: string }>;
  backupCodeCount: number;
};

const inputStyle = {
  width: "100%",
  border: `1px solid ${brand.colors.border}`,
  borderRadius: brand.radius.md,
  padding: "11px 12px",
  background: brand.colors.white,
  color: brand.colors.navy,
};

export function EnterpriseIdentityClient({
  organizationId,
  canManage,
}: {
  organizationId: string;
  canManage: boolean;
}) {
  const t = useTranslations("IdentityOperations");
  const common = useTranslations("Common");
  const identity = useApiResource<IdentityDashboard>(
    "/api/identity/administration",
  );
  const mfa = useApiResource<MfaDashboard>("/api/auth/mfa");
  const sessions = useApiResource<{
    sessions: IdentityDashboard["sessions"];
    devices: Array<{ id: string; label?: string | null; status: string }>;
  }>("/api/auth/sessions");
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [totp, setTotp] = useState<{
    factorId: string;
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [scimSecret, setScimSecret] = useState("");

  async function refresh() {
    await Promise.all([identity.refresh(), mfa.refresh(), sessions.refresh()]);
  }

  async function mutate(label: string, operation: () => Promise<unknown>) {
    setPending(label);
    setError("");
    setNotice("");
    try {
      const result = await operation();
      setNotice(common("completed"));
      await refresh();
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("requestFailed"));
      return null;
    } finally {
      setPending("");
    }
  }

  async function createProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const type = String(data.get("type")) as "SAML" | "OIDC";
    const name = String(data.get("name"));
    const slug = String(data.get("slug"));
    const callbackUrl = String(data.get("callbackUrl"));
    const issuer = String(data.get("issuer"));
    const operation =
      type === "OIDC"
        ? {
            action: "provider.create",
            type,
            name,
            slug,
            callbackUrl,
            issuer,
            oidcDiscoveryUrl: String(data.get("endpoint")),
            oidcClientId: String(data.get("clientId")),
            oidcClientSecret: String(data.get("secret")),
            assuranceLevel: "AAL2",
            jitProvisioningEnabled: true,
            status: "ACTIVE",
          }
        : {
            action: "provider.create",
            type,
            name,
            slug,
            callbackUrl,
            issuer,
            entryPoint: String(data.get("endpoint")),
            idpCertificate: String(data.get("certificate")),
            assuranceLevel: "AAL2",
            jitProvisioningEnabled: true,
            status: "ACTIVE",
          };
    const result = await mutate("provider", () =>
      apiMutation("/api/identity/administration", "POST", operation),
    );
    if (result) form.reset();
  }

  async function createScimToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = (await mutate("scim", () =>
      apiMutation("/api/identity/administration", "POST", {
        action: "scim.token.create",
        name: String(new FormData(form).get("name")),
        scopes: ["Users.read", "Users.write"],
      }),
    )) as { secret?: string } | null;
    if (result?.secret) setScimSecret(result.secret);
    if (result) form.reset();
  }

  async function setupTotp() {
    const result = (await mutate("totp", () =>
      apiMutation("/api/auth/mfa", "POST", {
        action: "totp.setup",
        label: t("authenticator"),
      }),
    )) as typeof totp;
    if (result) setTotp(result);
  }

  async function verifyTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!totp) return;
    const result = (await mutate("verify", () =>
      apiMutation("/api/auth/mfa", "POST", {
        action: "totp.verify",
        factorId: totp.factorId,
        code: String(new FormData(event.currentTarget).get("code")),
      }),
    )) as { backupCodes?: string[] } | null;
    if (result?.backupCodes) {
      setBackupCodes(result.backupCodes);
      setTotp(null);
    }
  }

  if (identity.loading || mfa.loading || sessions.loading) {
    return <p>{common("loading")}</p>;
  }

  return (
    <main style={{ padding: "64px 0 96px", display: "grid", gap: 24 }}>
      <div>
        <Badge variant="success">{t("eyebrow")}</Badge>
        <h1 style={{ color: brand.colors.navy, fontSize: 40, margin: "16px 0 10px" }}>
          {t("title")}
        </h1>
        <p style={{ color: brand.colors.muted, maxWidth: 820 }}>{t("description")}</p>
      </div>
      {(notice || error || identity.error || mfa.error) && (
        <Card variant="glass">
          <strong style={{ color: error ? "#B42318" : brand.colors.green }}>
            {error || identity.error || mfa.error || notice}
          </strong>
        </Card>
      )}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
        {[
          [t("providers"), identity.data?.providers.length ?? 0],
          [t("linkedIdentities"), identity.data?.identities.length ?? 0],
          [t("activeSessions"), sessions.data?.sessions.length ?? 0],
          [t("trustedDevices"), sessions.data?.devices.filter((row) => row.status === "VERIFIED").length ?? 0],
          [t("scimTokens"), identity.data?.scimTokens.length ?? 0],
          [t("activeGrants"), identity.data?.pamGrants.length ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)} variant="glass">
            <span style={{ color: brand.colors.muted }}>{label}</span>
            <strong style={{ display: "block", fontSize: 30, color: brand.colors.navy, marginTop: 8 }}>{value}</strong>
          </Card>
        ))}
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 20 }}>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("federation")}</h2>
          <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
            {(identity.data?.providers ?? []).map((provider) => (
              <div key={provider.id} style={{ padding: 12, border: `1px solid ${brand.colors.border}`, borderRadius: brand.radius.md }}>
                <strong style={{ color: brand.colors.navy }}>{provider.name}</strong>
                <div style={{ color: brand.colors.muted }}>{provider.type} · {provider.status} · {provider._count.externalIdentities} {t("users")}</div>
              </div>
            ))}
            {!identity.data?.providers.length && <p>{t("noProviders")}</p>}
          </div>
          {canManage && (
            <form onSubmit={createProvider} style={{ display: "grid", gap: 10 }}>
              <select name="type" style={inputStyle} defaultValue="OIDC">
                <option value="OIDC">OIDC</option>
                <option value="SAML">SAML 2.0</option>
              </select>
              <input required name="name" placeholder={t("providerName")} style={inputStyle} />
              <input required name="slug" placeholder={t("providerSlug")} style={inputStyle} />
              <input required name="issuer" placeholder={t("issuer")} style={inputStyle} />
              <input required name="endpoint" placeholder={t("providerEndpoint")} style={inputStyle} />
              <input required name="callbackUrl" placeholder={t("callbackUrl")} style={inputStyle} />
              <input name="clientId" placeholder={t("clientId")} style={inputStyle} />
              <input name="secret" type="password" placeholder={t("clientSecret")} style={inputStyle} />
              <textarea name="certificate" placeholder={t("certificate")} style={inputStyle} rows={3} />
              <Button type="submit" disabled={Boolean(pending)}>{t("addProvider")}</Button>
            </form>
          )}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("mfaPasskeys")}</h2>
          <p style={{ color: brand.colors.muted }}>
            {mfa.data?.factors.length ?? 0} {t("factors")} · {mfa.data?.passkeys.length ?? 0} {t("passkeys")} · {mfa.data?.backupCodeCount ?? 0} {t("backupCodes")}
          </p>
          <Button onClick={setupTotp} disabled={Boolean(pending)}>{t("setupTotp")}</Button>
          {totp && (
            <form onSubmit={verifyTotp} style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <code style={{ overflowWrap: "anywhere" }}>{totp.secret}</code>
              <input required name="code" inputMode="numeric" pattern="\d{6}" placeholder="000000" style={inputStyle} />
              <Button type="submit">{t("verifyTotp")}</Button>
            </form>
          )}
          {backupCodes.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <strong>{t("saveBackupCodes")}</strong>
              <pre style={{ whiteSpace: "pre-wrap" }}>{backupCodes.join("\n")}</pre>
            </div>
          )}
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("sessionsDevices")}</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {(sessions.data?.sessions ?? []).map((session) => (
              <div key={session.id} style={{ padding: 12, border: `1px solid ${brand.colors.border}`, borderRadius: brand.radius.md }}>
                <strong style={{ color: brand.colors.navy }}>{session.user.email}</strong>
                <div style={{ color: brand.colors.muted }}>{session.authMethod} · {session.assuranceLevel} · {session.deviceLabel ?? t("unknownDevice")}</div>
                <Button variant="outline" onClick={() => mutate("session", () => apiMutation("/api/auth/sessions", "POST", { action: "session.revoke", sessionId: session.id }))}>{t("revoke")}</Button>
              </div>
            ))}
          </div>
        </Card>
        <Card variant="elevated">
          <h2 style={{ color: brand.colors.navy }}>{t("scimPam")}</h2>
          {canManage && (
            <form onSubmit={createScimToken} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <input required name="name" placeholder={t("tokenName")} style={inputStyle} />
              <Button type="submit">{t("issueToken")}</Button>
            </form>
          )}
          {scimSecret && (
            <div style={{ padding: 12, background: brand.colors.background, borderRadius: brand.radius.md }}>
              <strong>{t("copyToken")}</strong>
              <code style={{ display: "block", overflowWrap: "anywhere", marginTop: 8 }}>{scimSecret}</code>
            </div>
          )}
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {(identity.data?.scimTokens ?? []).map((token) => (
              <div key={token.id}>{token.name} · <code>{token.tokenPrefix}…</code></div>
            ))}
            {(identity.data?.pamRequests ?? []).map((request) => (
              <div key={request.id}>{request.status} · {request.reason}</div>
            ))}
          </div>
        </Card>
      </section>
      <small style={{ color: brand.colors.muted }}>{t("tenantScope", { organizationId })}</small>
    </main>
  );
}
