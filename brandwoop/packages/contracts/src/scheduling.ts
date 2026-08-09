import { z } from "zod";

import { isoDate, isoDateTime, longText, shortText, uuid } from "./common";

export const shiftStatusSchema = z.enum([
  "draft",
  "published",
  "in_progress",
  "completed",
  "cancelled",
  "missed",
]);

/**
 * Server-controlled transitions (scope section 9). A client cannot jump from
 * draft to completed; the API rejects any pair absent from this map.
 */
export const SHIFT_TRANSITIONS: Readonly<Record<ShiftStatus, readonly ShiftStatus[]>> = {
  draft: ["published", "cancelled"],
  published: ["in_progress", "cancelled", "missed"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  missed: ["published"],
} as const;

export const recurrenceRuleSchema = z.object({
  frequency: z.enum(["daily", "weekly", "fortnightly", "monthly"]),
  /** 1 = Monday … 7 = Sunday (ISO-8601 weekday numbering). */
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  startDate: isoDate,
  endDate: isoDate.nullable(),
  startTimeLocal: z.iso.time({ precision: 0 }),
  durationMinutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60),
});

export const shiftTemplateSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  name: shortText,
  recurrence: recurrenceRuleSchema,
  servicePlanId: uuid,
  isActive: z.boolean(),
});

export const shiftSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  shiftTemplateId: uuid.nullable(),
  servicePlanVersion: z.number().int().min(1),
  /**
   * Stable key derived from template and local start instant. Unique per tenant
   * so re-expanding a recurrence cannot create duplicate shifts.
   */
  occurrenceKey: z.string().min(8).max(128),
  scheduledStart: isoDateTime,
  scheduledEnd: isoDateTime,
  status: shiftStatusSchema,
  cancellationReason: longText.nullable(),
  createdAt: isoDateTime,
});

export const shiftAssignmentSchema = z.object({
  id: uuid,
  shiftId: uuid,
  workerId: uuid,
  assignedAt: isoDateTime,
  isCover: z.boolean(),
  replacedAssignmentId: uuid.nullable(),
});

export const publishShiftsRequestSchema = z.object({
  tenantId: uuid,
  shiftTemplateId: uuid,
  fromDate: isoDate,
  toDate: isoDate,
  notifyAssignees: z.boolean().default(true),
});

export const coverRequestSchema = z.object({
  id: uuid,
  shiftId: uuid,
  requestedBy: uuid,
  reason: shortText,
  status: z.enum(["open", "accepted", "declined", "withdrawn"]),
  acceptedBy: uuid.nullable(),
});

export type ShiftStatus = z.infer<typeof shiftStatusSchema>;
export type Shift = z.infer<typeof shiftSchema>;
export type ShiftAssignment = z.infer<typeof shiftAssignmentSchema>;
export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;

/** Single place both the API and the mobile client ask about a transition. */
export function canTransitionShift(from: ShiftStatus, to: ShiftStatus): boolean {
  return SHIFT_TRANSITIONS[from].includes(to);
}
