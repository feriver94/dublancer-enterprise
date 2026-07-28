import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const skills = [
  ["product-design", "Product Design", "تصميم المنتجات", "Design"],
  ["nextjs", "Next.js", "نكست جي إس", "Engineering"],
  ["typescript", "TypeScript", "تايب سكربت", "Engineering"],
  ["data-analysis", "Data Analysis", "تحليل البيانات", "Data"],
  ["cybersecurity", "Cybersecurity", "الأمن السيبراني", "Security"],
  ["arabic-copywriting", "Arabic Copywriting", "كتابة المحتوى العربي", "Content"],
];

const flags = [
  ["marketplace.enabled", "Enterprise marketplace workflows"],
  ["files.enabled", "Enterprise file management"],
  ["ai.enabled", "Governed AI workspace"],
  ["finance.enabled", "Contract finance and payments"],
  ["orchestration.enabled", "Governed enterprise orchestration"],
  ["workgraph.enabled", "Tenant work graph and lineage"],
  ["matching.enabled", "Explainable opportunity matching"],
  ["compliance.retention.enabled", "Enterprise retention controls"],
];

try {
  for (const [slug, nameEn, nameAr, category] of skills) {
    await prisma.skill.upsert({ where: { slug }, update: { nameEn, nameAr, category, isActive: true }, create: { slug, nameEn, nameAr, category } });
  }
  for (const [key, description] of flags) {
    await prisma.featureFlag.upsert({ where: { key }, update: { description }, create: { key, description, enabled: false } });
  }
  const plans = [
    {
      code: "STARTER",
      name: "Starter",
      description: "Governed essentials for a growing organization.",
      priceMinor: 0n,
      interval: "MONTH",
      features: ["marketplace", "files", "ai", "analytics"],
      quotas: { ACTIVE_USER: 5n, PROJECT: 10n, AI_TOKEN: 100000n, STORAGE_BYTE: 1073741824n, API_CALL: 10000n },
    },
    {
      code: "BUSINESS",
      name: "Business",
      description: "Advanced delivery and administration for established teams.",
      priceMinor: 49900n,
      interval: "MONTH",
      features: ["marketplace", "files", "ai", "analytics", "orchestration", "workGraph", "audit"],
      quotas: { ACTIVE_USER: 50n, PROJECT: 250n, AI_TOKEN: 5000000n, STORAGE_BYTE: 107374182400n, API_CALL: 1000000n },
    },
    {
      code: "ENTERPRISE",
      name: "Enterprise",
      description: "Governed work lifecycle for enterprise organizations.",
      priceMinor: 0n,
      interval: "CUSTOM",
      features: ["marketplace", "files", "ai", "analytics", "orchestration", "workGraph", "compliance", "audit"],
      quotas: { ACTIVE_USER: 1000n, PROJECT: 10000n, AI_TOKEN: 100000000n, STORAGE_BYTE: 10995116277760n, API_CALL: 100000000n },
    },
  ];
  for (const definition of plans) {
    const entitlements = Object.fromEntries(definition.features.map((key) => [key, true]));
    const plan = await prisma.subscriptionPlan.upsert({
      where: { code: definition.code },
      update: {
        name: definition.name,
        description: definition.description,
        priceMinor: definition.priceMinor,
        interval: definition.interval,
        entitlements,
        isActive: true,
      },
      create: {
        code: definition.code,
        name: definition.name,
        description: definition.description,
        priceMinor: definition.priceMinor,
        currency: "AED",
        interval: definition.interval,
        entitlements,
      },
    });
    for (const key of definition.features) {
      await prisma.planFeatureEntitlement.upsert({
        where: { planId_key: { planId: plan.id, key } },
        update: { enabled: true },
        create: { planId: plan.id, key, enabled: true },
      });
    }
    for (const [unit, limit] of Object.entries(definition.quotas)) {
      await prisma.planUsageQuota.upsert({
        where: { planId_unit: { planId: plan.id, unit } },
        update: { limit, enforcement: "HARD" },
        create: { planId: plan.id, unit, limit, enforcement: "HARD" },
      });
    }
  }

  const emailTemplates = [
    ["account-verification", "Verify your Dublancer email", "Verify your Dublancer account by opening {{actionUrl}}", "تحقق من بريدك الإلكتروني في Dublancer", "تحقق من حسابك في Dublancer عبر الرابط {{actionUrl}}"],
    ["password-reset", "Reset your Dublancer password", "Reset your password securely at {{actionUrl}}", "إعادة تعيين كلمة مرور Dublancer", "أعد تعيين كلمة المرور بأمان عبر الرابط {{actionUrl}}"],
    ["email-change-verification", "Verify your new Dublancer email", "Confirm this email change at {{actionUrl}}", "تحقق من بريدك الجديد في Dublancer", "أكد تغيير البريد الإلكتروني عبر الرابط {{actionUrl}}"],
    ["organization-invitation", "You are invited to {{organizationName}}", "Join {{organizationName}} at {{actionUrl}}", "دعوة للانضمام إلى {{organizationName}}", "انضم إلى {{organizationName}} عبر الرابط {{actionUrl}}"],
    ["device-verification", "Verify your Dublancer device", "Verify this sign-in device at {{actionUrl}}", "تحقق من جهاز Dublancer", "تحقق من جهاز تسجيل الدخول عبر الرابط {{actionUrl}}"],
    ["security-account-lock", "Dublancer security alert", "Sign-in was temporarily locked until {{lockedUntil}}. Review security at {{actionUrl}}", "تنبيه أمني من Dublancer", "تم قفل تسجيل الدخول مؤقتاً حتى {{lockedUntil}}. راجع الأمان عبر {{actionUrl}}"],
    ["notification", "Dublancer notification", "{{message}} {{actionUrl}}", "إشعار من Dublancer", "{{message}} {{actionUrl}}"],
  ];
  for (const [key, subjectEn, bodyEn, subjectAr, bodyAr] of emailTemplates) {
    for (const [locale, subject, body, direction] of [
      ["en-AE", subjectEn, bodyEn, "ltr"],
      ["ar-AE", subjectAr, bodyAr, "rtl"],
    ]) {
      await prisma.emailTemplate.upsert({
        where: { scope_key_locale: { scope: "platform", key, locale } },
        update: {
          subject,
          textBody: body,
          htmlBody: `<div dir="${direction}" style="font-family:Arial,sans-serif;color:#0F4C5C"><div style="border-top:4px solid {{primaryColor}};padding:24px"><strong>Dublancer</strong><p>${body}</p></div></div>`,
          isActive: true,
        },
        create: {
          scope: "platform",
          key,
          locale,
          subject,
          textBody: body,
          htmlBody: `<div dir="${direction}" style="font-family:Arial,sans-serif;color:#0F4C5C"><div style="border-top:4px solid {{primaryColor}};padding:24px"><strong>Dublancer</strong><p>${body}</p></div></div>`,
        },
      });
    }
  }
  console.log("Dublancer reference data seeded.");
} finally {
  await prisma.$disconnect();
}
