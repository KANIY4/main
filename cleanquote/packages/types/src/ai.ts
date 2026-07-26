/**
 * AI contracts.
 *
 * The AI never produces a price. It produces *candidates* — structured, schema-validated
 * suggestions that a human confirms, corrects or rejects before they can influence the
 * deterministic engine.
 */
import type { ComplianceClass, SoilLevel, SurfaceType, TrafficLevel } from './capture';

export interface Candidate<T> {
  readonly value: T;
  /** 0-1. */
  readonly confidence: number;
  /** Ids of the photos, document pages or transcripts supporting the candidate. */
  readonly evidenceRefs: readonly string[];
  /** Human-readable justification shown next to the confirm/correct control. */
  readonly reasoning?: string;
}

export interface ExtractedSpace {
  readonly name: string;
  readonly roomType: Candidate<string>;
  readonly quantity: Candidate<number>;
  readonly estimatedFloorAreaSqm?: Candidate<number>;
  readonly surfaceTypes?: Candidate<readonly SurfaceType[]>;
  readonly traffic?: Candidate<TrafficLevel>;
  readonly soil?: Candidate<SoilLevel>;
}

export interface ExtractedAsset {
  readonly assetTypeCode: string;
  /**
   * Phrased as "visible count". The extraction layer must never assert a total for a
   * site from partial photo coverage.
   */
  readonly visibleQuantity: Candidate<number>;
  readonly spaceName?: string;
}

export interface ExtractedObservation {
  readonly type: string;
  readonly summary: string;
  readonly numericValue?: number;
  readonly observationWindowComplete: boolean;
  readonly evidenceRefs: readonly string[];
}

export interface ExtractedRisk {
  readonly code: string;
  readonly label: string;
  readonly probability: number;
  readonly rationale: string;
  readonly suggestedMitigation?: string;
}

export interface ExtractedComplianceIndicator {
  readonly complianceClass: ComplianceClass;
  readonly confidence: number;
  readonly evidenceRefs: readonly string[];
  /** Always true: the platform documents and prices requirements, it does not certify. */
  readonly requiresHumanReview: true;
}

export interface ExtractedAssumption {
  readonly statement: string;
  readonly affects: 'labour' | 'cost' | 'scope' | 'risk' | 'compliance' | 'schedule';
  readonly materiality: 'low' | 'medium' | 'high';
}

export interface MissingInformationItem {
  readonly field: string;
  readonly why: string;
  readonly materiality: 'low' | 'medium' | 'high';
  readonly canDefault: boolean;
  readonly suggestedDefault?: string;
}

export interface SuggestedQuestion {
  readonly question: string;
  /** Ranked by commercial impact — the UI shows at most three at a time. */
  readonly impact: 'price' | 'scope' | 'risk' | 'compliance' | 'schedule';
  readonly materiality: 'low' | 'medium' | 'high';
  readonly answerOptions?: readonly string[];
}

export interface WalkthroughExtraction {
  readonly siteSummary: string;
  readonly serviceTypeCandidates: readonly Candidate<string>[];
  readonly spaces: readonly ExtractedSpace[];
  readonly assets: readonly ExtractedAsset[];
  readonly observations: readonly ExtractedObservation[];
  readonly risks: readonly ExtractedRisk[];
  readonly complianceIndicators: readonly ExtractedComplianceIndicator[];
  readonly assumptions: readonly ExtractedAssumption[];
  readonly missingInformation: readonly MissingInformationItem[];
  readonly suggestedQuestions: readonly SuggestedQuestion[];
}

// ---------------------------------------------------------------------------
// Provider abstraction and run logging
// ---------------------------------------------------------------------------

export type AiTaskKind =
  | 'walkthrough_extraction'
  | 'photo_analysis'
  | 'tender_extraction'
  | 'scope_gap_analysis'
  | 'proposal_draft'
  | 'price_explanation'
  | 'question_generation'
  | 'classification';

export interface AiRunLog {
  readonly id: string;
  readonly organisationId: string;
  readonly userId: string;
  readonly quoteId?: string;
  readonly task: AiTaskKind;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly inputRefs: readonly string[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCost: string;
  readonly latencyMs: number;
  readonly schemaValid: boolean;
  readonly validationErrors?: readonly string[];
  /** Whether the user accepted the suggestion. Feeds suggestion-quality analytics. */
  readonly userAccepted?: boolean;
  readonly createdAt: string;
}
