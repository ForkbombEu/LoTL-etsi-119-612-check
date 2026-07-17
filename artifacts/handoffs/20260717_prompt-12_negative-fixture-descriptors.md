# Prompt 12 — Negative fixture descriptors

- Commit: pending at handoff creation.
- Files changed: deterministic descriptor generator, audit/report/CLI integration, report types, OpenAPI contract, tests, and README.
- Commands/tests run: `npm test`, `npm run build`, `git diff --check`.
- Generated artifacts intentionally not committed: none. The descriptor writer targets ignored `artifacts/generated-fixtures/` only when the CLI receives `--generate-negative-fixtures`.
- Scope: core audit report, CLI, Markdown/JSON rendering, OpenAPI, validators/tests, and documentation changed.
- Known caveats: descriptors specify test-owned configuration or copies; they do not generate wallet tests, issue presentation requests, or alter fetched artifacts.
- Follow-up backlog: Prompt 13 can expose the expanded report model through dedicated API endpoints.
