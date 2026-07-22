# TS612-01 — Requirements ledger and coverage gate

## Task

Establish the supported ETSI TS 119 612 source/version scope, create a cited requirements ledger with stable IDs and implementation coverage, and prevent incomplete assessment coverage from producing a conformant verdict.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `README.md`
- `TODO.md`
- `src/standards/ts119612Requirements.ts`
- `src/xml/ts119612Checks.ts`
- `test/ts119612Checks.test.ts`
- `test/ts119612Requirements.test.ts`
- `artifacts/handoffs/20260722_16_ts119612_requirements_ledger.md`

## Commands and Tests Run

- `npm run build` — passed.
- `npm test -- --run test/ts119612Requirements.test.ts test/ts119612Checks.test.ts test/report.test.ts test/api.test.ts` — passed: 4 files, 26 tests.
- `npm test` — passed: 32 files, 175 tests.
- `git diff --check` — passed.
- Reviewed the official ETSI TS 119 612 V2.4.1 document and ETSI publication directory for version, publication date, namespace, TL format version and normative clause/annex scope.

## Implementation Notes

- Selected ETSI TS 119 612 V2.4.1 (2025-08), TL format version 6 and `http://uri.etsi.org/02231/v2#` as the normative implementation target.
- Kept `http://uri.etsi.org/19612/v2.4.1#` as an observed EUDI RI compatibility input with `normativeStatus: not_established`; it is accepted with a warning and cannot support complete conformance.
- Added 68 coherent requirement families across clauses 4-6 and normative Annexes B-E/J, each with stable `ts119612.*` ID, category, level, severity, artifact applicability, evidence scope, citations and implementation mapping.
- Coverage summary is 1 implemented, 30 partial and 37 not implemented; the ledger is an inventory, not a conformance claim.
- Added `ts119612.binding.supported` to select the normative binding from namespace plus `TSLVersionIdentifier` evidence.
- Added `ts119612.coverage.complete` to every applicable parsed assessment and hard-gated the verdict so incomplete coverage cannot return `conformant`.
- Concrete structural/signature failures retain their existing partial/non-conformant behavior rather than being hidden by the coverage gate.
- Report schema version remains 4 because the new evidence uses the existing `CheckResult` contract.

## Known Caveats

- Only the scheme-version requirement family is currently recorded as fully implemented; most existing checks are intentionally partial.
- The official V2.4.1 schema bundle is not pinned yet. TS 119 612 XSD validation still requires the optional CLI `--xsd` path.
- The compatibility namespace is observed in EUDI RI fixtures but has not been identified as the V2.4.1 normative namespace in the ETSI document.
- Signer chain/revocation trust, complete XAdES-B-B constraints, semantic vocabularies, exact nesting and contextual operations remain sequenced backlog work.

## Follow-up Backlog

- TS612-02: pin the official V2.4.1 XSD/extension bundle, dependencies, license, provenance, hashes and offline catalog.
- TS612-03: route canonical V2.4.1 XML through that pinned bundle automatically.

## Surface Changes

- CLI/API core assessment behavior: changed through the shared TS 119 612 assessor; no request shape changed.
- OpenAPI: unchanged; the existing finding/result schemas already represent the new evidence.
- Validators: verdict coverage gating and binding selection changed.
- Schemas: no report/request or pinned XSD schema changed.
- Reports: changed; TS 119 612 results contain binding and coverage findings.
- Fixtures: unchanged; existing deterministic XML fixtures cover canonical, compatibility and mismatched-version routes.
- Docs/TODO: source scope, coverage totals and TS612-01/02 status updated.
- Handoff policy: followed.

## Generated Result Paths

- `artifacts/handoffs/20260722_16_ts119612_requirements_ledger.md` — committed; concise task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used only for verification.

No audit reports, live fetched artifacts, standards PDFs, schema downloads or review archives were retained.
