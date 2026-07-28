import { isAppError } from "@/lib/errors/app-error";

export function scimResponse(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, {
    status,
    headers: {
      "content-type": "application/scim+json",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function scimApiError(error: unknown) {
  if (isAppError(error)) {
    const details =
      error.details && typeof error.details === "object"
        ? (error.details as Record<string, unknown>)
        : {};
    return scimResponse(
      {
        schemas:
          details.schemas ??
          ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: String(error.statusCode),
        detail: error.message,
        ...(details.scimType ? { scimType: details.scimType } : {}),
      },
      error.statusCode,
    );
  }
  return scimResponse(
    {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: "500",
      detail: "An unexpected SCIM provisioning error occurred.",
    },
    500,
  );
}
