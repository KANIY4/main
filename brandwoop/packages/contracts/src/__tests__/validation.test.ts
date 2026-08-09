import { describe, expect, it } from "vitest";

import { recordAttendanceRequestSchema } from "../attendance";
import { MAX_EVIDENCE_BYTES, requestUploadSlotSchema } from "../evidence";
import { companyCodeSchema, inviteUserRequestSchema } from "../tenant";
import { geofenceRadiusMetres, paginationQuerySchema } from "../common";
import { exportRequestSchema } from "../reporting";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const SHIFT_ID = "22222222-2222-4222-8222-222222222222";

describe("company code", () => {
  it("uppercases and accepts a valid code", () => {
    expect(companyCodeSchema.parse("bwoop-01")).toBe("BWOOP-01");
  });

  it("rejects a code shorter than four characters", () => {
    expect(companyCodeSchema.safeParse("bw").success).toBe(false);
  });

  it("rejects a code containing whitespace", () => {
    expect(companyCodeSchema.safeParse("BW OOP").success).toBe(false);
  });
});

describe("invite request", () => {
  it("rejects an invite that grants platform owner", () => {
    const result = inviteUserRequestSchema.safeParse({
      tenantId: TENANT_ID,
      role: "platform_owner",
      email: "person@example.com",
      displayName: "Test Person",
    });
    expect(result.success).toBe(false);
  });

  it("requires either an email address or a phone number", () => {
    const result = inviteUserRequestSchema.safeParse({
      tenantId: TENANT_ID,
      role: "cleaner",
      displayName: "Test Person",
    });
    expect(result.success).toBe(false);
  });
});

describe("attendance request", () => {
  const base = {
    shiftId: SHIFT_ID,
    type: "sign_in" as const,
    deviceReportedAt: "2026-08-09T07:00:00+10:00",
    location: null,
    exceptionReason: "GPS unavailable inside basement car park",
    idempotencyKey: "shift-2222-signin-0001",
  };

  it("accepts a sign-in with no location when a reason is supplied", () => {
    expect(recordAttendanceRequestSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an idempotency key shorter than 16 characters", () => {
    const result = recordAttendanceRequestSchema.safeParse({ ...base, idempotencyKey: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects a timestamp without a timezone offset", () => {
    const result = recordAttendanceRequestSchema.safeParse({
      ...base,
      deviceReportedAt: "2026-08-09T07:00:00",
    });
    expect(result.success).toBe(false);
  });
});

describe("evidence upload slot", () => {
  const base = {
    tenantId: TENANT_ID,
    shiftId: SHIFT_ID,
    category: "before" as const,
    declaredMimeType: "image/jpeg" as const,
    declaredBytes: 1024,
    checksumSha256: "a".repeat(64),
    idempotencyKey: "upload-2222-before-01",
  };

  it("accepts an allowed image type", () => {
    expect(requestUploadSlotSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an executable disguised by mime type", () => {
    const result = requestUploadSlotSchema.safeParse({
      ...base,
      declaredMimeType: "application/x-msdownload",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a file above the size ceiling", () => {
    const result = requestUploadSlotSchema.safeParse({
      ...base,
      declaredBytes: MAX_EVIDENCE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("bounded inputs", () => {
  it("caps page size at 100 to prevent bulk extraction", () => {
    expect(paginationQuerySchema.safeParse({ limit: 500 }).success).toBe(false);
    expect(paginationQuerySchema.parse({}).limit).toBe(20);
  });

  it("rejects a geofence radius that would disable the check", () => {
    expect(geofenceRadiusMetres.safeParse(5).success).toBe(false);
    expect(geofenceRadiusMetres.safeParse(100).success).toBe(true);
  });

  it("rejects an export whose range runs backwards", () => {
    const result = exportRequestSchema.safeParse({
      tenantId: TENANT_ID,
      type: "site_activity",
      fromDate: "2026-08-31",
      toDate: "2026-08-01",
      format: "csv",
    });
    expect(result.success).toBe(false);
  });
});
