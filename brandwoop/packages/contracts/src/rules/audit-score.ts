import type { auditItemDefinitionSchema, auditItemResultSchema } from "../quality.js";
import type { z } from "zod";

type ItemDefinition = z.infer<typeof auditItemDefinitionSchema>;
type ItemResult = z.infer<typeof auditItemResultSchema>;

const MAX_ITEM_SCORE = 10;

export interface AuditScore {
  readonly scorePercent: number;
  readonly passed: boolean;
  readonly failedCriticalItemIds: readonly string[];
}

export class AuditScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditScoringError";
  }
}

/**
 * Weighted audit score.
 *
 * A failed critical item fails the audit outright, whatever the weighted total
 * says — a site cannot pass by scoring well on trivia while failing a safety
 * question (scope section 8).
 */
export function scoreAudit(
  definitions: readonly ItemDefinition[],
  results: readonly ItemResult[],
  passThresholdPercent: number,
): AuditScore {
  if (definitions.length === 0) {
    throw new AuditScoringError("An audit template must define at least one item");
  }

  const resultByDefinitionId = new Map(results.map((result) => [result.itemDefinitionId, result]));

  let weightedScore = 0;
  let weightedMaximum = 0;
  const failedCriticalItemIds: string[] = [];

  for (const definition of definitions) {
    const result = resultByDefinitionId.get(definition.id);
    if (result === undefined) {
      throw new AuditScoringError(`Audit item ${definition.id} has no recorded result`);
    }

    weightedScore += result.score * definition.weight;
    weightedMaximum += MAX_ITEM_SCORE * definition.weight;

    if (definition.isCritical && result.score === 0) {
      failedCriticalItemIds.push(definition.id);
    }
  }

  const scorePercent = Math.round((weightedScore / weightedMaximum) * 1000) / 10;
  const passed = failedCriticalItemIds.length === 0 && scorePercent >= passThresholdPercent;

  return { scorePercent, passed, failedCriticalItemIds };
}
