# Joint TS 119 612 / TS 119 602 TODO roadmap

## Task

Reconcile `TODO.md` with the current implementation and tests, documenting completed work and a dependency-ordered remaining task sequence for both ETSI TS 119 612 and ETSI TS 119 602.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `TODO.md`
- `artifacts/handoffs/20260722_15_joint_todo_roadmap.md`

## Commands and Tests Run

- `npm run build` — passed.
- `npm test` — passed: 31 files, 170 tests.
- `git diff --check` — passed.
- Roadmap heading/task-ID inventory with `rg` — passed.

## Implementation Notes

- Replaced the TS 119 602-only gap report with a joint roadmap that defines status terminology and the standard boundary.
- Recorded five existing TS 119 612 baseline slices without implying complete normative coverage.
- Added twelve dependency-ordered TS 119 612 tasks. TS612-01, the normative requirements ledger and verdict coverage gate, is the next recommended task.
- Retained the thirteen completed TS 119 602 task slices and reconciled their bounded scope with the current 81-family ledger totals: 19 implemented, 61 partial and 1 not implemented.
- Added TS602-14 through TS602-20 for alternative-binding mapping, remaining local semantics, identity/trust, contextual validation, fixtures and final coverage audit.
- Made TS602-14 explicitly dependent on reliable TS 119 612 facts through TS612-06.
- Added a cross-standard execution order and shared completion gates for schemas, semantics, signatures, certificates, trust, context, reports and fixtures.

## Known Caveats

- The exact normative TS 119 612 version/profile source set and requirement inventory have not yet been established; this is intentionally TS612-01 rather than an undocumented assumption in this roadmap.
- Completed rows describe bounded implementation tasks, not full ETSI, EUDI, WE BUILD or legal conformance.
- Test counts are a dated reconciliation snapshot and will change as the roadmap is implemented.

## Follow-up Backlog

- Start TS612-01: establish the TS 119 612 source set and requirements ledger, then gate optimistic verdicts on coverage.
- Continue TS602-15 independently where it does not depend on the TS 119 612 alternative binding.

## Surface Changes

- TODO/roadmap documentation: changed.
- CLI, API, OpenAPI, validators, schemas, reports, fixtures and runtime behavior: unchanged.
- Handoff policy: followed.

## Generated Result Paths

- `artifacts/handoffs/20260722_15_joint_todo_roadmap.md` — committed; concise task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used only for verification.

No audit reports, live fetched artifacts, schema downloads or review archives were generated.
