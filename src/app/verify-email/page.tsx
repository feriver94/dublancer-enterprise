"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
export default function VerifyEmailPage(){const t=useTranslations("Auth");const [status,setStatus]=useState(t("verifying"));useEffect(()=>{const task=setTimeout(async()=>{try{const token=new URLSearchParams(window.location.search).get("token")??"";const c=await fetch("/api/auth/csrf",{cache:"no-store"});const cb=await c.json();const r=await fetch("/api/auth/email-verification/verify",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":cb.data?.csrfToken??""},body:JSON.stringify({token})});if(!r.ok)throw new Error();setStatus(t("emailVerified"));}catch{setStatus(t("verificationFailed"));}},0);return()=>clearTimeout(task);},[t]);return <main className="auth-status"><h1>{t("verifyEmail")}</h1><p>{status}</p><Link href="/login">{t("signIn")}</Link></main>}
