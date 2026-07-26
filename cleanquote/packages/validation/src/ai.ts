import { z } from 'zod';

import { mediumText, shortText, unitInterval } from './primitives.js';

/**
 * AI output schemas.
 *
 * Model output is untrusted input. Nothing the AI returns reaches the database or the
 * pricing engine before it parses cleanly here — a hallucinated field or a confidence of
 * 1.7 fails at the boundary rather than becoming a "confirmed" fact in a quote.
 */

const evidenceRefs = z.array(shortText).max(50);

const candidate = <T extends z.ZodType>(value: T) =>
  z.object({
    value,
    confidence: unitInterval,
    evidenceRefs,
    reasoning: mediumText.optional(),
  });

const materiality = z.enum(['low', 'medium', 'high']);

export const extractedSpaceSchema = z.object({
  name: shortText,
  roomType: candidate(shortText),
  quantity: candidate(z.number().int().min(0).max(10000)),
  estimatedFloorAreaSqm: candidate(z.number().min(0).max(1_000_000)).optional(),
  surfaceTypes: candidate(z.array(z.string()).max(20)).optional(),
  traffic: candidate(z.string()).optional(),
  soil: candidate(z.string()).optional(),
});

/**
 * Note the field name: `visibleQuantity`, never `quantity`. Photo coverage of a site is
 * partial by nature, and the schema is the enforcement point for that distinction —
 * "eight visible windows" is a claim the model can support; "the site has eight windows"
 * is not.
 */
export const extractedAssetSchema = z.object({
  assetTypeCode: shortText,
  visibleQuantity: candidate(z.number().int().min(0).max(100000)),
  spaceName: shortText.optional(),
});

export const extractedObservationSchema = z.object({
  type: shortText,
  summary: mediumText,
  numericValue: z.number().finite().optional(),
  observationWindowComplete: z.boolean(),
  evidenceRefs,
});

export const extractedRiskSchema = z.object({
  code: shortText,
  label: mediumText,
  probability: unitInterval,
  rationale: mediumText,
  suggestedMitigation: mediumText.optional(),
});

export const extractedComplianceIndicatorSchema = z.object({
  complianceClass: z.enum([
    'gmp',
    'haccp_controls',
    'healthcare_infection_control',
    'aged_care',
    'childcare',
    'food_safety',
    'pharmaceutical',
    'laboratory',
    'biosecurity',
    'clinical_waste',
    'security_clearance',
    'working_at_heights',
    'confined_space',
    'hazardous_chemicals',
    'site_induction',
    'environmental_reporting',
    'other',
  ]),
  confidence: unitInterval,
  evidenceRefs,
  // The platform documents and prices compliance requirements. It does not certify them,
  // and the schema refuses any output that claims otherwise.
  requiresHumanReview: z.literal(true),
});

export const extractedAssumptionSchema = z.object({
  statement: mediumText,
  affects: z.enum(['labour', 'cost', 'scope', 'risk', 'compliance', 'schedule']),
  materiality,
});

export const missingInformationItemSchema = z.object({
  field: shortText,
  why: mediumText,
  materiality,
  canDefault: z.boolean(),
  suggestedDefault: shortText.optional(),
});

export const suggestedQuestionSchema = z.object({
  question: mediumText,
  impact: z.enum(['price', 'scope', 'risk', 'compliance', 'schedule']),
  materiality,
  answerOptions: z.array(shortText).max(6).optional(),
});

export const walkthroughExtractionSchema = z.object({
  siteSummary: mediumText,
  serviceTypeCandidates: z.array(candidate(shortText)).max(10),
  spaces: z.array(extractedSpaceSchema).max(500),
  assets: z.array(extractedAssetSchema).max(500),
  observations: z.array(extractedObservationSchema).max(200),
  risks: z.array(extractedRiskSchema).max(100),
  complianceIndicators: z.array(extractedComplianceIndicatorSchema).max(50),
  assumptions: z.array(extractedAssumptionSchema).max(100),
  missingInformation: z.array(missingInformationItemSchema).max(100),
  // The UI shows at most three at a time; asking twenty questions defeats the point of
  // a low-input product, so the contract caps it rather than trusting the prompt.
  suggestedQuestions: z.array(suggestedQuestionSchema).max(10),
});

export type WalkthroughExtractionDto = z.infer<typeof walkthroughExtractionSchema>;
