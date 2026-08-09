import { z } from "zod";

import { isoDateTime, longText, shortText, uuid } from "./common";

export const auditItemDefinitionSchema = z.object({
  id: uuid,
  areaId: uuid.nullable(),
  question: shortText,
  weight: z.number().int().min(1).max(10),
  requiresPhoto: z.boolean(),
  /** A failed critical item fails the whole audit regardless of total score. */
  isCritical: z.boolean(),
});

export const auditTemplateSchema = z.object({
  id: uuid,
  tenantId: uuid,
  name: shortText,
  version: z.number().int().min(1),
  passThresholdPercent: z.number().int().min(0).max(100),
  items: z.array(auditItemDefinitionSchema).min(1),
  isActive: z.boolean(),
});

export const auditItemResultSchema = z.object({
  itemDefinitionId: uuid,
  score: z.number().int().min(0).max(10),
  comment: longText.nullable(),
  photoEvidenceIds: z.array(uuid).max(20).default([]),
});

export const auditSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  templateId: uuid,
  templateVersion: z.number().int().min(1),
  supervisorId: uuid,
  status: z.enum(["draft", "finalised"]),
  scorePercent: z.number().min(0).max(100).nullable(),
  passed: z.boolean().nullable(),
  finalisedAt: isoDateTime.nullable(),
  results: z.array(auditItemResultSchema),
});

export const issueSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const issueStatusSchema = z.enum([
  "open",
  "assigned",
  "in_progress",
  "awaiting_verification",
  "closed",
  "reopened",
]);

export const ISSUE_TRANSITIONS: Readonly<Record<IssueStatus, readonly IssueStatus[]>> = {
  open: ["assigned", "closed"],
  assigned: ["in_progress", "open"],
  in_progress: ["awaiting_verification"],
  awaiting_verification: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["assigned", "in_progress"],
} as const;

export const issueSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  auditId: uuid.nullable(),
  shiftId: uuid.nullable(),
  title: shortText,
  description: longText,
  severity: issueSeveritySchema,
  category: z.enum(["cleaning_quality", "safety", "equipment", "supplies", "access", "other"]),
  status: issueStatusSchema,
  assigneeId: uuid.nullable(),
  dueAt: isoDateTime.nullable(),
  closedAt: isoDateTime.nullable(),
  closureReason: longText.nullable(),
});

export const rectificationSchema = z.object({
  id: uuid,
  issueId: uuid,
  action: longText,
  completedBy: uuid.nullable(),
  completedAt: isoDateTime.nullable(),
  photoEvidenceIds: z.array(uuid).max(20).default([]),
  verifierId: uuid.nullable(),
  verificationDecision: z.enum(["accepted", "rejected"]).nullable(),
  verificationNote: longText.nullable(),
});

export const supplyShortageSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  item: shortText,
  quantity: z.number().int().min(1).max(1000),
  urgency: z.enum(["routine", "urgent"]),
  note: longText.nullable(),
  status: z.enum(["reported", "ordered", "delivered", "cancelled"]),
});

export const dailyLogSchema = z.object({
  id: uuid,
  tenantId: uuid,
  siteId: uuid,
  supervisorId: uuid,
  logDate: z.iso.date(),
  staffingNote: longText.nullable(),
  clientInteractionNote: longText.nullable(),
  safetyObservation: longText.nullable(),
  handoverAction: longText.nullable(),
  photoEvidenceIds: z.array(uuid).max(20).default([]),
});

export type IssueStatus = z.infer<typeof issueStatusSchema>;
export type IssueSeverity = z.infer<typeof issueSeveritySchema>;
export type Audit = z.infer<typeof auditSchema>;
export type Issue = z.infer<typeof issueSchema>;

export function canTransitionIssue(from: IssueStatus, to: IssueStatus): boolean {
  return ISSUE_TRANSITIONS[from].includes(to);
}
