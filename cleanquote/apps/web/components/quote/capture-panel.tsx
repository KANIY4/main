import Link from 'next/link';

import { ActionForm, Field, InlineForm, Select, TextArea } from '@/components/form';
import {
  addObservationAction,
  answerQuestionAction,
  decideSuggestionAction,
  runExtractionAction,
  submitQuestionAnswerAction,
} from '@/lib/actions/workflow';
import type { QuoteWorkspace } from '@/lib/quote-workspace';

import { Empty, PanelHeading } from './shared';
import { summariseSuggestion } from './suggestion-summary';

/**
 * Capture and AI review.
 *
 * The review queue is the boundary the whole product rests on: a suggestion is
 * a proposal until a person accepts it, and accepting it is one deliberate
 * click per item, never a bulk "apply all".
 */
export function CapturePanel({
  data,
  canEdit,
}: {
  readonly data: QuoteWorkspace;
  readonly canEdit: boolean;
}) {
  const { quote, suggestions, questions } = data;

  return (
    <div className="stack">
      <PanelHeading
        title="Capture"
        description="What was seen on site, and what the assistant made of it. Nothing here changes the price until you say so."
      />

      <section className="card">
        <p className="eyebrow">On site now?</p>
        <p className="muted">
          The capture screen is built for one hand on a phone — bigger targets, fewer fields, and it
          remembers what you typed if you walk out of signal.
        </p>
        <Link className="button" href={`/quotes/${quote.id}/capture`}>
          Open mobile capture
        </Link>
      </section>

      {questions.length > 0 && (
        <section className="card">
          <p className="eyebrow">Worth asking before you price</p>
          <p className="muted">
            The three questions whose answers move the number most. Skipping one is a valid answer —
            it is recorded as a decision, not silently ignored.
          </p>
          <ul className="plain-list">
            {questions.map((question) => (
              <li key={question.id} className="question">
                <p>
                  <strong>{question.question}</strong>
                </p>
                <p className="faint">
                  Affects {question.impact_area.replace(/_/g, ' ')} · {question.materiality}{' '}
                  materiality
                </p>
                {canEdit && (
                  <ActionForm
                    action={submitQuestionAnswerAction}
                    submitLabel="Save answer"
                    pendingLabel="Saving…"
                  >
                    <input type="hidden" name="quoteId" value={quote.id} />
                    <input type="hidden" name="questionId" value={question.id} />
                    <input type="hidden" name="status" value="answered" />
                    <Field label="Answer" name="answer" />
                  </ActionForm>
                )}
                {canEdit && (
                  <div className="button-row">
                    <InlineForm
                      action={answerQuestionAction}
                      label="Ask the client"
                      hidden={{
                        quoteId: quote.id,
                        questionId: question.id,
                        status: 'ask_client',
                      }}
                    />
                    <InlineForm
                      action={answerQuestionAction}
                      label="Not applicable"
                      hidden={{
                        quoteId: quote.id,
                        questionId: question.id,
                        status: 'not_applicable',
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Suggestions waiting on you</h3>
        {suggestions.length === 0 ? (
          <Empty title="Nothing waiting.">
            <p className="faint">
              Run the analysis over your notes and photos and anything it finds will queue here for
              review.
            </p>
          </Empty>
        ) : (
          <ul className="plain-list">
            {suggestions.map((suggestion) => {
              const summary = summariseSuggestion(suggestion.kind, suggestion.payload);
              return (
                <li key={suggestion.id} className="card suggestion">
                  <p className="eyebrow">{suggestion.kind}</p>
                  <p>
                    <strong>{summary.headline}</strong>
                  </p>
                  <p className="muted">{summary.detail}</p>
                  {suggestion.confidence && (
                    <p className="faint">
                      Confidence {Math.round(Number(suggestion.confidence) * 100)}% ·{' '}
                      {suggestion.model}
                    </p>
                  )}
                  {summary.reasoning && <p className="faint">{summary.reasoning}</p>}
                  <p className="footnote">{summary.effect}</p>

                  {canEdit && (
                    <>
                      <div className="button-row">
                        <InlineForm
                          action={decideSuggestionAction}
                          label="Confirm"
                          variant="primary"
                          hidden={{
                            quoteId: quote.id,
                            suggestionId: suggestion.id,
                            decision: 'confirm',
                          }}
                        />
                        <InlineForm
                          action={decideSuggestionAction}
                          label="Reject"
                          variant="danger"
                          hidden={{
                            quoteId: quote.id,
                            suggestionId: suggestion.id,
                            decision: 'reject',
                          }}
                        />
                        <InlineForm
                          action={decideSuggestionAction}
                          label="Someone else should look"
                          hidden={{
                            quoteId: quote.id,
                            suggestionId: suggestion.id,
                            decision: 'needs_review',
                          }}
                        />
                      </div>
                      <form action={decideSuggestionAction} className="correction">
                        <input type="hidden" name="quoteId" value={quote.id} />
                        <input type="hidden" name="suggestionId" value={suggestion.id} />
                        <input type="hidden" name="decision" value="correct" />
                        <label htmlFor={`correct-${suggestion.id}`}>Or correct it</label>
                        <input
                          id={`correct-${suggestion.id}`}
                          name="correctedName"
                          placeholder={summary.headline}
                        />
                        <button type="submit" className="button button-quiet">
                          Save correction
                        </button>
                      </form>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canEdit && (
        <div className="grid grid-2">
          <section className="card">
            <p className="eyebrow">Run the analysis</p>
            <ActionForm
              action={runExtractionAction}
              submitLabel="Analyse the walkthrough"
              pendingLabel="Analysing…"
            >
              <input type="hidden" name="quoteId" value={quote.id} />
              <TextArea
                label="Walkthrough notes"
                name="note"
                rows={5}
                hint="Leave blank to analyse the photos already captured against this quote."
              />
            </ActionForm>
          </section>

          <section className="card">
            <p className="eyebrow">Record an observation</p>
            <ActionForm action={addObservationAction} submitLabel="Save" pendingLabel="Saving…">
              <input type="hidden" name="quoteId" value={quote.id} />
              <Select
                label="Type"
                name="type"
                defaultValue="other"
                options={[
                  { value: 'foot_traffic', label: 'Foot traffic' },
                  { value: 'soiling', label: 'Soiling' },
                  { value: 'access', label: 'Access' },
                  { value: 'existing_service', label: 'Existing service quality' },
                  { value: 'other', label: 'Other' },
                ]}
              />
              <TextArea label="What you saw" name="summary" required />
              <Select
                label="Did you see the full pattern, or a snapshot?"
                name="windowComplete"
                defaultValue="no"
                options={[
                  { value: 'no', label: 'A snapshot — one visit, part of a day' },
                  { value: 'yes', label: 'The full pattern — observed across the window' },
                ]}
                hint="A snapshot can support a price. It must not define one, so we ask rather than assume."
              />
            </ActionForm>
          </section>
        </div>
      )}
    </div>
  );
}
