import { AuthorizationError, type AuthContext } from "@brandwoop/auth";
import type { z } from "zod";

import {
  errorEnvelope,
  newRequestId,
  statusForCode,
  successEnvelope,
  type ApiErrorCode,
  type ResponseMeta,
} from "./api-response";
import { log } from "./logger";

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export interface HandlerArgs<TBody> {
  readonly body: TBody;
  readonly context: AuthContext;
  readonly requestId: string;
}

export interface HandlerOptions<TBody> {
  readonly route: string;
  /** Omit for routes with no request body. */
  readonly bodySchema?: z.ZodType<TBody>;
  readonly resolveContext: (request: Request) => Promise<AuthContext>;
}

const MAX_BODY_BYTES = 1_000_000;

/**
 * One entry point for every versioned API route: correlation ID, body size
 * limit, schema validation, authorisation error mapping and structured logging.
 *
 * Handlers throw; they never build an error response themselves, so error
 * shapes stay identical across the API and no handler leaks an internal
 * message to a client by accident.
 */
export function createApiHandler<TBody = undefined, TResult = unknown>(
  options: HandlerOptions<TBody>,
  handler: (args: HandlerArgs<TBody>) => Promise<TResult>,
): (request: Request) => Promise<Response> {
  return async function route(request: Request): Promise<Response> {
    const requestId = newRequestId();
    const meta: ResponseMeta = { requestId };
    const startedAt = Date.now();

    try {
      const body = await readBody(request, options.bodySchema, requestId);
      const context = await options.resolveContext(request);
      const result = await handler({ body, context, requestId });

      log("info", "request completed", {
        requestId,
        route: options.route,
        tenantId: context.tenantId ?? undefined,
        durationMs: Date.now() - startedAt,
      });

      return json(successEnvelope(result, meta), 200, requestId);
    } catch (error) {
      return handleError(error, options.route, meta, Date.now() - startedAt);
    }
  };
}

async function readBody<TBody>(
  request: Request,
  schema: z.ZodType<TBody> | undefined,
  requestId: string,
): Promise<TBody> {
  if (schema === undefined) {
    return undefined as TBody;
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new ApiError("VALIDATION_FAILED", "Request body exceeds the size limit");
  }

  let parsed: unknown;
  try {
    parsed = raw === "" ? {} : JSON.parse(raw);
  } catch {
    throw new ApiError("VALIDATION_FAILED", "Request body is not valid JSON");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    log("warn", "request rejected by schema", { requestId });
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        issue: issue.message,
      })),
    );
  }

  return result.data;
}

class ValidationError extends Error {
  readonly details: { field: string; issue: string }[];

  constructor(details: { field: string; issue: string }[]) {
    super("Request validation failed");
    this.name = "ValidationError";
    this.details = details;
  }
}

function handleError(
  error: unknown,
  route: string,
  meta: ResponseMeta,
  durationMs: number,
): Response {
  if (error instanceof ValidationError) {
    return json(
      errorEnvelope("VALIDATION_FAILED", error.message, meta, error.details),
      statusForCode("VALIDATION_FAILED"),
      meta.requestId,
    );
  }

  if (error instanceof AuthorizationError) {
    // "not_authenticated" is the only reason that should prompt a sign-in.
    const code: ApiErrorCode =
      error.reason === "not_authenticated" ? "UNAUTHENTICATED" : "FORBIDDEN";
    log("warn", "request denied", {
      requestId: meta.requestId,
      route,
      failureCategory: error.reason,
    });
    return json(errorEnvelope(code, "Not permitted", meta), statusForCode(code), meta.requestId);
  }

  if (error instanceof ApiError) {
    return json(
      errorEnvelope(error.code, error.message, meta),
      statusForCode(error.code),
      meta.requestId,
    );
  }

  // Unexpected failures are logged in full and reported to the client as an
  // opaque 500 carrying only the request ID.
  log("error", "unhandled request failure", {
    requestId: meta.requestId,
    route,
    durationMs,
    failureCategory: error instanceof Error ? error.name : "unknown",
    detail: error instanceof Error ? error.message : String(error),
  });

  return json(
    errorEnvelope("INTERNAL", "An unexpected error occurred", meta),
    statusForCode("INTERNAL"),
    meta.requestId,
  );
}

function json(payload: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}
