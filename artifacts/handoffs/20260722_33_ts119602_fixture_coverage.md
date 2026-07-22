# TS602-19 — Fixture and interpretation coverage

## Task

Add deterministic positive and focused negative fixture coverage for every TS
119 602 base/extension schema shape and every implemented ledger family, and
strengthen interpretation-registry regression coverage.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `README.md`
- `TODO.md`
- `src/json/ts119602JsonSchema.ts`
- `src/standards/ts119602Interpretations.ts`
- `test/ts119602ImplementedCoverage.test.ts`
- `test/ts119602Interpretations.test.ts`
- `test/ts119602JsonSchema.test.ts`
- `test/ts119602XmlSchemaFixtures.test.ts`
- `test/fixtures/ts119602-implemented-coverage.json`
- `test/fixtures/ts119602-interpretations-v1.1.1.json`
- `test/fixtures/ts119602-schema-json-*.json` (six fixtures)
- `test/fixtures/ts119602-schema-xml-*` (six instance fixtures and two
  explicitly labelled composition schemas)
- `artifacts/handoffs/20260722_33_ts119602_fixture_coverage.md`

## Commands and Tests Run

- `pnpm run build` — passed.
- `pnpm test` — passed: 46 files, 269 tests.
- Six explicit `xmllint --nonet --schema ...` positive/negative fixture checks
  — each positive passed and each focused negative failed as expected.
- Direct `xmllint` compilation checks for the pinned SIE/TIE XSDs — both
  retained the expected missing-base-import parser error.
- `git diff --check` — passed.

## Implementation Notes

- The JSON validator can now select the base, service-information-extension,
  or trusted-entity-information-extension definition while retaining pinned
  source identity and offline reference resolution.
- Dedicated positive and focused negative JSON/XML instances cover all six
  published schema entrypoint roles.
- A coverage manifest maps exactly all 39 implemented TS 119 602 ledger
  families to live tests and deterministic positive/negative fixture sets.
- A versioned fixture pins the complete interpretation registry, including
  IDs, resolution status, and source citations.
- The roadmap now advances TS602-20 as the next cross-standard task.

## Known Caveats

- The published SIE and TIE XSDs reference LoTE base types without importing
  the base namespace and therefore cannot compile standalone. The pinned files
  remain unchanged. Test-only composition schemas reproduce the published
  declarations with an explicit import solely to validate instance shape; they
  are not reported as official schema success.
- XML fixture tests run when `xmllint` is available; the project declares it in
  Mise. Product validation continues to return an explicit unsupported result
  when the executable is absent.
- The 42 partial ledger families remain partial, so complete TS 119 602
  conformance is still disabled.

## Follow-up Backlog

- TS602-20: synchronize product surfaces, add bounded manual live-smoke
  procedures, emit the 81-family coverage audit, and make complete-verdict
  eligibility depend on every applicable family being implemented and
  conclusive.

## Surface Changes

- CLI: unchanged.
- API/OpenAPI: unchanged.
- Validators: JSON library validation now supports explicit base/SIE/TIE
  targets; runtime LoTE assessment continues to select the base binding.
- Schemas: pinned ETSI bytes and manifest are unchanged; test-only XML
  compositions were added.
- Reports: unchanged.
- Fixtures: changed; sixteen deterministic coverage/regression fixtures and
  manifests were added.
- Docs: changed; README and TODO coverage/limitations were reconciled.
- Handoff policy: followed.

## Generated Result Paths

- `artifacts/handoffs/20260722_33_ts119602_fixture_coverage.md` — committed;
  this task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used
  only for local verification.

No live fetched LoTEs, generated reports, private keys, or review packages were
retained.
