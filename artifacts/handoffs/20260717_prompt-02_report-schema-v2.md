# Prompt 02 — Report Schema v2 with Explicit Artifact Classification Handoff

## Task / Prompt Name

Prompt 02 — Report schema v2 with explicit artifact classification.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `src/types.ts`
- `src/audit.ts`
- `src/detect.ts`
- `src/xml/ts119612Checks.ts`
- `src/report/jsonReport.ts`
- `src/report/markdownReport.ts`
- `openapi/we-build-tl-audit.openapi.yaml`
- `test/detect.test.ts`
- `test/report.test.ts`
- `test/api.test.ts`
- `README.md`
- `artifacts/handoffs/20260717_prompt-02_report-schema-v2.md`

## Commands / Tests Run

- `npm test`
- `npm run build`
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/`: TypeScript build output.

## Known Caveats

- Result IDs are deterministic for the same pointer position and source within a report. They are not cross-report permanent identifiers when pointer ordering changes.
- Applicability identifies whether an artifact class is in scope for a standard/profile; it does not claim successful profile conformance. EUDI trust-role applicability remains `unknown` until those checks are implemented.
- `location` and the existing TS 119 612 result fields remain for compatibility; v2 adds `source`, `id`, and `standardApplicability`.

## Follow-up Backlog Items

- Implement explicit JSON LoTE/LoTL TS 119 602 and WE BUILD profile checks behind the new applicability fields.
- Add EUDI trust-role classification and Access CA/RPAC assessment in its dedicated prompt.
- Consider a migration guide if external consumers rely on strict schema validation of report v1.

## Change Matrix

- CLI changed: output schema only; CLI options and workflow unchanged
- API changed: report response/request schema v2 fields documented in OpenAPI
- OpenAPI changed: yes
- Validators changed: XML dispatch now requires the TS 119 612 root name and namespace
- Schemas changed: yes, report schema v2
- Reports changed: yes, JSON fields and Markdown classification summary
- Fixtures changed: no
- Documentation changed: yes

## Generated Result Paths

- `dist/` (not committed): TypeScript build output produced by `npm run build`.
