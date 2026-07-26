/**
 * Tenancy, roles and permissions.
 *
 * Roles are a convenience label over a permission set. Authorisation decisions are made
 * against permissions, never against a role name, so an organisation can define its own
 * roles without the code needing to know about them.
 */

export const PERMISSIONS = [
  'quote.create',
  'quote.edit',
  'quote.delete',
  'quote.view_cost',
  'quote.view_selling_price',
  'quote.view_profit',
  'quote.override_margin',
  'quote.approve',
  'quote.send',
  'rate_card.manage',
  'benchmark.manage',
  'user.manage',
  'organisation.manage',
  'analytics.view',
  'ai.view_history',
  'data.export',
  'billing.manage',
  'integration.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type SystemRole =
  | 'owner'
  | 'director'
  | 'administrator'
  | 'estimator'
  | 'sales_manager'
  | 'operations_manager'
  | 'supervisor'
  | 'reviewer'
  | 'finance'
  | 'read_only'
  | 'external_consultant';

/**
 * Default permission grants per system role. An organisation may add custom roles or
 * adjust these; this table is the seed, not the enforcement mechanism.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<SystemRole, readonly Permission[]>> = {
  owner: PERMISSIONS,
  director: PERMISSIONS,
  administrator: [
    'quote.create',
    'quote.edit',
    'quote.view_cost',
    'quote.view_selling_price',
    'quote.send',
    'rate_card.manage',
    'user.manage',
    'organisation.manage',
    'analytics.view',
    'ai.view_history',
    'data.export',
  ],
  estimator: [
    'quote.create',
    'quote.edit',
    'quote.view_cost',
    'quote.view_selling_price',
    'ai.view_history',
  ],
  sales_manager: [
    'quote.create',
    'quote.edit',
    'quote.view_cost',
    'quote.view_selling_price',
    'quote.view_profit',
    'quote.send',
    'analytics.view',
  ],
  operations_manager: [
    'quote.view_cost',
    'quote.view_selling_price',
    'quote.approve',
    'analytics.view',
  ],
  supervisor: ['quote.create', 'quote.edit'],
  reviewer: ['quote.view_cost', 'quote.view_selling_price', 'quote.view_profit', 'quote.approve'],
  finance: [
    'quote.view_cost',
    'quote.view_selling_price',
    'quote.view_profit',
    'analytics.view',
    'billing.manage',
    'data.export',
  ],
  read_only: ['quote.view_selling_price'],
  external_consultant: ['quote.create', 'quote.edit'],
};

export interface OrganisationMembership {
  readonly organisationId: string;
  readonly userId: string;
  readonly role: SystemRole | string;
  readonly permissions: readonly Permission[];
  readonly status: 'active' | 'invited' | 'suspended';
}

// ---------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------

/**
 * Plan limits are data, never constants in code. A limit of `null` means unlimited.
 */
export type UsageDimension =
  | 'quotes_created'
  | 'ai_messages'
  | 'image_analyses'
  | 'document_pages'
  | 'ar_scans'
  | 'storage_mb'
  | 'seats'
  | 'proposal_sends'
  | 'api_calls';

export type FeatureFlag =
  | 'ai_copilot'
  | 'ai_tender_analyst'
  | 'ai_scope_gap_detector'
  | 'ar_measurement'
  | 'profit_simulator'
  | 'live_negotiation'
  | 'proposal_designer'
  | 'approval_workflow'
  | 'client_portal'
  | 'white_label'
  | 'public_api'
  | 'branches'
  | 'sso'
  | 'actual_vs_quoted'
  | 'benchmark_network'
  | 'in_app_purchase';

export interface Entitlement {
  readonly feature: FeatureFlag;
  readonly enabled: boolean;
}

export interface UsageLimit {
  readonly dimension: UsageDimension;
  /** null = unlimited. */
  readonly limit: number | null;
  readonly period: 'month' | 'year' | 'lifetime';
  readonly overageAllowed: boolean;
}

export interface PlanDefinition {
  readonly code: string;
  readonly label: string;
  readonly entitlements: readonly Entitlement[];
  readonly limits: readonly UsageLimit[];
}
