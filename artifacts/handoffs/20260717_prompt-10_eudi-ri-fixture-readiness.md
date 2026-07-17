# Prompt 10 — EUDI RI TLP Fixture-Readiness Assessment Handoff

## Task / Prompt Name

Prompt 10 — EUDI RI TLP fixture-readiness assessment.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `src/eudi/fixtureReadiness.ts`
- `src/audit.ts`
- `src/types.ts`
- `src/cli.ts`
- `src/report/jsonReport.ts`
- `src/report/markdownReport.ts`
- `openapi/we-build-tl-audit.openapi.yaml`
- `scripts/optional/eudi-ri-tlp-fixture-readiness.sh`
- `package.json`
- `test/fixtureReadiness.test.ts`
- `test/report.test.ts`
- `test/api.test.ts`
- `README.md`
- `artifacts/handoffs/20260717_prompt-10_eudi-ri-fixture-readiness.md`

## Commands / Tests Run

- `npm test`
- `npm run build`
- `bash -n scripts/optional/eudi-ri-tlp-fixture-readiness.sh`
- `node dist/cli.js --help` (verified `--rpac-chain`)
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/`: TypeScript build output.
- `artifacts/reference-smoke/eudi-ri-tlp/`: manual live EUDI RI readiness output; not generated during this task.

## Known Caveats

- Fixture readiness is evidence-based and does not prove wallet behavior or production trust.
- Candidate trust anchors are parseable pointer certificate material; policy selection and full TL/LoTE anchor semantics remain future work.
- The manual EUDI RI smoke script may encounter a hosted landing page or source/profile incompatibility; it records the normal audit evidence and does not make tests depend on the live service.
- Revocation remains `not_checked` through the underlying RPAC-chain assessment.

## Follow-up Backlog Items

- Add FCAF `trusted_authorities` scenario mapping in the next dedicated prompt.
- Define policy-specific extraction of Access CA anchors from supported TL/LoTE artifact profiles.
- Add API RPAC-chain input only with a dedicated endpoint and OpenAPI request schema.

## Change Matrix

- CLI changed: yes, optional `--rpac-chain <path>` support
- API changed: report response/request schema now includes `fixtureReadiness`
- OpenAPI changed: yes
- Validators changed: yes, fixture prerequisite and optional RPAC-chain readiness assessment
- Schemas changed: yes, fixture-readiness report section
- Reports changed: yes, JSON section and Markdown wallet-fixture answer
- Fixtures changed: no
- Documentation changed: yes

## Generated Result Paths

- `dist/` (not committed): TypeScript build output produced by `npm run build`.
- `artifacts/reference-smoke/eudi-ri-tlp/` (not committed): manual EUDI RI fixture-readiness audit reports and evidence produced by `npm run eudi-ri-tlp-fixture-readiness`.
