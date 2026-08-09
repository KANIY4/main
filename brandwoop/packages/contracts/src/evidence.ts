import { z } from "zod";

import { idempotencyKey, isoDateTime, longText, shortText, uuid } from "./common";

export const photoCategorySchema = z.enum(["before", "after", "general", "issue", "audit"]);

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
] as const;

export const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;

export const taskResultSchema = z.object({
  id: uuid,
  checklistRunId: uuid,
  taskTemplateItemId: uuid,
  outcome: z.enum(["completed", "not_applicable", "blocked"]),
  notApplicableReason: shortText.nullable(),
  note: longText.nullable(),
  completedAt: isoDateTime.nullable(),
});

export const checklistRunSchema = z.object({
  id: uuid,
  tenantId: uuid,
  shiftId: uuid,
  servicePlanVersion: z.number().int().min(1),
  startedAt: isoDateTime,
  completedAt: isoDateTime.nullable(),
  results: z.array(taskResultSchema),
});

/**
 * Upload is a two-step handshake: request a signed slot, then confirm.
 * A file becomes evidence only after the confirm step links and verifies it.
 */
export const requestUploadSlotSchema = z.object({
  tenantId: uuid,
  shiftId: uuid,
  category: photoCategorySchema,
  declaredMimeType: z.enum(ALLOWED_EVIDENCE_MIME_TYPES),
  declaredBytes: z.number().int().min(1).max(MAX_EVIDENCE_BYTES),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey,
});

export const uploadSlotSchema = z.object({
  uploadRecordId: uuid,
  /** Tenant-prefixed and randomised: <tenantId>/<shiftId>/<random>.<ext>. */
  objectPath: z.string().max(512),
  signedUrl: z.url(),
  expiresAt: isoDateTime,
});

export const confirmUploadSchema = z.object({
  uploadRecordId: uuid,
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  taskResultId: uuid.nullable(),
  caption: shortText.nullable(),
});

export const photoEvidenceSchema = z.object({
  id: uuid,
  tenantId: uuid,
  shiftId: uuid,
  taskResultId: uuid.nullable(),
  category: photoCategorySchema,
  objectPath: z.string().max(512),
  capturedAt: isoDateTime,
  uploadedAt: isoDateTime,
  scanStatus: z.enum(["pending", "clean", "quarantined"]),
  bytes: z.number().int().min(1),
});

/** Sign-off is the committed business event the report job reacts to. */
export const shiftSignOffRequestSchema = z.object({
  shiftId: uuid,
  declarationAccepted: z.literal(true),
  outstandingTasksAcknowledged: z.boolean(),
  note: longText.nullable(),
  signatureObjectPath: z.string().max(512).nullable(),
  idempotencyKey,
});

export type PhotoCategory = z.infer<typeof photoCategorySchema>;
export type PhotoEvidence = z.infer<typeof photoEvidenceSchema>;
export type ChecklistRun = z.infer<typeof checklistRunSchema>;
export type TaskResult = z.infer<typeof taskResultSchema>;
