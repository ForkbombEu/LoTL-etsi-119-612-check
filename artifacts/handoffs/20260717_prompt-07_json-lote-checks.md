# Prompt 07 — JSON LoTE / TS 119 602-Style Assessment Skeleton Handoff

## Task / Prompt Name

Prompt 07 — JSON LoTE / TS 119 602-style assessment skeleton.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `src/json/loteChecks.ts`
- `test/loteChecks.test.ts`
- `test/fixtures/json-lote.json`
- `test/fixtures/json-lote-missing-list-information.json`
- `test/fixtures/json-lote-missing-signature.json`
- `test/fixtures/json-lote-expired.json`
- `test/report.test.ts`
- `README.md`
- `artifacts/handoffs/20260717_prompt-07_json-lote-checks.md`

## Commands / Tests Run

- `npm test`
- `npm run build`
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/`: TypeScript build output.

## Known Caveats

- JSON LoTE checks are explicitly described as TS 119 602-style / JSON LoTE evidence checks; they do not claim full normative TS 119 602 conformance.
- The checks remain enabled through the existing `--include-json-lote-checks` CLI/API option.
- JSON LoTE artifacts remain `not_applicable` for ETSI TS 119 612 XML; their structured JSON findings are carried alongside that outcome.

## Follow-up Backlog Items

- Add explicit WE BUILD WP4 profile checks and known LoTE type classifications in the dedicated profile prompt.
- Add richer JSON signature validation only when a concrete JSON signature profile is selected.
- Add type-specific JSON LoTE rules only with documented profile evidence.

## Change Matrix

- CLI changed: existing JSON-LoTE option behavior documented; option unchanged
- API changed: no
- OpenAPI changed: no
- Validators changed: yes, expanded JSON LoTE metadata/date/pointer/signature checks
- Schemas changed: no
- Reports changed: yes, structured JSON LoTE checks are rendered in existing JSON/Markdown check output
- Fixtures changed: yes
- Documentation changed: yes

## Generated Result Paths

- `dist/` (not committed): TypeScript build output produced by `npm run build`.
