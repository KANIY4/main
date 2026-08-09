import { z } from "zod";

import { idempotencyKey, isoDateTime, uuid } from "./common";

/**
 * Outbox events are written inside the same transaction as the business record
 * they describe. Workers claim an event once; notifications and reports are
 * consequences of a committed event, never a substitute for storing it
 * (scope section 9).
 */

export const outboxEventTypeSchema = z.enum([
  "shift.published",
  "shift.signed_off",
  "shift.missed",
  "attendance.exception_raised",
  "attendance.correction_decided",
  "audit.finalised",
  "issue.assigned",
  "issue.sla_breached",
  "rectification.verified",
  "report.generated",
  "membership.suspended",
]);

const eventEnvelope = {
  id: uuid,
  tenantId: uuid,
  occurredAt: isoDateTime,
  /** Deduplicates worker delivery across retries and redeployments. */
  idempotencyKey,
  actorUserId: uuid.nullable(),
};

export const outboxEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventEnvelope,
    type: z.literal("shift.published"),
    payload: z.object({ shiftId: uuid, siteId: uuid, workerIds: z.array(uuid) }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal("shift.signed_off"),
    payload: z.object({ shiftId: uuid, siteId: uuid, checklistRunId: uuid }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal("shift.missed"),
    payload: z.object({ shiftId: uuid, siteId: uuid, graceMinutes: z.number().int().min(0) }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal("attendance.exception_raised"),
    payload: z.object({ shiftId: uuid, exceptionId: uuid, category: z.string() }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal("attendance.correction_decided"),
    payload: z.object({ correctionId: uuid, decision: z.enum(["approved", "rejected"]) }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal("audit.finalised"),
    payload: z.object({ auditId: uuid, siteId: uuid, passed: z.boolean() }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal("issue.assigned"),
    payload: z.object({ issueId: uuid, assigneeId: uuid, dueAt: isoDateTime.nullable() }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal("issue.sla_breached"),
    payload: z.object({ issueId: uuid, escalateToUserId: uuid.nullable() }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal("rectification.verified"),
    payload: z.object({ issueId: uuid, accepted: z.boolean() }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal("report.generated"),
    payload: z.object({ reportId: uuid, version: z.number().int().min(1) }),
  }),
  z.object({
    ...eventEnvelope,
    type: z.literal("membership.suspended"),
    payload: z.object({ membershipId: uuid, userId: uuid }),
  }),
]);

export const notificationChannelSchema = z.enum(["push", "email", "sms", "in_app"]);

export const notificationPreferenceSchema = z.object({
  userId: uuid,
  tenantId: uuid,
  eventType: outboxEventTypeSchema,
  channels: z.array(notificationChannelSchema).max(4),
});

export type OutboxEvent = z.infer<typeof outboxEventSchema>;
export type OutboxEventType = z.infer<typeof outboxEventTypeSchema>;
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
