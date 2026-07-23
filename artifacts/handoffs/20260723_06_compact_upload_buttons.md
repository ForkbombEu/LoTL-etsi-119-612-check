# Compact upload buttons

- Task: Rename LoTL and artifact file controls to “Upload…” and make them text-width buttons.
- Commit: pending (this handoff is written before the task commit).

## Files Changed

- `src/api/auditUi.ts` — updates both upload labels and makes file-picker controls inline-flex with fit-content width.

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
