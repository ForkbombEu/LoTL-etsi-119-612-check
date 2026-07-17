# Prompt 08 — WE BUILD Profile Checks Handoff

## Task / Prompt Name

Prompt 08 — WE BUILD profile checks.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `src/profiles/weBuild.ts`
- `src/types.ts`
- `src/audit.ts`
- `src/report/jsonReport.ts`
- `src/report/markdownReport.ts`
- `openapi/we-build-tl-audit.openapi.yaml`
- `test/weBuild.test.ts`
- `test/fixtures/we-build-lotl-profile.json`
- `test/report.test.ts`
- `test/api.test.ts`
- `README.md`
- `artifacts/handoffs/20260717_prompt-08_we-build-profile-checks.md`

## Commands / Tests Run

- `npm test`
- `npm run build`
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/`: TypeScript build output.

## Known Caveats

- WE BUILD recognition is limited to the canonical LoTL type URI and explicit WE BUILD WP4 scheme/operator metadata.
- Role/list-type classification is a finite implemented mapping and returns `unknown` for unrecognized types.
- Pointer certificate checks parse available embedded material and report assessment-time validity, but do not establish a certificate chain or trust decision.
- WE BUILD findings are profile evidence and do not alter ETSI TS 119 612 conformance levels.

## Follow-up Backlog Items

- Add additional WE BUILD aliases only when backed by stable profile documentation or fixtures.
- Add EUDI trust roles and certificate-chain validation in the dedicated role/chain prompt.
- Consider richer per-role report presentation when more than one profile is supported.

## Change Matrix

- CLI changed: no
- API changed: report schema now includes `weBuildProfile` summary
- OpenAPI changed: yes
- Validators changed: yes, WE BUILD recognition, list classification, and pointer consistency evidence
- Schemas changed: yes, report-level WE BUILD profile summary
- Reports changed: yes, JSON summary and Markdown WE BUILD profile section
- Fixtures changed: yes, reduced deterministic WE BUILD LoTL fixture
- Documentation changed: yes

## Generated Result Paths

- `dist/` (not committed): TypeScript build output produced by `npm run build`.
