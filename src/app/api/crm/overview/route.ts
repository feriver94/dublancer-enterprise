import type { NextRequest } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { requireCsrfToken } from "@/lib/auth/csrf";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { EnterpriseCrmService } from "@/lib/services/enterprise-crm.service";
import { crmActionSchema } from "@/lib/validation/phase9";

const service = new EnterpriseCrmService();

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
    const input = crmActionSchema.parse(await request.json());
    switch (input.action) {
      case "pipeline.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createPipeline(context, data), 201);
      }
      case "lead.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createLead(context, data), 201);
      }
      case "lead.convert": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.convertLead(context, data), 201);
      }
      case "account.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createAccount(context, data), 201);
      }
      case "contact.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createContact(context, data), 201);
      }
      case "opportunity.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createOpportunity(context, data), 201);
      }
      case "opportunity.advance": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.advanceOpportunity(context, data));
      }
      case "activity.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createActivity(context, data), 201);
      }
      case "note.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createNote(context, data), 201);
      }
      case "quote.create": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.createQuote(context, data), 201);
      }
      case "quote.transition": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.transitionQuote(context, data));
      }
      case "health.capture": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.captureHealth(context, data), 201);
      }
      case "metric.record": {
        const { action: _, ...data } = input;
        return apiSuccess(await service.recordMetric(context, data), 201);
      }
    }
  } catch (error) {
    return apiError(error);
  }
}
