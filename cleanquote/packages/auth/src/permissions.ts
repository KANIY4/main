import type { Permission } from '@cleanquote/types';

/**
 * Permission checks for the server layer.
 *
 * These are a **second** gate, not the gate. The database decides: every tenant
 * table is behind RLS keyed on `public.has_permission`, and a request that slips
 * past this module still cannot read or write another organisation's rows.
 *
 * Checking here anyway buys two things the database cannot: a useful error
 * message instead of an empty result set, and the ability to refuse before doing
 * expensive work. Hiding a button is not on the list — a hidden control is a
 * courtesy, never a control.
 */

export interface ActorContext {
  readonly userId: string;
  readonly organisationId: string;
  readonly permissions: readonly string[];
}

export class ForbiddenError extends Error {
  readonly required: Permission;
  constructor(required: Permission) {
    super(`This action requires the "${required}" permission.`);
    this.name = 'ForbiddenError';
    this.required = required;
  }
}

export function can(actor: ActorContext, permission: Permission): boolean {
  return actor.permissions.includes(permission);
}

export function requirePermission(actor: ActorContext, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError(permission);
}

export function canAny(actor: ActorContext, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(actor, permission));
}

/**
 * What the viewer is allowed to see of a quote's numbers.
 *
 * Mirrors the split the database enforces: `quote.view_selling_price` reaches
 * the price view, `quote.view_cost` reaches the calculation snapshot.
 */
export interface FinancialVisibility {
  readonly price: boolean;
  readonly cost: boolean;
  readonly profit: boolean;
}

export function financialVisibility(actor: ActorContext): FinancialVisibility {
  return {
    price: can(actor, 'quote.view_selling_price'),
    cost: can(actor, 'quote.view_cost'),
    profit: can(actor, 'quote.view_profit'),
  };
}
