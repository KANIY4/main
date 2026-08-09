import { describe, expect, it } from "vitest";

import { AuditScoringError, scoreAudit } from "../rules/audit-score";

const CRITICAL_ITEM = "aaaaaaaa-1111-4111-8111-111111111111";
const ROUTINE_ITEM = "bbbbbbbb-2222-4222-8222-222222222222";

const definitions = [
  {
    id: CRITICAL_ITEM,
    areaId: null,
    question: "Chemicals stored securely",
    weight: 5,
    requiresPhoto: true,
    isCritical: true,
  },
  {
    id: ROUTINE_ITEM,
    areaId: null,
    question: "Bins emptied",
    weight: 1,
    requiresPhoto: false,
    isCritical: false,
  },
];

function results(criticalScore: number, routineScore: number) {
  return [
    { itemDefinitionId: CRITICAL_ITEM, score: criticalScore, comment: null, photoEvidenceIds: [] },
    { itemDefinitionId: ROUTINE_ITEM, score: routineScore, comment: null, photoEvidenceIds: [] },
  ];
}

describe("scoreAudit", () => {
  it("weights items by their configured weight", () => {
    const score = scoreAudit(definitions, results(10, 0), 80);
    // (10*5 + 0*1) / (10*5 + 10*1) = 83.3%
    expect(score.scorePercent).toBe(83.3);
  });

  it("passes when the weighted score meets the threshold", () => {
    expect(scoreAudit(definitions, results(10, 10), 80).passed).toBe(true);
  });

  it("fails when the weighted score is below the threshold", () => {
    expect(scoreAudit(definitions, results(5, 5), 80).passed).toBe(false);
  });

  it("fails the audit on a zero-scored critical item despite a high total", () => {
    const highWeightRoutine = [definitions[0]!, { ...definitions[1]!, weight: 10 }];
    const score = scoreAudit(
      highWeightRoutine,
      [
        { itemDefinitionId: CRITICAL_ITEM, score: 0, comment: null, photoEvidenceIds: [] },
        { itemDefinitionId: ROUTINE_ITEM, score: 10, comment: null, photoEvidenceIds: [] },
      ],
      50,
    );
    expect(score.scorePercent).toBeGreaterThan(50);
    expect(score.passed).toBe(false);
    expect(score.failedCriticalItemIds).toEqual([CRITICAL_ITEM]);
  });

  it("rejects an audit with a missing item result", () => {
    expect(() => scoreAudit(definitions, [results(10, 10)[0]!], 80)).toThrow(AuditScoringError);
  });

  it("rejects an empty template", () => {
    expect(() => scoreAudit([], [], 80)).toThrow(AuditScoringError);
  });
});
