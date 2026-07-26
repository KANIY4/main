import { many, one, type Queryable } from './client';

/**
 * AI suggestions and prioritised questions.
 *
 * Nothing here writes to a quote's priced record. A suggestion becomes a real
 * space, task or risk only when a human confirms or corrects it, and the
 * original suggestion is kept alongside the correction so suggestion quality
 * stays measurable rather than anecdotal.
 */

export interface AiSuggestionRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  corrected_payload: Record<string, unknown> | null;
  confidence: string | null;
  status: string;
  source_file_id: string | null;
  model: string;
  prompt_version: string;
  applied_entity_type: string | null;
  applied_entity_id: string | null;
  created_at: Date;
}

export interface AiQuestionRow {
  id: string;
  question: string;
  impact_area: string;
  materiality: string;
  priority_score: string;
  answer_options: string[] | null;
  status: string;
  answer: string | null;
}

export async function recordRun(
  db: Queryable,
  input: {
    organisationId: string;
    userId: string;
    quoteId: string | null;
    task: string;
    provider: string;
    model: string;
    promptVersion: string;
    inputRefs: readonly string[];
    inputTokens: number;
    outputTokens: number;
    estimatedCost: string;
    latencyMs: number;
    schemaValid: boolean;
    validationErrors?: readonly string[] | null;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.ai_runs
       (organisation_id, user_id, quote_id, task, provider, model, prompt_version, input_refs,
        input_tokens, output_tokens, estimated_cost, latency_ms, schema_valid, validation_errors)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning id`,
    [
      input.organisationId,
      input.userId,
      input.quoteId,
      input.task,
      input.provider,
      input.model,
      input.promptVersion,
      [...input.inputRefs],
      input.inputTokens,
      input.outputTokens,
      input.estimatedCost,
      input.latencyMs,
      input.schemaValid,
      input.validationErrors ? [...input.validationErrors] : null,
    ],
  );
  if (!row) throw new Error('Failed to record the AI run.');
  return row.id;
}

export async function createSuggestion(
  db: Queryable,
  input: {
    organisationId: string;
    quoteId: string;
    runId: string | null;
    kind: string;
    payload: unknown;
    confidence: number | null;
    sourceFileId: string | null;
    model: string;
    promptVersion: string;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.ai_suggestions
       (organisation_id, quote_id, run_id, kind, payload, confidence, source_file_id, model, prompt_version)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id`,
    [
      input.organisationId,
      input.quoteId,
      input.runId,
      input.kind,
      JSON.stringify(input.payload),
      input.confidence,
      input.sourceFileId,
      input.model,
      input.promptVersion,
    ],
  );
  if (!row) throw new Error('Failed to store the AI suggestion.');
  return row.id;
}

export async function listSuggestions(
  db: Queryable,
  quoteId: string,
  status?: string,
): Promise<AiSuggestionRow[]> {
  const filter = status ? 'and status = $2::public.ai_suggestion_status' : '';
  const values = status ? [quoteId, status] : [quoteId];
  return many<AiSuggestionRow>(
    db,
    `select id, kind, payload, corrected_payload, confidence, status::text as status,
            source_file_id, model, prompt_version, applied_entity_type, applied_entity_id, created_at
     from public.ai_suggestions
     where quote_id = $1 ${filter}
     order by confidence desc nulls last, created_at`,
    values,
  );
}

export async function getSuggestion(
  db: Queryable,
  suggestionId: string,
): Promise<(AiSuggestionRow & { quote_id: string; organisation_id: string }) | undefined> {
  return one(
    db,
    `select id, quote_id, organisation_id, kind, payload, corrected_payload, confidence,
            status::text as status, source_file_id, model, prompt_version,
            applied_entity_type, applied_entity_id, created_at
     from public.ai_suggestions where id = $1`,
    [suggestionId],
  );
}

/**
 * Records the human decision.
 *
 * A correction stores what the user changed it to without touching the original
 * payload — the two together are what makes "is the copilot actually helping?"
 * answerable.
 */
export async function decideSuggestion(
  db: Queryable,
  input: {
    suggestionId: string;
    status: 'confirmed' | 'corrected' | 'rejected' | 'needs_review';
    correctedPayload?: unknown;
    userId: string;
    appliedEntityType?: string | null;
    appliedEntityId?: string | null;
  },
): Promise<void> {
  await db.query(
    `update public.ai_suggestions
     set status = $2::public.ai_suggestion_status,
         corrected_payload = coalesce($3::jsonb, corrected_payload),
         decided_by_user_id = $4,
         accepted_at = case when $2 in ('confirmed','corrected') then now() else accepted_at end,
         rejected_at = case when $2 = 'rejected' then now() else rejected_at end,
         applied_entity_type = coalesce($5, applied_entity_type),
         applied_entity_id = coalesce($6, applied_entity_id)
     where id = $1`,
    [
      input.suggestionId,
      input.status,
      input.correctedPayload === undefined ? null : JSON.stringify(input.correctedPayload),
      input.userId,
      input.appliedEntityType ?? null,
      input.appliedEntityId ?? null,
    ],
  );
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export async function createQuestion(
  db: Queryable,
  input: {
    organisationId: string;
    quoteId: string;
    runId: string | null;
    question: string;
    impactArea: string;
    materiality: string;
    priorityScore: number;
    answerOptions?: readonly string[] | null;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.ai_questions
       (organisation_id, quote_id, run_id, question, impact_area, materiality, priority_score, answer_options)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id`,
    [
      input.organisationId,
      input.quoteId,
      input.runId,
      input.question,
      input.impactArea,
      input.materiality,
      input.priorityScore,
      input.answerOptions ? [...input.answerOptions] : null,
    ],
  );
  if (!row) throw new Error('Failed to store the question.');
  return row.id;
}

/**
 * The top open questions by commercial impact.
 *
 * Capped at three by default because a product that asks twenty questions has
 * stopped being a low-input product.
 */
export async function topOpenQuestions(
  db: Queryable,
  quoteId: string,
  limit = 3,
): Promise<AiQuestionRow[]> {
  return many<AiQuestionRow>(
    db,
    `select id, question, impact_area, materiality, priority_score, answer_options,
            status, answer
     from public.ai_questions
     where quote_id = $1 and status = 'open'
     order by priority_score desc, created_at
     limit $2`,
    [quoteId, limit],
  );
}

export async function answerQuestion(
  db: Queryable,
  input: {
    questionId: string;
    status: 'answered' | 'skipped' | 'marked_assumption' | 'ask_client' | 'not_applicable';
    answer?: string | null;
    userId: string;
  },
): Promise<void> {
  await db.query(
    `update public.ai_questions
     set status = $2, answer = $3, answered_by_user_id = $4, answered_at = now()
     where id = $1`,
    [input.questionId, input.status, input.answer ?? null, input.userId],
  );
}

export async function countOpenQuestions(db: Queryable, quoteId: string): Promise<number> {
  const row = await one<{ count: string }>(
    db,
    `select count(*)::text as count from public.ai_questions where quote_id = $1 and status = 'open'`,
    [quoteId],
  );
  return Number(row?.count ?? '0');
}
