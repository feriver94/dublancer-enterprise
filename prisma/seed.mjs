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
  await prisma.subscriptionPlan.upsert({
    where: { code: "ENTERPRISE" },
    update: { name: "Enterprise", entitlements: { governedAi: true, enterpriseFiles: true, analytics: true, orchestration: true, workGraph: true, compliance: true }, isActive: true },
    create: { code: "ENTERPRISE", name: "Enterprise", description: "Governed work lifecycle for enterprise organizations.", priceMinor: BigInt(0), currency: "AED", interval: "CUSTOM", entitlements: { governedAi: true, enterpriseFiles: true, analytics: true, orchestration: true, workGraph: true, compliance: true } },
  });
  console.log("Dublancer reference data seeded.");
} finally {
  await prisma.$disconnect();
}
