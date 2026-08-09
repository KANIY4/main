import { z } from "zod";

import { isoDateTime, shortText, uuid } from "./common";

export const reportTypeSchema = z.enum([
  "shift_service",
  "audit",
  "attendance_exception",
  "site_activity",
  "issue_rectification",
]);

export const reportSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  type: reportTypeSchema,
  /** Human-quotable identifier printed on the PDF. */
  reference: z.string().regex(/^BW-[A-Z]{3}-\d{8}-\d{4}$/),
  sourceEntityId: uuid,
  currentVersion: z.number().int().min(1),
  generatedAt: isoDateTime,
});

export const reportVersionSchema = z.object({
  id: uuid,
  reportId: uuid,
  version: z.number().int().min(1),
  objectPath: z.string().max(512),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: isoDateTime,
  regenerationReason: shortText.nullable(),
});

export const deliveryAttemptSchema = z.object({
  id: uuid,
  reportVersionId: uuid,
  recipientEmail: z.email(),
  status: z.enum(["queued", "sent", "delivered", "bounced", "failed", "suppressed"]),
  attemptNumber: z.number().int().min(1).max(10),
  providerMessageId: z.string().max(256).nullable(),
  failureCategory: z.string().max(120).nullable(),
  attemptedAt: isoDateTime,
});

export const exportRequestSchema = z
  .object({
    tenantId: uuid,
    type: reportTypeSchema,
    fromDate: z.iso.date(),
    toDate: z.iso.date(),
    siteIds: z.array(uuid).max(200).default([]),
    format: z.enum(["csv", "pdf"]),
  })
  .refine((value) => value.fromDate <= value.toDate, {
    message: "fromDate must not be after toDate",
    path: ["fromDate"],
  });

export type Report = z.infer<typeof reportSchema>;
export type ReportType = z.infer<typeof reportTypeSchema>;
export type DeliveryAttempt = z.infer<typeof deliveryAttemptSchema>;
