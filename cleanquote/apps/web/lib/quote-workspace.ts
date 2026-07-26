import 'server-only';

import {
  aiStore,
  auditStore,
  crmStore,
  mediaStore,
  proposalStore,
  tenancyStore,
  withUser,
} from '@cleanquote/database';
import type { quoteStore } from '@cleanquote/database';
import {
  approvalStateFor,
  mediaLink,
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
  readonly photos: mediaStore.FileRow[];
  /** Signed and expiring, resolved per request. Never stored, never permanent. */
  readonly photoLinks: Record<string, string>;
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
      const [settings, suggestions, activity, clients, site, proposals, photos] = await Promise.all(
        [
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
          mediaStore.listQuoteFiles(db, quoteId),
        ],
      );
      return { settings, suggestions, activity, clients, site, proposals, photos };
    }),
  ]);

  const client = extras.clients.find((row) => row.id === workspace.quote.client_id);

  // Resolved one per photo rather than one permanent URL per photo: a link that
  // never expires is a link that outlives the person's access to the quote.
  const photoLinks: Record<string, string> = {};
  await Promise.all(
    extras.photos.map(async (photo) => {
      const link = await mediaLink(actor.userId, photo.id, 'thumbnail');
      if (link) photoLinks[photo.id] = link;
    }),
  );

  return {
    ...workspace,
    calculation,
    approval,
    questions,
    settings: extras.settings,
    suggestions: extras.suggestions,
    activity: extras.activity,
    proposals: extras.proposals,
    photos: extras.photos,
    photoLinks,
    client,
    site: extras.site,
  };
}
