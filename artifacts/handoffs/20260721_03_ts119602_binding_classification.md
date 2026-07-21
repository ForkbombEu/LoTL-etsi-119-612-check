# TS602-03 binding and profile classification

## Task

Continue the `TODO.md` roadmap with TS602-03: classify the TS 119 602 data
model, all three Annex A bindings, and Annex D-I profiles independently while
guarding TS 119 612 alternative-binding applicability.

## Commit

Pending at handoff creation; this note is committed with the implementation.

## Files changed

- `src/standards/ts119602Classification.ts`
- `src/standards/ts119602Requirements.ts`
- `src/types.ts`, `src/audit.ts`
- `src/report/jsonReport.ts`, `src/report/markdownReport.ts`
- `openapi/we-build-tl-audit.openapi.yaml`
- `test/ts119602Classification.test.ts`
- Report, API, requirements-ledger, and helper fixture tests under `test/`
- `README.md`, `TODO.md`
- This handoff note

## Commands/tests run

- `npm run build`
- `npm test` — 21 test files, 92 tests passed
- `git diff --check`

## Generated Result Paths

- None. No audit reports, fetched evidence, archives, or other generated
  result artifacts were created for this task.

## Generated artifacts intentionally not committed

- None created.

## Known caveats

- Selected TS 119 612 alternative bindings remain `not_checked`; Table A.1
  component mapping and relevant profile validation are not implemented yet.
- Scheme-explicit JSON binding selection uses deterministic wrapper/array
  discriminators. Official JSON Schema validation remains TS602-04/TS602-05.
- Only exact registered Annex D-I LoTE type URIs select a profile. A declared
  pointer type cannot select a profile without matching embedded evidence.
- Report schema changed from v3 to v4 by adding required
  `results[].ts119602Classification`.

## Follow-up backlog

- TS602-04: pin official v1.1.1 JSON/XSD schemas, dependencies, hashes,
  provenance, license, and offline resolvers.
- TS602-05: validate the official JSON model and isolate compatibility input.

## Surface changes

- CLI: changed (JSON report contract and classification behavior)
- API: changed (report schema v4 response shape)
- OpenAPI: changed
- Validators: changed (binding/profile classification and guarded routing)
- Schemas: changed (report/OpenAPI contract v4)
- Reports: changed (classification fields and Markdown rendering)
- Fixtures: unchanged
- Docs: changed
- Handoff policy: followed; policy itself unchanged
