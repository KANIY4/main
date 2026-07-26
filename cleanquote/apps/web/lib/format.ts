/**
 * Presentation formatting.
 *
 * Everything arrives from the engine as a decimal string. These helpers format
 * for display only — no value is ever converted to a number and back into the
 * data flow, because that is exactly how precision gets lost.
 */

export function money(amount: string, currency: string, options?: { decimals?: number }): string {
  const decimals = options?.decimals ?? 2;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(amount));
}

/** Whole currency units. Used where the cents are noise, e.g. annual headline values. */
export function moneyCompact(amount: string, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function percent(value: string, decimals = 1): string {
  return `${Number(value).toFixed(decimals)}%`;
}

export function hours(value: string, decimals = 0): string {
  return `${Number(value).toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} h`;
}

export function count(value: string, decimals = 0): string {
  return Number(value).toLocaleString('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const CATEGORY_LABELS: Record<string, string> = {
  routine: 'Routine cleaning',
  periodical: 'Periodical services',
  supervision: 'Supervision',
  day_porter: 'Day porter',
  management: 'Management',
  mobilisation: 'Mobilisation',
  initial_clean: 'Initial clean',
  reactive: 'Reactive work',
};

export function labourCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

export function costCategoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
}

export function guardrailLabel(code: string): string {
  return code.replace(/_/g, ' ').replace(/^min /, 'Minimum ');
}
