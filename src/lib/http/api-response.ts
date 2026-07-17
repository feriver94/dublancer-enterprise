import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, isAppError } from "@/lib/errors/app-error";
import { logger } from "@/lib/observability/logger";
import { randomUUID } from "node:crypto";

function responseHeaders() { return { "Cache-Control": "no-store", "X-Request-Id": randomUUID() }; }

function serializeForJson(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeForJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeForJson(nestedValue),
      ]),
    );
  }

  return value;
}

export function apiSuccess<T>(
  data: T,
  status = 200,
  meta?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      data: serializeForJson(data),
      ...(meta ? { meta: serializeForJson(meta) } : {}),
    },
    {
      status,
      headers: responseHeaders(),
    },
  );
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request payload is invalid.",
          details: serializeForJson(error.flatten()),
        },
      },
      {
        status: 422,
        headers: responseHeaders(),
      },
    );
  }

  if (isAppError(error)) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined
            ? { details: serializeForJson(error.details) }
            : {}),
        },
      },
      {
        status: error.statusCode,
        headers: responseHeaders(),
      },
    );
  }

  logger.error("api.unhandled_error", { error });

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    },
    {
      status: 500,
      headers: responseHeaders(),
    },
  );
}

export function badRequest(
  message: string,
  details?: unknown,
): never {
  throw new AppError(
    "BAD_REQUEST",
    message,
    400,
    details,
  );
}
