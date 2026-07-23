# Centered upload controls and paste divider

- Task: Center upload controls below their “or” dividers and add an upload-to-paste divider for the single-artifact panel.
- Commit: pending (this handoff is written before the task commit).

## Files Changed

- `src/api/auditUi.ts` — centers file-picker controls and adds the second artifact-panel divider.

## Commands and Tests Run

- `pnpm test -- --runInBand`
- `pnpm run build`
- `git diff --check`

## Generated Result Paths

- `dist/` — intentionally uncommitted build output produced by `pnpm run build`.

## Known Caveats

- None.

## Follow-up Backlog

- None.

## Scope Changed

- CLI: no
- API: no
- OpenAPI: no
- Validators/schemas: no
- Reports: browser input controls only
- Fixtures/docs: no
- Handoff policy: followed
