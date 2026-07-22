# Mise xmllint bootstrap package

## Task

Add the system package that provides `xmllint` to the repository's Mise bootstrap configuration.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `.mise.toml`
- `README.md`
- `artifacts/handoffs/20260722_14_mise_xmllint_bootstrap.md`

## Commands and Tests Run

- `mise bootstrap packages status --json` — passed; `libxml2-utils` is recognized and currently missing.
- `mise bootstrap --dry-run` — passed; resolves the missing package to `apt-get install -y -- libxml2-utils`.
- `npm run build` — passed.
- `npm test` — passed: 31 files, 170 tests.
- `git diff --check` — passed.

## Implementation Notes

- Added `apt:libxml2-utils = "latest"` under `[bootstrap.packages]`; this Debian/Ubuntu package provides `xmllint`.
- Kept `xmlsec1` as the existing XML signature dependency.
- Updated the README to document both Mise bootstrap dependencies and the equivalent direct `apt-get` installation.

## Known Caveats

- This bootstrap entry targets Debian/Ubuntu environments supported by Mise's apt backend.
- `xmllint` was not installed as part of this configuration-only task; run `mise bootstrap` to install the missing package.
- The distribution-provided package version is used because fixed native package versions are not portable across Debian/Ubuntu releases.

## Follow-up Backlog

- Run `mise bootstrap` on development and CI hosts that need live XML Schema validation.
- Add an OS-specific package entry if another supported development platform is selected.

## Surface Changes

- CLI, API, OpenAPI, validators, schemas, reports, fixtures, and tests: unchanged.
- Mise environment configuration and README installation documentation: changed.
- Handoff policy: followed.

## Generated Result Paths

- `artifacts/handoffs/20260722_14_mise_xmllint_bootstrap.md` — committed; concise task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used only for verification.

No audit reports, live fetched artifacts, package archives, or review archives were generated.
