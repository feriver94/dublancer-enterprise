import { prisma } from "@/lib/database/prisma";
import { AppError } from "@/lib/errors/app-error";
import type { AppLocale } from "@/i18n/config";
import type { TenantContext } from "@/lib/tenancy/context";
import { requirePermission } from "@/lib/authorization/policy-engine";

export class LocalePreferenceService {
  async updateUserLocale(
    userId: string,
    locale: AppLocale,
  ) {
    return prisma.user.update({
      where: { id: userId },
      data: { preferredLocale: locale },
      select: {
        id: true,
        email: true,
        preferredLocale: true,
      },
    });
  }

  async updateOrganizationLocale(
    context: TenantContext,
    organizationId: string,
    input: {
      defaultLocale: AppLocale;
      supportedLocales: AppLocale[];
    },
  ) {
    if (
      !context.isPlatformAdmin &&
      context.organizationId !== organizationId
    ) {
      throw new AppError(
        "FORBIDDEN",
        "Cross-organization access is not permitted.",
        403,
      );
    }

    await requirePermission(
      context,
      "organization.settings.manage",
    );

    if (
      !input.supportedLocales.includes(input.defaultLocale)
    ) {
      throw new AppError(
        "BAD_REQUEST",
        "The default locale must be included in supported locales.",
        400,
      );
    }

    return prisma.organizationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        defaultLocale: input.defaultLocale,
        supportedLocales: input.supportedLocales,
        timezone: "Asia/Dubai",
        defaultCurrency: "AED",
      },
      update: {
        defaultLocale: input.defaultLocale,
        supportedLocales: input.supportedLocales,
        timezone: "Asia/Dubai",
        defaultCurrency: "AED",
      },
    });
  }
}
