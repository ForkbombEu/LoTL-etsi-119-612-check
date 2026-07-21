# TS119602-01 result isolation

## Task

Review `TODO.md`, divide the ETSI TS 119 602 backlog into executable tasks,
and implement the first task.

## Commit

Pending at handoff creation; this note is committed with the implementation.

## Files changed

- `TODO.md`, `README.md`
- `src/types.ts`, `src/standards/assessment.ts`, `src/audit.ts`, `src/cli.ts`
- `src/json/loteChecks.ts`, `src/xml/loteMetadata.ts`
- `src/report/jsonReport.ts`, `src/report/markdownReport.ts`
- `src/eudi/fixtureReadiness.ts`
- `openapi/we-build-tl-audit.openapi.yaml`
- Assessment, LoTE, report, API, fixture-readiness, and helper tests under `test/`
- This handoff note

## Commands/tests run

- `npm run build`
- `npm test` — 19 test files, 77 tests passed
- `git diff --check`

## Generated Result Paths

- None. No audit reports, fetched evidence, archives, or other generated
  result artifacts were created for this task.

## Generated artifacts intentionally not committed

- None created.

## Known caveats

- Official v1.1.1 JSON/XML schema validation, the official JSON entity shape,
  all three Annex A binding routes, full clause 6 semantics, JAdES/XAdES, and
  Annex D-I profile validation remain pending.
- The deprecated JSON-check option and environment setting remain accepted for
  compatibility but no longer disable deterministic local checks.
- A JSON `signature` property remains visible as extracted compatibility
  evidence but is not accepted as JAdES signature proof.

## Follow-up backlog

- TS602-02: create the normative requirements ledger with stable check IDs,
  applicability, severity, and clause/table/profile citations.
- Continue with TS602-03 through TS602-12 in the dependency order documented
  in `TODO.md`.

## Surface changes

- CLI: changed (deprecated option help and unconditional local JSON checks)
- API: changed (report schema v3 response shape)
- OpenAPI: changed
- Validators: changed (standard-specific verdict builder)
- Schemas: changed (report contract and OpenAPI schemas)
- Reports: changed (separate TS 119 602 assessment and summary)
- Fixtures: unchanged
- Docs: changed
- Handoff policy: followed; policy itself unchanged
