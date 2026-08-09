import { z } from "zod";

import {
  geofenceRadiusMetres,
  isoDate,
  isoDateTime,
  latitude,
  longText,
  longitude,
  shortText,
  timezone,
  uuid,
} from "./common";

export const siteStatusSchema = z.enum(["draft", "active", "inactive"]);

export const siteSchema = z.object({
  id: uuid,
  tenantId: uuid,
  name: shortText,
  addressLine: shortText,
  suburb: shortText,
  state: z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]),
  postcode: z.string().regex(/^\d{4}$/),
  timezone,
  latitude,
  longitude,
  geofenceRadiusMetres,
  /** Rejects an attendance location whose device accuracy is worse than this. */
  gpsAccuracyThresholdMetres: z.number().int().min(10).max(500),
  status: siteStatusSchema,
  hazardNotes: longText.nullable(),
  accessNotes: longText.nullable(),
  emergencyContactPhone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .nullable(),
  createdAt: isoDateTime,
});

export const createSiteRequestSchema = siteSchema
  .omit({ id: true, createdAt: true, status: true })
  .extend({
    areas: z.array(shortText).max(100).default([]),
  });

export const siteAreaSchema = z.object({
  id: uuid,
  siteId: uuid,
  name: shortText,
  sortOrder: z.number().int().min(0),
});

export const siteContactSchema = z.object({
  id: uuid,
  siteId: uuid,
  name: shortText,
  email: z.email().nullable(),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .nullable(),
  receivesReports: z.boolean(),
});

export const taskTemplateItemSchema = z.object({
  id: uuid,
  areaId: uuid.nullable(),
  description: shortText,
  isRequired: z.boolean(),
  requiresPhoto: z.boolean(),
  sortOrder: z.number().int().min(0),
});

/**
 * Service plans are versioned. A shift copies the version active on its date so
 * later template edits never rewrite historical evidence.
 */
export const servicePlanSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  version: z.number().int().min(1),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullable(),
  items: z.array(taskTemplateItemSchema).min(1),
});

/** Effective-dated and field-authorised. Excluded from broad site/user queries. */
export const payRateSchema = z.object({
  id: uuid,
  tenantId: uuid,
  workerId: uuid,
  hourlyRateCents: z.number().int().min(0).max(100_000),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullable(),
});

export type Site = z.infer<typeof siteSchema>;
export type SiteStatus = z.infer<typeof siteStatusSchema>;
export type ServicePlan = z.infer<typeof servicePlanSchema>;
export type PayRate = z.infer<typeof payRateSchema>;
