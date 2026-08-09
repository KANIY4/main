import { z } from "zod";

import {
  idempotencyKey,
  isoDateTime,
  latitude,
  longText,
  longitude,
  shortText,
  uuid,
} from "./common";

export const attendanceEventTypeSchema = z.enum([
  "sign_in",
  "sign_out",
  "break_start",
  "break_end",
]);

export const geofenceOutcomeSchema = z.enum([
  "inside",
  "outside",
  "accuracy_rejected",
  "unavailable",
  "permission_denied",
  "mock_location_suspected",
]);

/**
 * Location is captured only for these actions and is never continuous
 * (scope section 8, privacy-conscious location).
 */
export const locationSampleSchema = z.object({
  latitude,
  longitude,
  accuracyMetres: z.number().min(0).max(10_000),
  capturedAt: isoDateTime,
  isMocked: z.boolean().default(false),
});

export const attendanceEventSchema = z.object({
  id: uuid,
  tenantId: uuid,
  shiftId: uuid,
  workerId: uuid,
  type: attendanceEventTypeSchema,
  /** Authoritative time. Device time is retained separately for drift review. */
  serverRecordedAt: isoDateTime,
  deviceReportedAt: isoDateTime,
  geofenceOutcome: geofenceOutcomeSchema,
  distanceFromSiteMetres: z.number().min(0).nullable(),
  location: locationSampleSchema.nullable(),
  consentVersion: shortText.nullable(),
});

export const recordAttendanceRequestSchema = z.object({
  shiftId: uuid,
  type: attendanceEventTypeSchema,
  deviceReportedAt: isoDateTime,
  location: locationSampleSchema.nullable(),
  /** Required when the worker proceeds without a usable location fix. */
  exceptionReason: shortText.nullable(),
  idempotencyKey,
});

export const attendanceExceptionSchema = z.object({
  id: uuid,
  tenantId: uuid,
  shiftId: uuid,
  category: z.enum(["late", "missed", "outside_geofence", "no_location", "early_finish"]),
  detectedAt: isoDateTime,
  resolvedAt: isoDateTime.nullable(),
  resolutionReason: longText.nullable(),
  resolvedBy: uuid.nullable(),
});

/**
 * Corrections never mutate the original event. An approved correction writes a
 * new derived record and preserves the source (scope section 9).
 */
export const attendanceCorrectionRequestSchema = z.object({
  attendanceEventId: uuid,
  proposedTime: isoDateTime,
  reason: shortText,
  evidenceNote: longText.nullable(),
});

export const attendanceCorrectionDecisionSchema = z.object({
  correctionId: uuid,
  decision: z.enum(["approved", "rejected"]),
  decisionReason: shortText,
});

export type AttendanceEvent = z.infer<typeof attendanceEventSchema>;
export type AttendanceEventType = z.infer<typeof attendanceEventTypeSchema>;
export type GeofenceOutcome = z.infer<typeof geofenceOutcomeSchema>;
export type LocationSample = z.infer<typeof locationSampleSchema>;
