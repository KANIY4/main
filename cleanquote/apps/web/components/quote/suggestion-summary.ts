/**
 * Turns a stored AI suggestion payload into something a human can decide on.
 *
 * The wording matters more than it looks. An extracted area is described as an
 * estimate from what was visible, never as a measurement, and an asset count is
 * always "visible", because that is the only claim the evidence supports.
 */

interface Candidate {
  readonly value: unknown;
  readonly confidence?: number;
  readonly reasoning?: string;
}

function candidate(payload: Record<string, unknown>, key: string): Candidate | undefined {
  const raw = payload[key];
  if (raw && typeof raw === 'object' && 'value' in raw) return raw as Candidate;
  return undefined;
}

function text(value: unknown, fallback = 'unspecified'): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export interface SuggestionSummary {
  readonly headline: string;
  readonly detail: string;
  /** What confirming this will actually create. Stated before the decision, not after. */
  readonly effect: string;
  readonly reasoning?: string;
}

export function summariseSuggestion(
  kind: string,
  payload: Record<string, unknown>,
): SuggestionSummary {
  switch (kind) {
    case 'space': {
      const roomType = candidate(payload, 'roomType');
      const area = candidate(payload, 'estimatedFloorAreaSqm');
      const areaValue = typeof area?.value === 'number' ? area.value : undefined;
      return {
        headline: text(payload['name'], 'Unnamed area'),
        detail: areaValue
          ? `${text(roomType?.value)} · roughly ${areaValue} m² from what was visible`
          : text(roomType?.value),
        effect: areaValue
          ? 'Creates an area marked as estimated. It will price, and it will keep saying it was estimated until someone measures it.'
          : 'Creates an area with no floor size. Task quantities will drive the price.',
        ...(area?.reasoning ? { reasoning: area.reasoning } : {}),
      };
    }
    case 'asset': {
      const visible = candidate(payload, 'visibleQuantity');
      const quantity = typeof visible?.value === 'number' ? visible.value : 0;
      return {
        headline: text(payload['assetTypeCode'], 'Asset'),
        detail: `${quantity} visible in the evidence provided`,
        effect:
          'Records a visible count, not a site total. If more exist out of shot, the count stays wrong until someone checks.',
      };
    }
    case 'risk':
      return {
        headline: text(payload['label'], 'Risk'),
        detail: `Estimated likelihood ${Math.round(Number(payload['probability'] ?? 0) * 100)}%`,
        effect:
          'Creates a risk with an impact of zero. You put the number on it — the model never prices a risk.',
        ...(typeof payload['rationale'] === 'string' ? { reasoning: payload['rationale'] } : {}),
      };
    case 'observation':
      return {
        headline: text(payload['summary'], 'Observation'),
        detail:
          payload['observationWindowComplete'] === true
            ? 'Observed over a complete window'
            : 'Observed over a partial window — treat as indicative',
        effect: 'Records the observation against the quote as captured evidence.',
      };
    case 'assumption':
      return {
        headline: text(payload['statement'], 'Assumption'),
        detail: `Affects ${text(payload['affects'], 'scope')} · ${text(payload['materiality'], 'medium')} materiality`,
        effect: 'Adds an assumption that will appear in the client proposal.',
      };
    default:
      return {
        headline: kind,
        detail: 'Suggestion',
        effect: 'Creates the corresponding record on this quote.',
      };
  }
}
