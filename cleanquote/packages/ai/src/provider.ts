import type { WalkthroughExtractionDto } from '@cleanquote/validation';

/**
 * AI provider abstraction.
 *
 * Two implementations ship: `mock`, which returns deterministic fixture
 * extractions so the whole confirmation flow is developable and testable with no
 * account and no spend, and `anthropic`, which calls the real API from the
 * server only.
 *
 * The contract is deliberately narrow. A provider returns *candidates*; it never
 * returns a price, and nothing it returns reaches the pricing engine before a
 * human has confirmed it.
 */

export type ExtractionSourceKind = 'photo' | 'note' | 'voice_transcript' | 'document';

export interface ExtractionRequest {
  readonly organisationId: string;
  readonly quoteId: string;
  readonly sources: readonly ExtractionSource[];
  /** What the estimator has already captured, so the model does not re-suggest it. */
  readonly existingSpaceNames: readonly string[];
  readonly siteSummary?: string | null;
  readonly quoteType: string;
}

export interface ExtractionSource {
  readonly kind: ExtractionSourceKind;
  /** File id for media, or a synthetic id for text so evidence stays traceable. */
  readonly ref: string;
  readonly text?: string;
  /** Base64 image data. Never persisted by the provider. */
  readonly imageBase64?: string;
  readonly mimeType?: string;
}

export interface ExtractionResult {
  readonly extraction: WalkthroughExtractionDto;
  readonly model: string;
  readonly promptVersion: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCost: string;
  readonly latencyMs: number;
  readonly schemaValid: boolean;
  readonly validationErrors: readonly string[];
}

export interface ChatRequest {
  readonly organisationId: string;
  readonly quoteId: string;
  readonly messages: readonly { role: 'user' | 'assistant'; content: string }[];
  readonly quoteContext: string;
}

export interface ChatResult {
  readonly reply: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCost: string;
  readonly latencyMs: number;
}

export interface AiProvider {
  readonly name: string;
  extract(request: ExtractionRequest): Promise<ExtractionResult>;
  chat(request: ChatRequest): Promise<ChatResult>;
}

export class AiBudgetExceededError extends Error {
  constructor(limit: string) {
    super(
      `This organisation has reached its monthly AI budget of ${limit}. Requests are refused rather than queued; raise the budget in settings to continue.`,
    );
    this.name = 'AiBudgetExceededError';
  }
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}
