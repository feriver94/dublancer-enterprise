import { prisma } from "@/lib/database/prisma";

type CompletionCheck = { key: string; complete: boolean };

function summarize(checks: CompletionCheck[]) {
  const completed = checks.filter((check) => check.complete).length;
  return {
    completed,
    total: checks.length,
    percentage: checks.length ? Math.round((completed / checks.length) * 100) : 0,
    missing: checks.filter((check) => !check.complete).map((check) => check.key),
  };
}

const present = (value: unknown) => {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
};

export class ProfileCompletionService {
  async forUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        displayName: true,
        emailVerified: true,
        personalIdentity: { select: { preferredName: true, countryCode: true, timezone: true, identityCompletedAt: true } },
        clientProfile: true,
        freelancerProfile: {
          include: {
            skills: { select: { skillId: true } },
            portfolioItems: { where: { deletedAt: null }, select: { id: true } },
            workExperiences: { where: { deletedAt: null }, select: { id: true } },
            educations: { where: { deletedAt: null }, select: { id: true } },
            certifications: { where: { deletedAt: null }, select: { id: true } },
          },
        },
        profileSocialLinks: { where: { deletedAt: null }, select: { personaType: true } },
      },
    });

    if (!user) return { personal: summarize([]), client: summarize([]), freelancer: summarize([]) };
    const clientLinks = user.profileSocialLinks.some((link) => link.personaType === "CLIENT");
    const freelancerLinks = user.profileSocialLinks.some((link) => link.personaType === "FREELANCER");
    const client = user.clientProfile;
    const freelancer = user.freelancerProfile;

    return {
      personal: summarize([
        { key: "username", complete: present(user.username) },
        { key: "displayName", complete: present(user.displayName) },
        { key: "identity", complete: present(user.personalIdentity?.identityCompletedAt) },
        { key: "country", complete: present(user.personalIdentity?.countryCode) },
        { key: "timezone", complete: present(user.personalIdentity?.timezone) },
        { key: "emailVerification", complete: present(user.emailVerified) },
      ]),
      client: summarize([
        { key: "displayName", complete: present(client?.displayName) },
        { key: "headline", complete: present(client?.headline) },
        { key: "about", complete: present(client?.about) },
        { key: "avatar", complete: present(client?.avatarUrl) },
        { key: "banner", complete: present(client?.bannerUrl) },
        { key: "industry", complete: present(client?.industry) },
        { key: "companySize", complete: present(client?.companySize) },
        { key: "languages", complete: present(client?.languages) },
        { key: "hiringPreferences", complete: present(client?.hiringPreferences) },
        { key: "engagementModels", complete: present(client?.engagementModels) },
        { key: "socialLinks", complete: clientLinks },
        { key: "published", complete: client?.visibility === "PUBLIC" || client?.visibility === "VERIFIED" },
      ]),
      freelancer: summarize([
        { key: "headline", complete: present(freelancer?.headline) },
        { key: "summary", complete: present(freelancer?.bio) },
        { key: "avatar", complete: present(freelancer?.avatarUrl) },
        { key: "banner", complete: present(freelancer?.bannerUrl) },
        { key: "rate", complete: present(freelancer?.hourlyRateMinor) },
        { key: "languages", complete: present(freelancer?.languages) },
        { key: "industries", complete: present(freelancer?.industries) },
        { key: "services", complete: present(freelancer?.services) },
        { key: "skills", complete: Boolean(freelancer?.skills.length) },
        { key: "portfolio", complete: Boolean(freelancer?.portfolioItems.length) },
        { key: "experience", complete: Boolean(freelancer?.workExperiences.length) },
        { key: "education", complete: Boolean(freelancer?.educations.length) },
        { key: "certification", complete: Boolean(freelancer?.certifications.length) },
        { key: "resume", complete: present(freelancer?.resumeUrl) },
        { key: "socialLinks", complete: freelancerLinks || present(freelancer?.githubUrl) || present(freelancer?.linkedinUrl) },
        { key: "published", complete: freelancer?.visibility === "PUBLIC" || freelancer?.visibility === "VERIFIED" },
      ]),
    };
  }
}
