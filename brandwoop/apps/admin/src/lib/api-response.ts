import type { ApiError } from "@brandwoop/contracts";

export const API_ERROR_CODES = {
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_CODES;

export interface ResponseMeta {
  readonly requestId: string;
  readonly pagination?: { cursor: string | null; hasMore: boolean };
}

export interface ApiEnvelope<T> {
  readonly data: T | null;
  readonly error: ApiError | null;
  readonly meta: ResponseMeta;
}

export function successEnvelope<T>(data: T, meta: ResponseMeta): ApiEnvelope<T> {
  return { data, error: null, meta };
}

export function errorEnvelope(
  code: ApiErrorCode,
  message: string,
  meta: ResponseMeta,
  details?: ApiError["details"],
): ApiEnvelope<never> {
  return {
    data: null,
    error: details === undefined ? { code, message } : { code, message, details },
    meta,
  };
}

export function statusForCode(code: ApiErrorCode): number {
  return API_ERROR_CODES[code];
}

/**
 * Correlation ID for one request. It appears in the response envelope and in
 * every log line for the request, so a client can quote it to support without
 * anyone needing to search by personal data.
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}
