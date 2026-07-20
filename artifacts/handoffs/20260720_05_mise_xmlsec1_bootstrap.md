# Mise xmlsec1 bootstrap package

## Task

Add the `xmlsec1` runtime dependency to `.mise.toml`.

## Commit

Pending at handoff creation.

## Files Changed

- `.mise.toml`
- `README.md`

## Commands and Tests

- `mise bootstrap packages status --json`
- `mise bootstrap --dry-run`
- `npm test`
- `npm run build`
- `git diff --check`

## Generated Result Paths

- `artifacts/handoffs/20260720_05_mise_xmlsec1_bootstrap.md` — committed
  handoff for this change.

## Generated Artifacts Not Committed

- None.

## Known Caveats

- The configured `apt:xmlsec1` bootstrap package targets Debian/Ubuntu
  development environments.
- The package uses the distribution-provided version because a fixed native
  package version would not be portable across Debian/Ubuntu releases.
- `mise install` installs `[tools]`; `mise bootstrap` installs both bootstrap
  packages and tools.

## Follow-up Backlog

- Add an OS-specific bootstrap entry if a supported non-Debian development
  platform is selected.

## Change Scope

- Mise environment configuration, README documentation, and handoff policy
  output changed.
- CLI, API, OpenAPI, validators, schemas, reports, fixtures, and tests were not
  changed.
