# Footer logo and sticky layout

- Task: Use the favicon logo in the footer, restore the Forkbomb BV link, and keep the footer at the bottom of short pages.
- Commit: pending (this handoff is written before the task commit).

## Files Changed

- `src/api/auditUi.ts` — uses the served favicon SVG in the footer, adds the Forkbomb BV and GitHub links, and makes the page a viewport-height flex layout.

## Commands and Tests Run

- `pnpm test -- --runInBand`
- `pnpm run build`
- `git diff --check`

## Generated Result Paths

- `dist/` — intentionally uncommitted build output produced by `pnpm run build`.

## Known Caveats

- The footer stays at the viewport bottom only when page content is shorter than the viewport; longer content keeps it after the page content as expected.

## Follow-up Backlog

- None.

## Scope Changed

- CLI: no
- API: no
- OpenAPI: no
- Validators/schemas: no
- Reports: browser UI footer and page layout only
- Fixtures/docs: no
- Handoff policy: followed
