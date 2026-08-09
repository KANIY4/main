import { z } from "zod";

/** Primitives shared by every domain schema. */

export const uuid = z.uuid();
export const isoDateTime = z.iso.datetime({ offset: true });
export const isoDate = z.iso.date();

/** IANA timezone name. Validated against the runtime's own tz database. */
export const timezone = z.string().refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("en-AU", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Unknown IANA timezone" },
);

export const latitude = z.number().min(-90).max(90);
export const longitude = z.number().min(-180).max(180);

/** Geofence radius in metres. Bounds keep an operator from disabling the check. */
export const geofenceRadiusMetres = z.number().int().min(20).max(2000);

/** Idempotency key for any write that triggers an async consequence. */
export const idempotencyKey = z.string().min(16).max(128);

export const shortText = z.string().trim().min(1).max(200);
export const longText = z.string().trim().max(4000);

export const paginationQuerySchema = z.object({
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const paginationMetaSchema = z.object({
  cursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.array(z.object({ field: z.string(), issue: z.string() })).optional(),
});

/**
 * Every response uses the same envelope so clients handle one shape.
 * `requestId` is the correlation ID carried through logs.
 */
export function apiResponseSchema<T extends z.ZodType>(data: T) {
  return z.object({
    data: data.nullable(),
    error: apiErrorSchema.nullable(),
    meta: z
      .object({
        requestId: z.string(),
        pagination: paginationMetaSchema.optional(),
      })
      .optional(),
  });
}

export type ApiError = z.infer<typeof apiErrorSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
