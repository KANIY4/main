import { safeParse, walkthroughExtractionSchema } from '@cleanquote/validation';

import type {
  AiProvider,
  ChatRequest,
  ChatResult,
  ExtractionRequest,
  ExtractionResult,
} from './provider';
import { AiUnavailableError } from './provider';

/**
 * Anthropic provider.
 *
 * Server-only: the API key is read from the process environment and never
 * reaches a bundle. Extraction is requested as a tool call so the model returns
 * structured JSON rather than prose that has to be scraped, and the result is
 * still validated against the same schema the mock provider is held to —
 * "structured output" is a strong hint, not a guarantee.
 */

const PROMPT_VERSION = 'extraction-2026-07-27';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/** Published per-million-token rates, used for the cost ledger. */
const RATES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-5': { input: 15, output: 75 },
};

const SYSTEM_PROMPT = `You help a commercial cleaning estimator structure a quotation from site capture.

Rules you must follow:
- You never calculate, estimate or suggest a price, a margin, or a labour cost. A separate deterministic engine does that.
- Counts taken from an image are VISIBLE counts, never site totals. Photo coverage is partial by nature.
- Areas read from an image are approximations. Say so, and set a low confidence.
- You never assert that a site is compliant with any regulation. You flag indicators for human review.
- An observation of cleaners working describes the moment observed. Never treat it as a full shift unless told it was.
- Prefer asking one high-impact question over asserting a low-confidence fact.

Return your analysis by calling the record_extraction tool exactly once.`;

function estimateCost(model: string, inputTokens: number, outputTokens: number): string {
  const rate = RATES[model] ?? { input: 3, output: 15 };
  const cost = (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  return cost.toFixed(6);
}

interface AnthropicOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly maxTokens?: number;
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly options: AnthropicOptions;

  constructor(options: AnthropicOptions) {
    this.options = options;
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    const started = Date.now();

    const content: unknown[] = [
      {
        type: 'text',
        text: [
          `Quote type: ${request.quoteType}.`,
          request.siteSummary ? `Site summary so far: ${request.siteSummary}` : '',
          request.existingSpaceNames.length > 0
            ? `Already captured, do not suggest again: ${request.existingSpaceNames.join(', ')}.`
            : '',
          'Analyse the attached capture and record what you can support.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    for (const source of request.sources) {
      if (source.imageBase64 && source.mimeType) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: source.mimeType, data: source.imageBase64 },
        });
        content.push({
          type: 'text',
          text: `The image above has evidence reference "${source.ref}".`,
        });
      } else if (source.text) {
        content.push({
          type: 'text',
          text: `${source.kind} (evidence reference "${source.ref}"): ${source.text}`,
        });
      }
    }

    const body = {
      model: this.options.model,
      max_tokens: this.options.maxTokens ?? 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'record_extraction',
          description: 'Record the structured extraction from the site capture.',
          input_schema: EXTRACTION_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'record_extraction' },
      messages: [{ role: 'user', content }],
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.options.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new AiUnavailableError(
        `The analysis service returned ${response.status}. Nothing was saved; try again shortly.`,
      );
    }

    const payload = (await response.json()) as {
      content?: { type: string; name?: string; input?: unknown }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const toolUse = payload.content?.find(
      (block) => block.type === 'tool_use' && block.name === 'record_extraction',
    );

    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;
    const base = {
      model: this.options.model,
      promptVersion: PROMPT_VERSION,
      inputTokens,
      outputTokens,
      estimatedCost: estimateCost(this.options.model, inputTokens, outputTokens),
      latencyMs: Date.now() - started,
    };

    // Validation failure is an expected branch, not an exception. The run is
    // logged with its errors so extraction quality stays measurable, and nothing
    // invalid is persisted as a suggestion.
    const parsed = safeParse(walkthroughExtractionSchema, toolUse?.input);
    if (!parsed.ok) {
      return {
        ...base,
        extraction: EMPTY_EXTRACTION,
        schemaValid: false,
        validationErrors: parsed.issues.map((issue) => `${issue.path}: ${issue.message}`),
      };
    }

    return { ...base, extraction: parsed.data, schemaValid: true, validationErrors: [] };
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.options.apiKey,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: this.options.model,
        max_tokens: 1024,
        system: `${SYSTEM_PROMPT}\n\nCurrent quote context:\n${request.quoteContext}`,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new AiUnavailableError(`The assistant returned ${response.status}. Try again shortly.`);
    }

    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;

    return {
      reply: payload.content?.find((b) => b.type === 'text')?.text ?? '',
      model: this.options.model,
      inputTokens,
      outputTokens,
      estimatedCost: estimateCost(this.options.model, inputTokens, outputTokens),
      latencyMs: Date.now() - started,
    };
  }
}

const EMPTY_EXTRACTION: ExtractionResult['extraction'] = {
  siteSummary: 'The analysis could not be structured. Nothing was recorded.',
  serviceTypeCandidates: [],
  spaces: [],
  assets: [],
  observations: [],
  risks: [],
  complianceIndicators: [],
  assumptions: [],
  missingInformation: [],
  suggestedQuestions: [],
};

/**
 * The tool schema mirrors `walkthroughExtractionSchema`. Field names carry the
 * product's constraints into the model's own contract: `visibleQuantity` rather
 * than `quantity`, and `requiresHumanReview` fixed to true.
 */
const EXTRACTION_TOOL_SCHEMA = {
  type: 'object',
  required: [
    'siteSummary',
    'serviceTypeCandidates',
    'spaces',
    'assets',
    'observations',
    'risks',
    'complianceIndicators',
    'assumptions',
    'missingInformation',
    'suggestedQuestions',
  ],
  properties: {
    siteSummary: { type: 'string' },
    serviceTypeCandidates: { type: 'array', items: { $ref: '#/$defs/candidateString' } },
    spaces: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'roomType', 'quantity'],
        properties: {
          name: { type: 'string' },
          roomType: { $ref: '#/$defs/candidateString' },
          quantity: { $ref: '#/$defs/candidateNumber' },
          estimatedFloorAreaSqm: { $ref: '#/$defs/candidateNumber' },
          surfaceTypes: { $ref: '#/$defs/candidateStringArray' },
          traffic: { $ref: '#/$defs/candidateString' },
          soil: { $ref: '#/$defs/candidateString' },
        },
      },
    },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        required: ['assetTypeCode', 'visibleQuantity'],
        properties: {
          assetTypeCode: { type: 'string' },
          visibleQuantity: {
            $ref: '#/$defs/candidateNumber',
            description: 'How many are visible in the evidence. Never a site total.',
          },
          spaceName: { type: 'string' },
        },
      },
    },
    observations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'summary', 'observationWindowComplete', 'evidenceRefs'],
        properties: {
          type: { type: 'string' },
          summary: { type: 'string' },
          numericValue: { type: 'number' },
          observationWindowComplete: {
            type: 'boolean',
            description: 'True only when the whole shift was observed. Default false.',
          },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'label', 'probability', 'rationale'],
        properties: {
          code: { type: 'string' },
          label: { type: 'string' },
          probability: { type: 'number', minimum: 0, maximum: 1 },
          rationale: { type: 'string' },
          suggestedMitigation: { type: 'string' },
        },
      },
    },
    complianceIndicators: {
      type: 'array',
      items: {
        type: 'object',
        required: ['complianceClass', 'confidence', 'evidenceRefs', 'requiresHumanReview'],
        properties: {
          complianceClass: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
          requiresHumanReview: { type: 'boolean', enum: [true] },
        },
      },
    },
    assumptions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['statement', 'affects', 'materiality'],
        properties: {
          statement: { type: 'string' },
          affects: {
            type: 'string',
            enum: ['labour', 'cost', 'scope', 'risk', 'compliance', 'schedule'],
          },
          materiality: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
    missingInformation: {
      type: 'array',
      items: {
        type: 'object',
        required: ['field', 'why', 'materiality', 'canDefault'],
        properties: {
          field: { type: 'string' },
          why: { type: 'string' },
          materiality: { type: 'string', enum: ['low', 'medium', 'high'] },
          canDefault: { type: 'boolean' },
          suggestedDefault: { type: 'string' },
        },
      },
    },
    suggestedQuestions: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        required: ['question', 'impact', 'materiality'],
        properties: {
          question: { type: 'string' },
          impact: {
            type: 'string',
            enum: ['price', 'scope', 'risk', 'compliance', 'schedule'],
          },
          materiality: { type: 'string', enum: ['low', 'medium', 'high'] },
          answerOptions: { type: 'array', items: { type: 'string' }, maxItems: 6 },
        },
      },
    },
  },
  $defs: {
    candidateString: {
      type: 'object',
      required: ['value', 'confidence', 'evidenceRefs'],
      properties: {
        value: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
        reasoning: { type: 'string' },
      },
    },
    candidateStringArray: {
      type: 'object',
      required: ['value', 'confidence', 'evidenceRefs'],
      properties: {
        value: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
        reasoning: { type: 'string' },
      },
    },
    candidateNumber: {
      type: 'object',
      required: ['value', 'confidence', 'evidenceRefs'],
      properties: {
        value: { type: 'number' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
        reasoning: { type: 'string' },
      },
    },
  },
} as const;
