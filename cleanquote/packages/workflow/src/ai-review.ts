import { createAiProvider, prioritise, type ExtractionSource } from '@cleanquote/ai';
import { aiStore, auditStore, quoteStore, withUser, type Queryable } from '@cleanquote/database';

/**
 * AI-assisted scope extraction and the human confirmation step.
 *
 * Nothing the model returns is written to the quote. Extraction produces
 * *suggestions*; a suggestion becomes a real space, asset, task or risk only
 * when a person confirms or corrects it. The original payload is kept beside the
 * correction, which is what makes suggestion quality measurable rather than
 * anecdotal.
 */

export interface ExtractionOutcome {
  readonly runId: string;
  readonly suggestionIds: readonly string[];
  readonly questionIds: readonly string[];
  readonly schemaValid: boolean;
  readonly validationErrors: readonly string[];
  readonly provider: string;
  readonly model: string;
}

export interface RunExtractionInput {
  readonly userId: string;
  readonly organisationId: string;
  readonly quoteId: string;
  readonly sources: readonly ExtractionSource[];
}

/**
 * Analyses capture and records suggestions.
 *
 * Runs the configured provider — the mock one by default, which needs no
 * account and no spend. Both providers are held to the same schema, so an
 * extraction that would be rejected in production is rejected locally too.
 */
export async function runExtraction(input: RunExtractionInput): Promise<ExtractionOutcome> {
  const provider = createAiProvider({
    provider: process.env['AI_PROVIDER'] ?? 'mock',
    apiKey: process.env['ANTHROPIC_API_KEY'],
    model: process.env['AI_MODEL_CAPABLE'] ?? 'claude-opus-5',
  });

  return withUser(input.userId, async (db) => {
    const quote = await quoteStore.getQuote(db, input.quoteId);
    if (!quote) throw new Error('That quote was not found.');

    const existingSpaces = await quoteStore.listSpaces(db, input.quoteId);
    const existingTasks = await quoteStore.listTasks(db, input.quoteId);

    const result = await provider.extract({
      organisationId: input.organisationId,
      quoteId: input.quoteId,
      sources: input.sources,
      existingSpaceNames: existingSpaces.map((space) => space.name),
      quoteType: quote.quote_type,
    });

    // Every run is logged with its validation outcome, whether or not it
    // produced anything usable.
    const runId = await aiStore.recordRun(db, {
      organisationId: input.organisationId,
      userId: input.userId,
      quoteId: input.quoteId,
      task: 'walkthrough_extraction',
      provider: provider.name,
      model: result.model,
      promptVersion: result.promptVersion,
      inputRefs: input.sources.map((source) => source.ref),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCost: result.estimatedCost,
      latencyMs: result.latencyMs,
      schemaValid: result.schemaValid,
      validationErrors: result.validationErrors,
    });

    if (!result.schemaValid) {
      return {
        runId,
        suggestionIds: [],
        questionIds: [],
        schemaValid: false,
        validationErrors: result.validationErrors,
        provider: provider.name,
        model: result.model,
      };
    }

    const suggestionIds: string[] = [];
    const extraction = result.extraction;

    for (const space of extraction.spaces) {
      suggestionIds.push(
        await aiStore.createSuggestion(db, {
          organisationId: input.organisationId,
          quoteId: input.quoteId,
          runId,
          kind: 'space',
          payload: space,
          confidence: space.roomType.confidence,
          sourceFileId: null,
          model: result.model,
          promptVersion: result.promptVersion,
        }),
      );
    }

    for (const asset of extraction.assets) {
      suggestionIds.push(
        await aiStore.createSuggestion(db, {
          organisationId: input.organisationId,
          quoteId: input.quoteId,
          runId,
          kind: 'asset',
          payload: asset,
          confidence: asset.visibleQuantity.confidence,
          sourceFileId: null,
          model: result.model,
          promptVersion: result.promptVersion,
        }),
      );
    }

    for (const risk of extraction.risks) {
      suggestionIds.push(
        await aiStore.createSuggestion(db, {
          organisationId: input.organisationId,
          quoteId: input.quoteId,
          runId,
          kind: 'risk',
          payload: risk,
          confidence: risk.probability,
          sourceFileId: null,
          model: result.model,
          promptVersion: result.promptVersion,
        }),
      );
    }

    for (const observation of extraction.observations) {
      suggestionIds.push(
        await aiStore.createSuggestion(db, {
          organisationId: input.organisationId,
          quoteId: input.quoteId,
          runId,
          kind: 'observation',
          payload: observation,
          confidence: null,
          sourceFileId: null,
          model: result.model,
          promptVersion: result.promptVersion,
        }),
      );
    }

    for (const assumption of extraction.assumptions) {
      suggestionIds.push(
        await aiStore.createSuggestion(db, {
          organisationId: input.organisationId,
          quoteId: input.quoteId,
          runId,
          kind: 'assumption',
          payload: assumption,
          confidence: null,
          sourceFileId: null,
          model: result.model,
          promptVersion: result.promptVersion,
        }),
      );
    }

    // Questions are scored on commercial impact before they can be shown.
    const scored = prioritise(
      extraction.suggestedQuestions,
      {
        hasTasks: existingTasks.length > 0,
        hasUnverifiedAreas: existingSpaces.some((space) => space.field_status !== 'confirmed'),
        quoteType: quote.quote_type,
      },
      // Store every question; the reading side takes the top three.
      extraction.suggestedQuestions.length,
    );

    const questionIds: string[] = [];
    for (const question of scored) {
      questionIds.push(
        await aiStore.createQuestion(db, {
          organisationId: input.organisationId,
          quoteId: input.quoteId,
          runId,
          question: question.question,
          impactArea: question.impactArea,
          materiality: question.materiality,
          priorityScore: question.priorityScore,
          answerOptions: question.answerOptions ?? null,
        }),
      );
    }

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'ai.extraction_completed',
      entityType: 'quote',
      entityId: input.quoteId,
      after: {
        provider: provider.name,
        model: result.model,
        suggestions: suggestionIds.length,
        questions: questionIds.length,
      },
    });

    return {
      runId,
      suggestionIds,
      questionIds,
      schemaValid: true,
      validationErrors: [],
      provider: provider.name,
      model: result.model,
    };
  });
}

export interface SuggestionDecision {
  readonly userId: string;
  readonly organisationId: string;
  readonly suggestionId: string;
  readonly decision: 'confirm' | 'correct' | 'reject' | 'needs_review';
  /** Required for `correct`: what the user changed it to. */
  readonly correction?: Record<string, unknown>;
}

/**
 * Applies a human decision, creating the real record when accepted.
 *
 * A confirmed space becomes a `spaces` row marked `user_confirmed`; a corrected
 * one becomes a row marked `user_corrected` built from the correction. Nothing
 * is created for a rejection. An AI-derived area never lands as `confirmed`
 * without a person having said so.
 */
export async function decideSuggestion(input: SuggestionDecision): Promise<{ appliedId?: string }> {
  return withUser(input.userId, async (db) => {
    const suggestion = await aiStore.getSuggestion(db, input.suggestionId);
    if (!suggestion) throw new Error('That suggestion was not found.');
    if (suggestion.status !== 'suggested' && suggestion.status !== 'needs_review') {
      throw new Error('That suggestion has already been decided.');
    }

    const status =
      input.decision === 'confirm'
        ? 'confirmed'
        : input.decision === 'correct'
          ? 'corrected'
          : input.decision === 'reject'
            ? 'rejected'
            : 'needs_review';

    let appliedId: string | undefined;

    if (status === 'confirmed' || status === 'corrected') {
      const payload = { ...suggestion.payload, ...(input.correction ?? {}) };
      appliedId = await applySuggestion(db, {
        organisationId: input.organisationId,
        quoteId: suggestion.quote_id,
        kind: suggestion.kind,
        payload,
        corrected: status === 'corrected',
        userId: input.userId,
      });
    }

    await aiStore.decideSuggestion(db, {
      suggestionId: input.suggestionId,
      status,
      correctedPayload: input.correction,
      userId: input.userId,
      appliedEntityType: appliedId ? suggestion.kind : null,
      appliedEntityId: appliedId ?? null,
    });

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: `ai.suggestion_${status}`,
      entityType: 'ai_suggestion',
      entityId: input.suggestionId,
      before: suggestion.payload,
      after: input.correction ?? null,
    });

    return appliedId ? { appliedId } : {};
  });
}

async function applySuggestion(
  db: Queryable,
  input: {
    organisationId: string;
    quoteId: string;
    kind: string;
    payload: Record<string, unknown>;
    corrected: boolean;
    userId: string;
  },
): Promise<string | undefined> {
  const evidenceSource = 'ai_photo_detection';
  const payload = input.payload;

  switch (input.kind) {
    case 'space': {
      const roomType = candidateValue<string>(payload['roomType']) ?? 'other';
      const quantity = candidateValue<number>(payload['quantity']) ?? 1;
      const area = candidateValue<number>(payload['estimatedFloorAreaSqm']);
      return quoteStore.createSpace(db, {
        organisationId: input.organisationId,
        quoteId: input.quoteId,
        name: String(payload['name'] ?? roomType),
        roomType,
        quantity: Math.max(1, Math.round(quantity)),
        floorAreaSqm: area ?? null,
        surfaceTypes: candidateValue<string[]>(payload['surfaceTypes']) ?? [],
        trafficLevel: candidateValue<string>(payload['traffic']) ?? null,
        soilLevel: candidateValue<string>(payload['soil']) ?? null,
        // A confirmed room type does not make an estimated area a measurement.
        // The area stays `estimated` until someone measures or states it.
        fieldStatus: area === undefined ? 'confirmed' : 'estimated',
        evidenceSource,
        aiConfidence: candidateConfidence(payload['roomType']),
      });
    }

    case 'asset': {
      // The suggestion carries a *visible* count. Accepting it records that
      // count, not a site total — the estimator raises it if there are more.
      const visible = candidateValue<number>(payload['visibleQuantity']) ?? 0;
      return quoteStore.createAsset(db, {
        organisationId: input.organisationId,
        quoteId: input.quoteId,
        spaceId: null,
        assetTypeCode: String(payload['assetTypeCode'] ?? 'other'),
        quantity: Math.max(0, Math.round(visible)),
        fieldStatus: 'estimated',
        evidenceSource,
        aiConfidence: candidateConfidence(payload['visibleQuantity']),
      });
    }

    case 'risk':
      return quoteStore.createRisk(db, {
        organisationId: input.organisationId,
        quoteId: input.quoteId,
        code: String(payload['code'] ?? 'ai_identified'),
        label: String(payload['label'] ?? 'Risk identified during capture'),
        probability: Number(payload['probability'] ?? 0.3),
        // The model never prices anything. Impact starts at zero and the
        // estimator sets it; a risk with no impact changes no price.
        impactAmount: '0',
        mitigation: payload['suggestedMitigation'] ? String(payload['suggestedMitigation']) : null,
      });

    case 'observation':
      return quoteStore.createObservation(db, {
        organisationId: input.organisationId,
        quoteId: input.quoteId,
        observationType: String(payload['type'] ?? 'other'),
        summary: String(payload['summary'] ?? ''),
        observationWindowComplete: Boolean(payload['observationWindowComplete']),
        createdByUserId: input.userId,
        evidenceSource,
      });

    case 'assumption':
    case 'exclusion':
    case 'clarification':
      return quoteStore.createQualifier(db, {
        organisationId: input.organisationId,
        quoteId: input.quoteId,
        kind: input.kind === 'clarification' ? 'clarification' : input.kind,
        statement: String(payload['statement'] ?? payload['question'] ?? ''),
        evidenceSource,
      });

    case 'compliance_indicator':
      return quoteStore.createQualifier(db, {
        organisationId: input.organisationId,
        quoteId: input.quoteId,
        kind: 'compliance',
        statement: `Possible ${String(payload['complianceClass'] ?? 'compliance')} requirement identified during capture.`,
        // The platform documents and prices compliance requirements. It does not
        // certify them, so every one lands flagged for review.
        requiresHumanReview: true,
        evidenceSource,
      });

    default:
      return undefined;
  }
}

function candidateValue<T>(candidate: unknown): T | undefined {
  if (candidate && typeof candidate === 'object' && 'value' in candidate) {
    return (candidate as { value: T }).value;
  }
  return undefined;
}

function candidateConfidence(candidate: unknown): number | null {
  if (candidate && typeof candidate === 'object' && 'confidence' in candidate) {
    return (candidate as { confidence: number }).confidence;
  }
  return null;
}

/** The three highest-impact unanswered questions. */
export async function openQuestions(userId: string, quoteId: string) {
  return withUser(userId, async (db) => aiStore.topOpenQuestions(db, quoteId, 3));
}

export async function answerQuestion(input: {
  userId: string;
  organisationId: string;
  questionId: string;
  status: 'answered' | 'skipped' | 'marked_assumption' | 'ask_client' | 'not_applicable';
  answer?: string | null;
}): Promise<void> {
  await withUser(input.userId, async (db) => {
    await aiStore.answerQuestion(db, {
      questionId: input.questionId,
      status: input.status,
      answer: input.answer ?? null,
      userId: input.userId,
    });
    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: `ai.question_${input.status}`,
      entityType: 'ai_question',
      entityId: input.questionId,
      after: { answer: input.answer ?? null },
    });
  });
}
