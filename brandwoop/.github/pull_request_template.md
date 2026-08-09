## What changed

<!-- The outcome, not the file list. Link the issue or change record. -->

## Why

## How to test

## Definition of done

- [ ] Acceptance criteria, permission rules, validation and error/empty/loading states implemented
- [ ] Shared contracts used; no shape redefined inside an app
- [ ] Positive and negative tenant-boundary tests added or updated
- [ ] Sensitive fields excluded from broad queries and from logs
- [ ] Migration includes a rollback or forward-repair note (or: no migration)
- [ ] Documentation and release notes updated

## Security impact

- [ ] Touches authentication, authorisation, RLS, uploads, GPS, notifications or CI permissions
      → security reviewer required
- [ ] No new third-party dependency, or the repository approval register row is added
- [ ] No secrets, production data or signing material in the diff

## Risk and rollback

<!-- What breaks if this is wrong, and how it is reverted. -->
