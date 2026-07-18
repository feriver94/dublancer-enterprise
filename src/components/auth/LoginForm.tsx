"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Card, Badge } from "@/components/ui";
import { brand } from "@/constants/design";
import { apiMutation, resetApiClientCsrf } from "@/lib/client/api-client";

function safeReturnTo(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";
}

export default function LoginForm({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await apiMutation("/api/auth/login", "POST", {
        email: data.get("email"),
        password: data.get("password"),
      });
      resetApiClientCsrf();
      router.replace(safeReturnTo(returnTo));
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("requestFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card variant="elevated" style={{ width: "100%", maxWidth: 480 }}>
      <Badge variant="success">{t("welcomeBack")}</Badge>
      <h1 style={{ color: brand.colors.navy, fontSize: brand.typography.heading.h3, marginTop: 24 }}>{t("loginTitle")}</h1>
      <p style={{ color: brand.colors.muted }}>{t("loginDescription")}</p>
      <form className="auth-form" onSubmit={submit}>
        <label>{t("email")}<input name="email" type="email" autoComplete="email" required /></label>
        <label>{t("password")}<input name="password" type="password" autoComplete="current-password" required /></label>
        {error ? <p className="enterprise-error" role="alert">{error}</p> : null}
        <Button variant="primary" type="submit" disabled={pending}>{pending ? t("signingIn") : t("signIn")}</Button>
      </form>
      <p><Link href="/forgot-password">{t("forgotPassword")}</Link></p>
      <p>{t("noAccount")} <Link href="/register">{t("createAccount")}</Link></p>
    </Card>
  );
}
