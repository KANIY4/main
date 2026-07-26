import {
  auditStore,
  crmStore,
  quoteStore,
  rateCardStore,
  tenancyStore,
  withUser,
  type Queryable,
} from '@cleanquote/database';

/**
 * Quote creation and the capture entities a walkthrough produces.
 *
 * The rate card is bound to the version at creation. A later edit to the card
 * cannot re-price work already in progress, and a sent version is sealed against
 * writes entirely.
 */

export type QuoteType =
  | 'recurring'
  | 'one_off'
  | 'periodical'
  | 'window_cleaning'
  | 'tender'
  | 'shift_based'
  | 'day_porter'
  | 'industrial'
  | 'controlled_environment'
  | 'post_construction'
  | 'custom';

/** Quote types the schema's own check constraint accepts. */
const SCHEMA_QUOTE_TYPES = new Set([
  'quick_walkthrough',
  'tender',
  'recurring',
  'one_off',
  'periodical',
  'window_cleaning',
  'industrial',
  'post_construction',
  'emergency',
  'blank',
]);

/**
 * Types the product offers that the schema stores under a broader code.
 *
 * Shift-based work, day porter and controlled environments are all recurring
 * contracts commercially; they differ in how they are staffed, not in how they
 * are billed. Storing them as `recurring` keeps the pipeline reporting honest,
 * and the distinction lives in the labour lines where it actually matters.
 */
const TYPE_ALIASES: Record<string, string> = {
  shift_based: 'recurring',
  day_porter: 'recurring',
  controlled_environment: 'recurring',
  custom: 'blank',
};

export function storageQuoteType(type: QuoteType): string {
  const mapped = TYPE_ALIASES[type] ?? type;
  return SCHEMA_QUOTE_TYPES.has(mapped) ? mapped : 'blank';
}

export interface CreateQuoteInput {
  readonly userId: string;
  readonly organisationId: string;
  readonly clientId: string | null;
  readonly siteId: string | null;
  readonly opportunityId?: string | null;
  readonly title: string;
  readonly quoteType: QuoteType;
  readonly contractTermMonths?: number;
}

export async function createQuote(
  input: CreateQuoteInput,
): Promise<{ quoteId: string; versionId: string; reference: string }> {
  return withUser(input.userId, async (db) => {
    const [settings, rateCard] = await Promise.all([
      tenancyStore.getSettings(db, input.organisationId),
      rateCardStore.getDefaultRateCard(db, input.organisationId),
    ]);
    if (!rateCard) {
      throw new Error(
        'Set up a rate card before creating a quote — nothing can be priced without one.',
      );
    }

    const organisation = await db.query<{ currency_code: string; slug: string }>(
      `select currency_code, slug from public.organisations where id = $1`,
      [input.organisationId],
    );
    const currency = organisation.rows[0]?.currency_code ?? 'AUD';
    const prefix = (organisation.rows[0]?.slug ?? 'CQ').slice(0, 3).toUpperCase();

    const reference = await quoteStore.nextQuoteReference(db, input.organisationId, prefix);

    const created = await quoteStore.createQuote(db, {
      organisationId: input.organisationId,
      clientId: input.clientId,
      siteId: input.siteId,
      opportunityId: input.opportunityId ?? null,
      reference,
      title: input.title,
      quoteType: storageQuoteType(input.quoteType),
      currencyCode: currency,
      contractTermMonths: input.contractTermMonths ?? 12,
      quoteValidityDays: settings?.default_quote_validity_days ?? 30,
      rateCardId: rateCard.id,
      createdByUserId: input.userId,
    });

    if (input.opportunityId) {
      await crmStore.moveOpportunityStage(db, {
        organisationId: input.organisationId,
        opportunityId: input.opportunityId,
        toStage: 'drafting',
        changedByUserId: input.userId,
        note: `Quote ${reference} created.`,
      });
    }

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'quote.created',
      entityType: 'quote',
      entityId: created.quoteId,
      after: { reference, title: input.title, type: input.quoteType, rateCardId: rateCard.id },
    });

    return { ...created, reference };
  });
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export interface AddSpaceInput {
  readonly userId: string;
  readonly organisationId: string;
  readonly quoteId: string;
  readonly name: string;
  readonly roomType: string;
  readonly quantity?: number;
  readonly floorAreaSqm?: number | null;
  readonly trafficLevel?: string | null;
  readonly soilLevel?: string | null;
  readonly furnitureDensity?: string | null;
  readonly accessDifficulty?: string | null;
  readonly surfaceTypes?: readonly string[];
  readonly fieldStatus?: 'confirmed' | 'estimated' | 'client_provided' | 'pending_clarification';
  readonly notes?: string | null;
}

export async function addSpace(input: AddSpaceInput): Promise<string> {
  return withUser(input.userId, async (db) => {
    const spaceId = await quoteStore.createSpace(db, {
      organisationId: input.organisationId,
      quoteId: input.quoteId,
      name: input.name,
      roomType: input.roomType,
      quantity: input.quantity ?? 1,
      floorAreaSqm: input.floorAreaSqm ?? null,
      surfaceTypes: input.surfaceTypes ?? [],
      trafficLevel: input.trafficLevel ?? null,
      soilLevel: input.soilLevel ?? null,
      furnitureDensity: input.furnitureDensity ?? null,
      accessDifficulty: input.accessDifficulty ?? null,
      notes: input.notes ?? null,
      fieldStatus: input.fieldStatus ?? 'confirmed',
      evidenceSource: 'manual_entry',
    });

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'quote.space_added',
      entityType: 'quote',
      entityId: input.quoteId,
      after: { spaceId, name: input.name, area: input.floorAreaSqm ?? null },
    });

    return spaceId;
  });
}

export interface AddTaskInput {
  readonly userId: string;
  readonly organisationId: string;
  readonly quoteId: string;
  readonly spaceId: string | null;
  readonly label: string;
  readonly frequencyPattern: string;
  readonly daysPerWeek?: number | null;
  readonly quantity: number;
  readonly unit: string;
  readonly minutesPerUnit?: number | null;
  readonly unitsPerHour?: number | null;
  readonly labourProfileCode?: string;
  readonly fieldStatus?: 'confirmed' | 'estimated' | 'client_provided' | 'pending_clarification';
}

export async function addTask(input: AddTaskInput): Promise<string> {
  return withUser(input.userId, async (db) => {
    const taskId = await quoteStore.createTask(db, {
      organisationId: input.organisationId,
      quoteId: input.quoteId,
      spaceId: input.spaceId,
      label: input.label,
      frequencyPattern: input.frequencyPattern,
      daysPerWeek: input.daysPerWeek ?? null,
      quantity: input.quantity,
      unit: input.unit,
      minutesPerUnit: input.minutesPerUnit ?? null,
      unitsPerHour: input.unitsPerHour ?? null,
      labourProfileCode: input.labourProfileCode ?? 'cleaner',
      fieldStatus: input.fieldStatus ?? 'confirmed',
    });

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'quote.task_added',
      entityType: 'quote',
      entityId: input.quoteId,
      after: { taskId, label: input.label, frequency: input.frequencyPattern },
    });

    return taskId;
  });
}

/**
 * Applies a task template to a space.
 *
 * Templates carry a starting duration per item; the estimator adjusts from
 * there. Nothing is priced until a task exists on the quote, so a template that
 * does not fit can simply be edited or removed.
 */
export async function applyTaskTemplate(input: {
  userId: string;
  organisationId: string;
  quoteId: string;
  spaceId: string;
  templateCode: string;
  quantity: number;
  unit: string;
  daysPerWeek?: number;
}): Promise<string[]> {
  return withUser(input.userId, async (db) => {
    const items = await db.query<{
      label: string;
      default_frequency: string;
      default_minutes_per_unit: string | null;
      default_units_per_hour: string | null;
      unit: string;
      sort_order: number;
    }>(
      `select i.label, i.default_frequency, i.default_minutes_per_unit,
              i.default_units_per_hour, i.unit, i.sort_order
       from public.task_template_items i
       join public.task_templates t on t.id = i.template_id
       where t.code = $1 and (t.organisation_id is null or t.organisation_id = $2)
       order by i.sort_order`,
      [input.templateCode, input.organisationId],
    );

    const created: string[] = [];
    for (const item of items.rows) {
      created.push(
        await quoteStore.createTask(db, {
          organisationId: input.organisationId,
          quoteId: input.quoteId,
          spaceId: input.spaceId,
          label: item.label,
          frequencyPattern: item.default_frequency,
          daysPerWeek: item.default_frequency === 'weekly' ? (input.daysPerWeek ?? 5) : null,
          // An item priced per square metre uses the space's area; a per-item
          // rate uses the count the estimator gave.
          quantity: input.quantity,
          unit: item.unit === 'm2' ? 'm2' : input.unit,
          minutesPerUnit: item.default_minutes_per_unit
            ? Number(item.default_minutes_per_unit)
            : null,
          unitsPerHour: item.default_units_per_hour ? Number(item.default_units_per_hour) : null,
          fieldStatus: 'estimated',
          sortOrder: item.sort_order,
        }),
      );
    }

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'quote.template_applied',
      entityType: 'quote',
      entityId: input.quoteId,
      after: { template: input.templateCode, tasksCreated: created.length },
    });

    return created;
  });
}

export async function addCostLine(input: {
  userId: string;
  organisationId: string;
  quoteId: string;
  lineKey: string;
  label: string;
  category: string;
  method: string;
  amount: string;
  oneOff?: boolean;
}): Promise<void> {
  await withUser(input.userId, async (db) => {
    const version = await quoteStore.getCurrentVersion(db, input.quoteId);
    if (!version) throw new Error('That quote has no version.');
    await quoteStore.upsertCostLine(db, {
      organisationId: input.organisationId,
      versionId: version.id,
      lineKey: input.lineKey,
      label: input.label,
      category: input.category,
      method: input.method,
      amount: input.amount,
      oneOff: input.oneOff ?? false,
    });
  });
}

export async function addRisk(input: {
  userId: string;
  organisationId: string;
  quoteId: string;
  code: string;
  label: string;
  probability: number;
  impactAmount: string;
  mitigation?: string | null;
}): Promise<string> {
  return withUser(input.userId, async (db) =>
    quoteStore.createRisk(db, {
      organisationId: input.organisationId,
      quoteId: input.quoteId,
      code: input.code,
      label: input.label,
      probability: input.probability,
      impactAmount: input.impactAmount,
      mitigation: input.mitigation ?? null,
    }),
  );
}

export async function addQualifier(input: {
  userId: string;
  organisationId: string;
  quoteId: string;
  kind: 'assumption' | 'exclusion' | 'clarification' | 'compliance';
  statement: string;
}): Promise<string> {
  return withUser(input.userId, async (db) =>
    quoteStore.createQualifier(db, {
      organisationId: input.organisationId,
      quoteId: input.quoteId,
      kind: input.kind,
      statement: input.statement,
    }),
  );
}

/** Marks a captured field's confidence: confirmed, estimated, client-provided or pending. */
export async function setFieldStatus(input: {
  userId: string;
  organisationId: string;
  entity: 'space' | 'task' | 'asset';
  entityId: string;
  status: 'confirmed' | 'estimated' | 'client_provided' | 'pending_clarification';
}): Promise<void> {
  const table =
    input.entity === 'space'
      ? 'public.spaces'
      : input.entity === 'task'
        ? 'public.quote_tasks'
        : 'public.quote_assets';

  await withUser(input.userId, async (db: Queryable) => {
    await db.query(`update ${table} set field_status = $2 where id = $1`, [
      input.entityId,
      input.status,
    ]);
    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'quote.field_status_changed',
      entityType: input.entity,
      entityId: input.entityId,
      after: { status: input.status },
    });
  });
}

export async function readWorkspace(userId: string, quoteId: string) {
  return withUser(userId, async (db) => {
    const quote = await quoteStore.getQuote(db, quoteId);
    if (!quote) return undefined;
    const version = await quoteStore.getCurrentVersion(db, quoteId);
    const [spaces, tasks, risks, assumptions, exclusions, costLines] = await Promise.all([
      quoteStore.listSpaces(db, quoteId),
      quoteStore.listTasks(db, quoteId),
      quoteStore.listRisks(db, quoteId),
      quoteStore.listQualifiers(db, quoteId, 'assumption'),
      quoteStore.listQualifiers(db, quoteId, 'exclusion'),
      version ? quoteStore.listCostLines(db, version.id) : Promise.resolve([]),
    ]);
    return { quote, version, spaces, tasks, risks, assumptions, exclusions, costLines };
  });
}
