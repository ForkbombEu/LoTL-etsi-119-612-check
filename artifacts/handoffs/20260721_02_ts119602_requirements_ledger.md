# TS602-02 requirements ledger

## Task

Continue the `TODO.md` roadmap with TS602-02: create a versioned ETSI TS
119 602 clause/table/profile requirements ledger with stable check IDs,
applicability, severity, and normative citations.

## Commit

Pending at handoff creation; this note is committed with the implementation.

## Files changed

- `src/standards/ts119602Requirements.ts`
- `src/json/loteChecks.ts`
- `src/xml/loteMetadata.ts`
- `test/ts119602Requirements.test.ts`
- `test/loteChecks.test.ts`
- `README.md`
- `TODO.md`
- This handoff note

## Commands/tests run

- Reviewed the official ETSI TS 119 602 V1.1.1 PDF through the official ETSI
  publication URL.
- `npm run build`
- `npm test` — 20 test files, 83 tests passed
- `git diff --check`

## Generated Result Paths

- None. No audit reports, fetched evidence, archives, or other generated
  result artifacts were created for this task.

## Generated artifacts intentionally not committed

- None created. A failed temporary `/tmp` download attempt produced no project
  artifact.

## Known caveats

- The 81 ledger entries are coherent requirement families; Annex D-I table
  rows are grouped into scheme, entity, service/history, and signature
  families rather than represented as implemented checks.
- The ledger records current coverage as partial or not implemented. It does
  not make any artifact conformant and is not itself a validator.
- The standards-interpretation registry and exact schema-path exceptions
  remain pending until the official schema bundle is pinned.

## Follow-up backlog

- TS602-03: classify the three Annex A bindings independently from data model
  and profile, including guarded TS 119 612 alternative-binding applicability.
- TS602-04: pin the official schema bundle and provenance before schema-path
  interpretation entries are finalized.

## Surface changes

- CLI: unchanged
- API: unchanged
- OpenAPI: unchanged
- Validators: changed (coverage evidence now comes from the requirements ledger)
- Schemas: unchanged
- Reports: changed (TS 119 602 completeness finding includes ledger coverage)
- Fixtures: unchanged
- Docs: changed
- Handoff policy: followed; policy itself unchanged
