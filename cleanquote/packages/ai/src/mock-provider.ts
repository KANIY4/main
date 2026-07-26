import type { SuggestedQuestion } from '@cleanquote/types';
import { parseOrThrow, walkthroughExtractionSchema } from '@cleanquote/validation';

import type {
  AiProvider,
  ChatRequest,
  ChatResult,
  ExtractionRequest,
  ExtractionResult,
} from './provider';

/**
 * Deterministic local provider.
 *
 * Exists so the entire AI flow — suggestion, review, confirm, correct, reject,
 * apply — is developable and testable with no account, no network and no spend,
 * and so CI never depends on a third-party API.
 *
 * It is not a simulation of model quality. It produces realistic *shapes* with
 * realistic hedged wording, which is what the confirmation UI and the validation
 * boundary need to be exercised against. Output goes through exactly the same
 * schema validation as the real provider, so a change that would break real
 * extraction breaks here too.
 */

const PROMPT_VERSION = 'mock-2026-07-27';
const MODEL = 'mock-extractor';

/** Cheap, stable hash so the same inputs always yield the same suggestions. */
function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function pick<T>(items: readonly T[], seed: number, offset = 0): T {
  const item = items[(seed + offset) % items.length];
  if (item === undefined) throw new Error('Empty selection list');
  return item;
}

const ROOM_TYPES = ['open_plan_office', 'meeting_room', 'amenities', 'kitchen', 'reception'];
const SURFACES = [['carpet'], ['vinyl'], ['tile'], ['carpet', 'vinyl']];
const TRAFFIC = ['low', 'medium', 'high'];
const SOIL = ['light', 'normal', 'heavy'];

export class MockAiProvider implements AiProvider {
  readonly name = 'mock';

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    const started = Date.now();
    const seed = seedFrom(request.sources.map((s) => s.ref).join('|') + request.quoteId);

    const spaces = request.sources
      .filter((source) => source.kind === 'photo' || source.kind === 'note')
      .map((source, index) => {
        const roomType = pick(ROOM_TYPES, seed, index);
        const area = 40 + ((seed + index * 37) % 220);
        return {
          name: `${roomType.replace(/_/g, ' ')} (from ${source.kind} ${index + 1})`,
          roomType: {
            value: roomType,
            confidence: 0.62 + ((seed + index) % 25) / 100,
            evidenceRefs: [source.ref],
            reasoning: 'Room type inferred from the layout and fittings that are visible.',
          },
          quantity: { value: 1, confidence: 0.9, evidenceRefs: [source.ref] },
          estimatedFloorAreaSqm: {
            value: area,
            confidence: 0.45,
            evidenceRefs: [source.ref],
            // Wording matters: an area read off a photograph is an estimate and
            // the interface must never imply otherwise.
            reasoning:
              'Approximate area estimated from the visible extent. Confirm against a measurement before pricing.',
          },
          surfaceTypes: {
            value: pick(SURFACES, seed, index),
            confidence: 0.7,
            evidenceRefs: [source.ref],
          },
          traffic: {
            value: pick(TRAFFIC, seed, index),
            confidence: 0.55,
            evidenceRefs: [source.ref],
          },
          soil: { value: pick(SOIL, seed, index + 1), confidence: 0.5, evidenceRefs: [source.ref] },
        };
      })
      // Do not re-suggest what the estimator has already captured.
      .filter((space) => !request.existingSpaceNames.includes(space.name))
      .slice(0, 6);

    const assets = request.sources
      .filter((source) => source.kind === 'photo')
      .slice(0, 4)
      .map((source, index) => ({
        assetTypeCode: pick(['window', 'bin', 'toilet_pan', 'workstation'], seed, index),
        // Always a *visible* count. Photo coverage is partial by nature, and the
        // schema rejects a payload that claims a site total.
        visibleQuantity: {
          value: 2 + ((seed + index * 13) % 9),
          confidence: 0.58,
          evidenceRefs: [source.ref],
          reasoning: 'Counted from what is visible in this image only.',
        },
      }));

    const extraction = {
      siteSummary:
        request.siteSummary ??
        `Capture reviewed across ${request.sources.length} source(s) for a ${request.quoteType.replace(/_/g, ' ')} quote.`,
      serviceTypeCandidates: [
        {
          value: request.quoteType,
          confidence: 0.8,
          evidenceRefs: request.sources.slice(0, 2).map((s) => s.ref),
        },
      ],
      spaces,
      assets,
      observations: request.sources
        .filter((source) => source.kind === 'note' || source.kind === 'voice_transcript')
        .slice(0, 3)
        .map((source) => ({
          type: 'cleaning_method',
          summary: (source.text ?? 'Walkthrough note recorded.').slice(0, 300),
          // The default is false because most walkthrough notes describe a
          // moment, not a whole shift. Claiming otherwise would turn a glance
          // into an incumbent labour model.
          observationWindowComplete: false,
          evidenceRefs: [source.ref],
        })),
      risks:
        spaces.length > 0
          ? [
              {
                code: 'unverified_area',
                label: 'Floor areas were estimated from capture rather than measured',
                probability: 0.45,
                rationale:
                  'Areas in this quote came from photographs and notes. A material error in area moves labour hours directly.',
                suggestedMitigation: 'Confirm the two largest areas before the price is released.',
              },
            ]
          : [],
      complianceIndicators: [],
      assumptions: [
        {
          statement:
            'Consumables are supplied by the contractor unless the client confirms otherwise.',
          affects: 'cost' as const,
          materiality: 'medium' as const,
        },
      ],
      missingInformation: [
        {
          field: 'cleaning_window',
          why: 'The available cleaning window sets how many cleaners are needed per visit.',
          materiality: 'high' as const,
          canDefault: false,
        },
      ],
      suggestedQuestions: buildQuestions(request.quoteType),
    };

    // The mock is held to the same contract as the real provider. If a schema
    // change would break live extraction, it breaks here first.
    const validated = parseOrThrow(walkthroughExtractionSchema, extraction, 'mock extraction');

    return {
      extraction: validated,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: '0.000000',
      latencyMs: Date.now() - started,
      schemaValid: true,
      validationErrors: [],
    };
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    const last = request.messages[request.messages.length - 1]?.content ?? '';
    return {
      reply: [
        'Running without a model provider, so this is the local assistant.',
        `You asked: "${last.slice(0, 160)}".`,
        'The pricing engine still calculates every figure on this quote; the assistant only helps structure scope. Set ANTHROPIC_API_KEY and AI_PROVIDER=anthropic for live analysis.',
      ].join(' '),
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: '0.000000',
      latencyMs: Date.now() - started,
    };
  }
}

function buildQuestions(quoteType: string): SuggestedQuestion[] {
  const base: SuggestedQuestion[] = [
    {
      question: 'Is the quoted floor area the cleanable area or the total building area?',
      impact: 'price',
      materiality: 'high',
      answerOptions: ['Cleanable area', 'Total building area', 'Not yet known'],
    },
    {
      question: 'Are consumables supplied by the client or by the contractor?',
      impact: 'price',
      materiality: 'high',
      answerOptions: ['Client supplies', 'Contractor supplies', 'Split'],
    },
    {
      question: 'Are public holiday services required?',
      impact: 'schedule',
      materiality: 'medium',
      answerOptions: ['Yes', 'No', 'Reduced service'],
    },
  ];

  if (quoteType === 'recurring' || quoteType === 'tender') {
    base.push({
      question: 'Is an initial restorative clean required before recurring service begins?',
      impact: 'scope',
      materiality: 'high',
      answerOptions: ['Yes', 'No', 'To be confirmed'],
    });
  }
  if (quoteType === 'window_cleaning') {
    base.push({
      question: 'Is external high-access glass included?',
      impact: 'risk',
      materiality: 'high',
      answerOptions: ['Yes', 'No', 'Ground level only'],
    });
  }
  return base;
}
