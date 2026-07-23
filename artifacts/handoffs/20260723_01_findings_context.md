# Findings output context

- Task: Add human-readable context to every Findings section and card in the browser audit UI.
- Commit: pending (this handoff is written before the task commit).

## Files Changed

- `src/api/auditUi.ts` — added context-aware group summaries, readable check titles, and bounded check descriptions; retained existing finding messages and statuses.

## Commands and Tests Run

- `pnpm test -- --runInBand`
- `pnpm run build`

## Generated Result Paths

- `dist/` — intentionally uncommitted build output produced by `pnpm run build`.

## Known Caveats

- The new card descriptions are derived from stable finding IDs. Fixture-readiness checks have tailored descriptions; all other current and future IDs receive a bounded humanized fallback.

## Follow-up Backlog

- Consider adding curated descriptions for any future IDs whose generic fallback is not sufficiently clear.

## Scope Changed

- CLI: no
- API: no
- OpenAPI: no
- Validators/schemas: no
- Reports: browser Findings rendering only
- Fixtures/docs: no
- Handoff policy: followed
