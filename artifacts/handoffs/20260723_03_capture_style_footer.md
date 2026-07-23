# Capture-style footer

- Task: Match the browser audit UI footer to the Capture Wallet footer style and point GitHub to the requested repository.
- Commit: pending (this handoff is written before the task commit).

## Files Changed

- `src/api/auditUi.ts` — replaced the plain footer with the responsive Capture-style layout and GitHub call to action.

## Commands and Tests Run

- `pnpm test -- --runInBand`
- `pnpm run build`
- `git diff --check`

## Generated Result Paths

- `dist/` — intentionally uncommitted build output produced by `pnpm run build`.

## Known Caveats

- The Capture Wallet page uses a project-specific negative logo asset that this repository does not contain, so the footer uses a styled `TL` project mark instead.

## Follow-up Backlog

- Add a dedicated negative logo asset if a branded footer mark is preferred.

## Scope Changed

- CLI: no
- API: no
- OpenAPI: no
- Validators/schemas: no
- Reports: browser UI footer only
- Fixtures/docs: no
- Handoff policy: followed
