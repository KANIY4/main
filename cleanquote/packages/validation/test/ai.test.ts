import { describe, expect, it } from 'vitest';

import {
  extractedAssetSchema,
  extractedComplianceIndicatorSchema,
  walkthroughExtractionSchema,
} from '../src/ai.js';
import { parseOrThrow, safeParse, ValidationError } from '../src/parse.js';

function extraction(overrides: Record<string, unknown> = {}) {
  return {
    siteSummary: 'Two-level commercial office with a ground floor reception and a shared kitchen.',
    serviceTypeCandidates: [
      { value: 'recurring_office', confidence: 0.82, evidenceRefs: ['photo-1', 'photo-4'] },
    ],
    spaces: [
      {
        name: 'Level 1 open plan',
        roomType: { value: 'open_plan_office', confidence: 0.9, evidenceRefs: ['photo-1'] },
        quantity: { value: 1, confidence: 0.95, evidenceRefs: ['photo-1'] },
      },
    ],
    assets: [
      {
        assetTypeCode: 'window',
        visibleQuantity: { value: 8, confidence: 0.7, evidenceRefs: ['photo-2'] },
      },
    ],
    observations: [],
    risks: [],
    complianceIndicators: [],
    assumptions: [],
    missingInformation: [],
    suggestedQuestions: [],
    ...overrides,
  };
}

describe('walkthroughExtractionSchema', () => {
  it('accepts a well-formed extraction', () => {
    expect(safeParse(walkthroughExtractionSchema, extraction()).ok).toBe(true);
  });

  it('rejects a confidence above 1', () => {
    const invalid = extraction({
      serviceTypeCandidates: [{ value: 'recurring_office', confidence: 1.7, evidenceRefs: [] }],
    });
    expect(safeParse(walkthroughExtractionSchema, invalid).ok).toBe(false);
  });

  it('rejects a negative confidence', () => {
    const invalid = extraction({
      serviceTypeCandidates: [{ value: 'recurring_office', confidence: -0.2, evidenceRefs: [] }],
    });
    expect(safeParse(walkthroughExtractionSchema, invalid).ok).toBe(false);
  });

  it('caps suggested questions so the copilot cannot bury the estimator', () => {
    const question = {
      question: 'What is the cleaning window?',
      impact: 'scope',
      materiality: 'high',
    };
    const invalid = extraction({ suggestedQuestions: Array.from({ length: 11 }, () => question) });
    expect(safeParse(walkthroughExtractionSchema, invalid).ok).toBe(false);
  });

  it('rejects an extraction missing a required section entirely', () => {
    const withoutSpaces: Record<string, unknown> = extraction();
    delete withoutSpaces['spaces'];
    expect(safeParse(walkthroughExtractionSchema, withoutSpaces).ok).toBe(false);
  });
});

describe('extractedAssetSchema', () => {
  it('records asset counts as a visible quantity, not a site total', () => {
    const asset = {
      assetTypeCode: 'window',
      visibleQuantity: { value: 8, confidence: 0.7, evidenceRefs: ['photo-2'] },
    };
    const result = safeParse(extractedAssetSchema, asset);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.visibleQuantity.value).toBe(8);
  });

  it('rejects output that asserts a plain total instead of a visible count', () => {
    const asset = {
      assetTypeCode: 'window',
      quantity: { value: 8, confidence: 0.7, evidenceRefs: [] },
    };
    expect(safeParse(extractedAssetSchema, asset).ok).toBe(false);
  });

  it('rejects a fractional asset count', () => {
    const asset = {
      assetTypeCode: 'window',
      visibleQuantity: { value: 8.5, confidence: 0.7, evidenceRefs: [] },
    };
    expect(safeParse(extractedAssetSchema, asset).ok).toBe(false);
  });
});

describe('extractedComplianceIndicatorSchema', () => {
  it('refuses a compliance finding that does not require human review', () => {
    const indicator = {
      complianceClass: 'gmp',
      confidence: 0.8,
      evidenceRefs: ['photo-9'],
      requiresHumanReview: false,
    };
    expect(safeParse(extractedComplianceIndicatorSchema, indicator).ok).toBe(false);
  });

  it('accepts a compliance finding flagged for human review', () => {
    const indicator = {
      complianceClass: 'gmp',
      confidence: 0.8,
      evidenceRefs: ['photo-9'],
      requiresHumanReview: true,
    };
    expect(safeParse(extractedComplianceIndicatorSchema, indicator).ok).toBe(true);
  });

  it('rejects an unrecognised compliance class rather than inventing one', () => {
    const indicator = {
      complianceClass: 'nuclear_decontamination',
      confidence: 0.8,
      evidenceRefs: [],
      requiresHumanReview: true,
    };
    expect(safeParse(extractedComplianceIndicatorSchema, indicator).ok).toBe(false);
  });
});

describe('parseOrThrow', () => {
  it('returns parsed data on success', () => {
    const parsed = parseOrThrow(
      walkthroughExtractionSchema,
      extraction(),
      'walkthrough extraction',
    );
    expect(parsed.spaces).toHaveLength(1);
  });

  it('throws a ValidationError carrying every issue', () => {
    try {
      parseOrThrow(walkthroughExtractionSchema, { siteSummary: '' }, 'walkthrough extraction');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues.length).toBeGreaterThan(1);
      expect((error as ValidationError).message).toContain('Invalid walkthrough extraction');
    }
  });
});
