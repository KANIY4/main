import type { z } from 'zod';

/**
 * Result-style parsing.
 *
 * Throwing is right at an API boundary; it is wrong when validating model output, where
 * a failure is an expected branch that triggers a repair prompt or a retry. Both shapes
 * are provided so neither case has to fight the other's ergonomics.
 */

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function safeParse<T>(schema: z.ZodType<T>, value: unknown): ParseResult<T> {
  const result = schema.safeParse(value);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, issues: toIssues(result.error) };
}

export class ValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super(`${message}: ${issues.map((i) => `${i.path} — ${i.message}`).join('; ')}`);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

/** Parses or throws a `ValidationError` carrying every issue, not just the first. */
export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, context: string): T {
  const result = safeParse(schema, value);
  if (!result.ok) throw new ValidationError(`Invalid ${context}`, result.issues);
  return result.data;
}
