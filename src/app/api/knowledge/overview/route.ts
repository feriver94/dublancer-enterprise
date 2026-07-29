import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { KnowledgeManagementService } from "@/lib/services/knowledge-management.service";
import { knowledgeActionSchema } from "@/lib/validation/phase9";

const service = new KnowledgeManagementService();

export async function GET() {
  try {
    return apiSuccess(await service.dashboard(await getAuthenticatedContext()));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireCsrfToken(request);
    const context = await getAuthenticatedContext();
    const input = knowledgeActionSchema.parse(await request.json());
    switch (input.action) {
      case "category.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createCategory(context, data), 201);
      }
      case "article.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createArticle(context, data), 201);
      }
      case "article.version.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createVersion(context, data), 201);
      }
      case "article.submit": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.submitArticle(context, data));
      }
      case "approval.decide": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.decideApproval(context, data));
      }
      case "article.publish":
        return apiSuccess(await service.publishArticle(context, input.articleId));
      case "article.archive":
        return apiSuccess(await service.archiveArticle(context, input.articleId));
      case "faq.upsert": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.upsertFaq(context, data), input.faqId ? 200 : 201);
      }
    }
  } catch (error) {
    return apiError(error);
  }
}
