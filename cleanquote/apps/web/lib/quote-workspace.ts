import 'server-only';

import {
  aiStore,
  auditStore,
  crmStore,
  proposalStore,
  tenancyStore,
  withUser,
} from '@cleanquote/database';
import type { quoteStore } from '@cleanquote/database';
import {
  approvalStateFor,
  openQuestions,
  readLatestCalculation,
  readWorkspace,
} from '@cleanquote/workflow';

import type { Actor } from './session';

// Row shapes reach us through the store namespaces rather than as top-level
// exports, which keeps the barrel a list of modules instead of a list of types.
type Approval = Awaited<ReturnType<typeof approvalStateFor>>;
type Calculation = Awaited<ReturnType<typeof readLatestCalculation>>;
type Proposals = Awaited<ReturnType<typeof proposalStore.listProposals>>;
type Qualifiers = Awaited<ReturnType<typeof quoteStore.listQualifiers>>;
type Activity = Awaited<ReturnType<typeof auditStore.listQuoteActivity>>;
type Version = Awaited<ReturnType<typeof quoteStore.getCurrentVersion>>;
type CostLines = Awaited<ReturnType<typeof quoteStore.listCostLines>>;

export interface QuoteWorkspace {
  readonly quote: quoteStore.QuoteRow;
  readonly version: Version;
  readonly spaces: quoteStore.SpaceRow[];
  readonly tasks: quoteStore.QuoteTaskRow[];
  readonly risks: quoteStore.QuoteRiskRow[];
  readonly assumptions: Qualifiers;
  readonly exclusions: Qualifiers;
  readonly costLines: CostLines;
  readonly calculation: Calculation;
  readonly approval: Approval;
  readonly questions: aiStore.AiQuestionRow[];
  readonly settings: tenancyStore.OrganisationSettingsRow | undefined;
  readonly suggestions: aiStore.AiSuggestionRow[];
  readonly activity: Activity;
  readonly proposals: Proposals;
  readonly client: crmStore.ClientRow | undefined;
  readonly site: crmStore.SiteRow | undefined;
}

/**
 * Everything the quote workspace renders, read in one place.
 *
 * The panels are pure presentation over this shape. They never open their own
 * database connection, so there is exactly one point where the tenant identity
 * is established and exactly one place to look when a figure seems wrong.
 */
export async function loadQuoteWorkspace(
  actor: Actor,
  quoteId: string,
): Promise<QuoteWorkspace | undefined> {
  const workspace = await readWorkspace(actor.userId, quoteId);
  if (!workspace) return undefined;

  const [calculation, approval, questions, extras] = await Promise.all([
    readLatestCalculation(actor.userId, quoteId),
    approvalStateFor(actor.userId, quoteId),
    openQuestions(actor.userId, quoteId),
    withUser(actor.userId, async (db) => {
      const [settings, suggestions, activity, clients, site, proposals] = await Promise.all([
        tenancyStore.getSettings(db, actor.organisationId),
        aiStore.listSuggestions(db, quoteId, 'pending'),
        auditStore.listQuoteActivity(db, actor.organisationId, quoteId, 60),
        crmStore.listClients(db, actor.organisationId),
        workspace.quote.site_id
          ? crmStore.getSite(db, workspace.quote.site_id)
          : Promise.resolve(undefined),
        workspace.version
          ? proposalStore.listProposals(db, workspace.version.id)
          : Promise.resolve([]),
      ]);
      return { settings, suggestions, activity, clients, site, proposals };
    }),
  ]);

  const client = extras.clients.find((row) => row.id === workspace.quote.client_id);

  return {
    ...workspace,
    calculation,
    approval,
    questions,
    settings: extras.settings,
    suggestions: extras.suggestions,
    activity: extras.activity,
    proposals: extras.proposals,
    client,
    site: extras.site,
  };
}
