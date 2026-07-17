# Prompt 13 — API/OpenAPI update for expanded assessment model

- Commit: pending at handoff creation.
- Files changed: API routes/schemas, raw artifact core assessor, OpenAPI contract, API tests, and README.
- Commands/tests run: `npm test`, `npm run build`, `git diff --check`.
- Generated artifacts intentionally not committed: none.
- Scope: CLI was not changed; API and OpenAPI now expose POST endpoints for LoTL audit, raw artifact assessment, certificate-chain assessment, fixture readiness, and Markdown rendering. Existing versioned endpoints remain compatible.
- Known caveats: Stoplight Elements is served locally as HTML but uses the existing public CDN assets; raw artifact assessment accepts content in JSON rather than multipart uploads.
- Follow-up backlog: Prompt 14 can document the EUDI trust model and end-to-end Credimi/reference-wallet workflow.
