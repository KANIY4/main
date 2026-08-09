import { describe, expect, it } from "vitest";

import { canTransitionShift, shiftStatusSchema, type ShiftStatus } from "../scheduling.js";
import { canTransitionIssue, issueStatusSchema, type IssueStatus } from "../quality.js";

const allShiftStatuses = shiftStatusSchema.options as readonly ShiftStatus[];
const allIssueStatuses = issueStatusSchema.options as readonly IssueStatus[];

describe("shift state transitions", () => {
  it("allows a draft shift to be published", () => {
    expect(canTransitionShift("draft", "published")).toBe(true);
  });

  it("rejects jumping from draft straight to completed", () => {
    expect(canTransitionShift("draft", "completed")).toBe(false);
  });

  it("treats completed as terminal", () => {
    const reachable = allShiftStatuses.filter((to) => canTransitionShift("completed", to));
    expect(reachable).toEqual([]);
  });

  it("treats cancelled as terminal", () => {
    const reachable = allShiftStatuses.filter((to) => canTransitionShift("cancelled", to));
    expect(reachable).toEqual([]);
  });

  it("never allows a status to transition to itself", () => {
    for (const status of allShiftStatuses) {
      expect(canTransitionShift(status, status)).toBe(false);
    }
  });
});

describe("issue state transitions", () => {
  it("requires verification before an in-progress issue closes", () => {
    expect(canTransitionIssue("in_progress", "closed")).toBe(false);
    expect(canTransitionIssue("in_progress", "awaiting_verification")).toBe(true);
    expect(canTransitionIssue("awaiting_verification", "closed")).toBe(true);
  });

  it("allows a closed issue to be reopened", () => {
    expect(canTransitionIssue("closed", "reopened")).toBe(true);
  });

  it("never allows a status to transition to itself", () => {
    for (const status of allIssueStatuses) {
      expect(canTransitionIssue(status, status)).toBe(false);
    }
  });
});
