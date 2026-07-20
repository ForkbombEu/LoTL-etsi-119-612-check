# Standards LoTE qualifier parsing

## Task

Remove non-standard pointer-level `LoTEType` and `MimeType` parsing. Read both values exclusively from `LoTEQualifiers` in accordance with ETSI TS 119 602 clause 6.3.13.

## Commit

Pending at handoff creation.

## Files Changed

- `src/lotl.ts`
- `test/fixtures/lotl.json`
- `test/fixtures/we-build-lotl-profile.json`
- `test/lotl.test.ts`
- `test/weBuild.test.ts`
- `test/report.test.ts`

## Commands and Tests

- `npm test`
- `npm run build`
- `git diff --check`

## Generated Result Paths

- `artifacts/handoffs/20260720_01_standards_lote_qualifiers.md` — committed handoff for this change.

## Generated Artifacts Not Committed

- None.

## Known Caveats

- A pointer without `LoTEQualifiers` now has no declared type or MIME type, as required by the selected standards-only parsing policy.
- Existing WE BUILD generic/QEAA fallback behaviour based on detected ETSI XML remains unchanged.

## Follow-up Backlog

- Consider reporting `not_checked` checks separately from warnings in Markdown output.

## Change Scope

- CLI/API parsing, validators, reports, fixtures, and handoff policy changed through parser output and test fixtures.
- OpenAPI and durable documentation unchanged.
