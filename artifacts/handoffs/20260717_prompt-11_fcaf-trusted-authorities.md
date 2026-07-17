# Prompt 11 — FCAF `trusted_authorities` test-fixture mapping

- Commit: pending at handoff creation.
- Files changed: `src/fcaf/trustedAuthorities.ts`, report types/builders/rendering, audit integration, OpenAPI contract, FCAF tests, report/API tests, and README.
- Commands/tests run: `npm test`, `npm run build`, `git diff --check`.
- Generated artifacts intentionally not committed: none.
- Scope: CLI/core audit report, report schema, Markdown, OpenAPI, fixtures/tests, and documentation changed; API behavior inherits the report field through existing core reuse.
- Known caveats: this maps audited evidence to fixture potential only. It does not issue presentation requests, mutate artifacts, or make a verifier trust decision. Invalid-signature readiness requires a signed XML source fixture but does not generate a modified artifact.
- Follow-up backlog: Prompt 12 can use this matrix as input for deterministic negative-fixture descriptors.
