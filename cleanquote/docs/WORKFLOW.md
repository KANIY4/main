# The commercial workflow

How a quotation gets from an empty account to a signed acceptance, and what the system
refuses to do at each step. Every diagram here describes code that exists; where something
is not built, it says so rather than being drawn.

## Registration and organisation creation

An account and an organisation are separate things. A person registers, confirms an
address, and only then creates or joins a company — which is why an invited colleague
lands inside an existing organisation rather than accidentally founding a second one.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant Web as apps/web
  participant Auth as "@cleanquote/auth"
  participant DB as PostgreSQL
  participant Mail as "@cleanquote/email"

  User->>Web: register(email, password, name)
  Web->>Auth: register()
  Auth->>Auth: scrypt hash (N=16384, r=8, p=1)
  Auth->>DB: insert user, credential, verification token hash
  Auth-->>Web: verification token (returned once)
  Web->>Mail: send verification link
  Note over Mail: With no mail credentials the local<br/>provider records it at /dev/inbox.<br/>A failed send never unwinds the write.

  User->>Web: open /verify?token=…
  Web->>Auth: verifyEmail(token)
  Auth->>DB: match sha256(token), mark confirmed, consume token

  User->>Web: sign in
  Web->>Auth: signIn()
  Note over Auth: Unknown address still hashes a dummy<br/>password, so timing does not reveal<br/>whether an account exists.
  Auth->>DB: insert session (only the token hash is stored)
  Web-->>User: httpOnly · SameSite=Lax cookie

  alt No membership yet
    Web->>DB: createOrganisationWithOnboarding()
    Note over DB: One transaction: organisation, settings,<br/>owner membership, rate card, scenarios,<br/>margin rules. An organisation without an<br/>owner is never observable.
  else Invitation pending
    Web->>DB: acceptInvitation(token, email)
    Note over DB: Bound to the invited address.<br/>A leaked link cannot admit<br/>a different account.
  end
```

**Why the organisation is created with the application role rather than under RLS.** At the
moment of creation the caller is a member of nothing and could not satisfy an INSERT
policy. Splitting it into policy-governed statements would leave a window in which an
organisation exists with no owner. `createOrganisation` is the one write that runs
privileged, and it is a single transaction.

## The quote lifecycle

```mermaid
stateDiagram-v2
  [*] --> draft: createQuote()
  draft --> capturing: first area or task added
  capturing --> capturing: recalculate → new snapshot
  capturing --> in_review: scenario selected
  in_review --> awaiting_approval: submitForApproval()
  in_review --> sent: sendProposal() — no trigger fired
  awaiting_approval --> approved: reviewer approves
  awaiting_approval --> rejected: reviewer rejects
  rejected --> capturing: revise and resubmit
  approved --> sent: sendProposal()
  approved --> changes_requested: recalculation invalidates the approval
  changes_requested --> awaiting_approval: resubmit
  sent --> accepted: client accepts
  sent --> declined: client declines
  sent --> expired: validity elapses
  accepted --> [*]
  declined --> [*]

  note right of sent
    The version is sealed on send.
    A revision creates a new version;
    it never overwrites what a client
    was shown.
  end note
```

A quote binds to a rate-card version when it is created. Editing the rate card afterwards
changes what _future_ quotes are priced against and cannot reprice work in progress or
anything already sent.

## AI extraction and confirmation

The boundary the whole product rests on. A suggestion is a proposal until a person accepts
it; accepting is one deliberate action per item, and there is no bulk apply.

```mermaid
sequenceDiagram
  autonumber
  actor Estimator
  participant Web as apps/web
  participant Flow as "@cleanquote/workflow"
  participant Model as "Anthropic (or the mock)"
  participant Valid as "@cleanquote/validation"
  participant DB as PostgreSQL

  Estimator->>Web: Analyse the walkthrough
  Web->>Flow: runExtraction()
  Note over Web: Rate limited per organisation:<br/>the model budget is the company's.
  Flow->>Model: extract(sources, existing areas, quote type)
  Model-->>Flow: tool-use payload
  Flow->>Valid: parse against walkthroughExtractionSchema

  alt Fails validation
    Flow->>DB: record the run with schemaValid = false
    Flow-->>Web: nothing was saved, the attempt is logged
  else Parses
    Flow->>DB: record the run
    Flow->>DB: insert suggestions (pending) and scored questions
    Note over DB: Nothing has touched the quote.<br/>No space, task, risk or price<br/>exists yet.
  end

  Estimator->>Web: Confirm / Correct / Reject / Needs review
  Web->>Flow: decideSuggestion()
  alt Confirm or correct
    Flow->>DB: create the real record
    Note over DB: An AI-estimated area lands with<br/>field_status = 'estimated', even<br/>when confirmed. A risk lands with<br/>impactAmount = '0' — the model<br/>never prices anything.
    Flow->>DB: keep the original payload beside the correction
  else Reject
    Flow->>DB: record the decision only
  end
```

`visibleQuantity`, never `quantity`. Photo coverage of a site is partial by nature: "eight
visible windows" is a claim the evidence supports; "the site has eight windows" is not, and
the schema is where that distinction is enforced.

## Approval, and how it is invalidated

An approval is granted against one calculation. What makes "approved" mean anything is that
it stops meaning it when the numbers move.

```mermaid
sequenceDiagram
  autonumber
  actor Estimator
  actor Reviewer
  participant Flow as "@cleanquote/workflow"
  participant DB as PostgreSQL

  Estimator->>Flow: submitForApproval(scenario)
  Flow->>DB: insert approval with calculation_input_hash
  Reviewer->>Flow: decideApproval('approved')
  Flow->>DB: status = approved

  Estimator->>Flow: recalculateQuote() after editing a task
  Flow->>DB: insert calculation_snapshot (new input hash)
  DB->>DB: trigger invalidate_approval_on_recalculation
  Note over DB: The approval no longer describes<br/>what would be sent, so it is marked<br/>changes_requested with a reason.

  Estimator->>Flow: sendProposal()
  Flow-->>Estimator: ApprovalRequiredError
  Note over Flow: The check compares the approval's hash<br/>against the current snapshot. It is not a<br/>hidden button — the server refuses.
```

The trigger is in the database rather than the application because the application is not
the only thing that can write a snapshot, and an approval that survives a change made
through any other path is worse than no approval at all.

## Proposal publication

```mermaid
sequenceDiagram
  autonumber
  actor Sender
  participant Flow as "@cleanquote/workflow"
  participant DB as PostgreSQL
  participant Mail as "@cleanquote/email"

  Sender->>Flow: sendProposal(scenario, recipient)
  Flow->>Flow: approval triggers vs. recorded approval hash
  Flow->>Flow: buildProposalContent()
  Note over Flow: The projection never reads margin,<br/>cost, contingency, strategy name,<br/>approval threshold or negotiation<br/>floor onto the object. There is<br/>nothing for a template bug to leak.
  Flow->>Flow: issueToken() — 32 random bytes
  Flow->>DB: insert proposal with sha256(token), expiry
  Flow->>DB: seal the quote version
  Flow->>Mail: send the link
  Note over Mail: A failed send is recorded and<br/>returned. It never unwinds the<br/>proposal — the quote is not lost<br/>because a mail server was down.
  Flow-->>Sender: the link, shown once
```

Only the hash is stored, so the link cannot be recovered from the application afterwards —
reissuing is the recovery path, which is the same property that makes a database leak
useless for reading client proposals.

## Client acceptance

```mermaid
sequenceDiagram
  autonumber
  actor Client
  participant Page as "/p/[token]"
  participant DB as PostgreSQL

  Client->>Page: open the link
  Page->>Page: rate limit per caller
  Page->>DB: get_public_proposal(sha256(token))
  Note over DB: SECURITY DEFINER. Checks expiry and<br/>revocation, returns client-facing<br/>fields only. The anonymous role holds<br/>no table grants at all, so a leaked<br/>token cannot be widened into access.
  DB-->>Page: content, or nothing
  Page->>DB: record the view

  Client->>Page: accept(name, position)
  Page->>DB: acceptProposal()
  Note over DB: One transaction: proposal accepted,<br/>quote → accepted, opportunity → won.<br/>A proposal marked accepted beside a<br/>quote that still reads "sent" would<br/>misreport the pipeline.
  DB-->>Page: accepted, or refused if already decided
```

A revoked, expired, wrong or guessed token all produce the same answer: nothing here.
Distinguishing them would turn the link into an oracle.

## What this workflow does not do

- **It does not queue captured work offline.** The app is installable and caches its shell
  so a lost signal shows a readable page. Uploads are not resumed after the page closes,
  and the interface never says otherwise. See [STORAGE.md](STORAGE.md).
- **It does not measure.** AR measurement is not built. An area entered from a walkthrough
  is marked estimated and keeps saying so.
- **It does not convert a visual estimate into a site total.** An asset count is a visible
  count. Confirming one does not promote it.
