# Fixture verdict fallback

- Task: Prevent the browser Findings renderer from failing when fixture readiness has no verdict.
- Commit: pending (this handoff is written before the task commit).

## Files Changed

- `src/api/auditUi.ts` — renders a missing readiness verdict as `not available`.

## Commands and Tests Run

- `pnpm test -- --runInBand`
- `pnpm run build`
- `git diff --check`

## Generated Result Paths

- `dist/` — intentionally uncommitted build output produced by `pnpm run build`.

## Known Caveats

- The fallback prevents a rendering failure but does not infer a readiness verdict absent from the report.

## Follow-up Backlog

- None.

## Scope Changed

- CLI: no
- API: no
- OpenAPI: no
- Validators/schemas: no
- Reports: browser Findings rendering only
- Fixtures/docs: no
- Handoff policy: followed
