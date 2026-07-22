# TS612-11 — implemented-family fixture and product-surface coverage

## Task

Add deterministic positive and focused negative evidence for every implemented
TS 119 612 requirement family and synchronize CLI, API, OpenAPI, JSON and
Markdown compatibility checks.

## Commit

Pending at handoff creation.

## Files Changed

- `package.json`
- `src/report/markdownReport.ts`
- `src/standards/ts119612Requirements.ts`
- `openapi/we-build-tl-audit.openapi.yaml`
- `test/fixtures/ts119612-implemented-coverage.json`
- `test/fixtures/ts119612-schema-minimal.xml`
- `test/ts119612ImplementedCoverage.test.ts`
- `test/ts119612Context.test.ts`
- `test/ts119612Requirements.test.ts`
- `test/ts119612SchemeInformation.test.ts`
- `test/ts119612ServiceSemantics.test.ts`
- `test/ts119612TspServices.test.ts`
- `test/ts119612XmlSchema.test.ts`
- `test/report.test.ts`
- `test/api.test.ts`
- `README.md`
- `TODO.md`
- `docs/architecture.md`
- `artifacts/handoffs/20260722_27_ts119612_fixture_coverage.md`

## Implementation Summary

- Added a ledger-linked coverage manifest for all 15 TS 119 612 families whose
  implementation status is `implemented`.
- Added a contract test that rejects missing or duplicate family entries,
  stale fixture/test paths, mismatched finding IDs, and absent pass/fail
  assertions.
- Closed focused negative-case gaps for format version, distribution byte
  equality, empty service lists, current service names and historical service
  names; moved the reduced schema input into a deterministic fixture.
- Made standard-assessment Markdown render all stored findings, including
  `not_applicable`, with explicit status and severity.
- Added CLI report-file parity, exact API Markdown re-render parity and an
  executable OpenAPI report-example test.
- Kept report schema v5 and the existing 15/45/9 implemented/partial/not-
  implemented ledger split unchanged.

## Commands and Tests Run

- `npm run test:ts119612-coverage`
- `npm run build && npx vitest run test/ts119612ImplementedCoverage.test.ts test/ts119612SchemeInformation.test.ts test/ts119612TspServices.test.ts test/ts119612ServiceSemantics.test.ts test/ts119612Context.test.ts test/report.test.ts test/api.test.ts test/ts119612Requirements.test.ts test/ts119612XmlSchema.test.ts`
- `npm run build && npm test && npm run test:ts119612-coverage && git diff --check` — 43 test files and 232 tests passed; the focused coverage test also passed.

## Generated Artifacts Intentionally Not Committed

- `dist/` — ignored TypeScript build output.
- No fetched or live reference-service artifacts were generated.

## Known Caveats

- The manifest covers only the 15 ledger families currently marked
  `implemented`; partial, contextual and unsupported behavior remains explicit
  for the TS612-12 audit.
- Several negative inputs are deterministic mutations of small committed
  positive fixtures rather than separately duplicated XML files.
- Schema/signature command-runner tests mock external executable outcomes;
  real `xmllint` and `xmlsec1` availability remains environment-dependent.
- Markdown formatting now includes status as well as severity, but the JSON
  report contract remains schema v5.

## Follow-up Backlog

- TS612-12: audit all 69 ledger families, preserve unsupported/contextual
  outcomes, document optional bounded live smoke checks and gate a complete
  verdict on conclusive applicable results.
- TS602-15 through TS602-20 remain sequenced after the current TS 119 602
  baseline and cross-standard dependencies.

## Surface Changes

- CLI: no option changed; report-file compatibility is now tested exactly.
- API: Markdown re-rendering is tested for exact parity with audit output.
- OpenAPI: the report-render endpoint describes lossless finding rendering and
  its documented example is executed by tests.
- Validators: focused TS 119 612 negative coverage was added; normative scope
  was not expanded.
- Schemas: report schema v5 and pinned ETSI XSD bundles are unchanged.
- Reports: Markdown now includes every standard finding with status/severity.
- Fixtures: coverage manifest and reduced schema fixture added.
- Docs: README, TODO and architecture updated.
- Handoff policy: this handoff was created before the single task commit.

## Generated Result Paths

- `dist/` — intentionally uncommitted; ignored build output.
- `artifacts/handoffs/20260722_27_ts119612_fixture_coverage.md` — committed;
  task handoff and validation summary.
