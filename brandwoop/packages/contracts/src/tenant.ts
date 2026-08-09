import { z } from "zod";

import { isoDateTime, longText, shortText, timezone, uuid } from "./common";

/**
 * A company code assists onboarding and discovery. It never grants access on
 * its own — membership is verified server-side (scope section 4).
 */
export const companyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{3,15}$/, "4-16 characters, letters, digits and hyphens");

export const roleSchema = z.enum(["cleaner", "supervisor", "administrator", "platform_owner"]);

export const membershipStatusSchema = z.enum(["invited", "active", "suspended", "archived"]);

export const tenantSchema = z.object({
  id: uuid,
  name: shortText,
  companyCode: companyCodeSchema,
  timezone,
  brandPrimaryColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  logoObjectPath: z.string().max(512).nullable(),
  isActive: z.boolean(),
  createdAt: isoDateTime,
});

export const createTenantRequestSchema = z.object({
  name: shortText,
  companyCode: companyCodeSchema,
  timezone,
  administratorEmail: z.email(),
});

export const tenantMembershipSchema = z.object({
  id: uuid,
  tenantId: uuid,
  userId: uuid,
  role: roleSchema,
  status: membershipStatusSchema,
  invitedAt: isoDateTime.nullable(),
  activatedAt: isoDateTime.nullable(),
  suspendedAt: isoDateTime.nullable(),
});

export const userProfileSchema = z.object({
  id: uuid,
  displayName: shortText,
  email: z.email().nullable(),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "E.164 phone number required")
    .nullable(),
  mfaEnabled: z.boolean(),
});

export const inviteUserRequestSchema = z
  .object({
    tenantId: uuid,
    role: roleSchema.exclude(["platform_owner"]),
    email: z.email().optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/)
      .optional(),
    displayName: shortText,
    siteIds: z.array(uuid).max(200).default([]),
    note: longText.optional(),
  })
  .refine((value) => Boolean(value.email ?? value.phone), {
    message: "An email address or phone number is required",
    path: ["email"],
  });

/** Support impersonation is time-bound and reason-coded (scope section 4). */
export const supportAccessGrantSchema = z.object({
  tenantId: uuid,
  reasonCode: z.enum(["incident", "client_request", "data_correction", "release_verification"]),
  reasonDetail: shortText,
  expiresAt: isoDateTime,
});

export type Role = z.infer<typeof roleSchema>;
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export type Tenant = z.infer<typeof tenantSchema>;
export type TenantMembership = z.infer<typeof tenantMembershipSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type SupportAccessGrant = z.infer<typeof supportAccessGrantSchema>;
