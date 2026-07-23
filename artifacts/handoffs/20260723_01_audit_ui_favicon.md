# Audit UI favicon

- Task or prompt: move the supplied `logo.svg` to the frontend asset location and use it as the audit UI favicon.
- Commit: `680368e` (`feat: serve audit UI favicon`).
- Files changed: `src/api/assets/logo.svg`, `src/api/auditUi.ts`, `src/api/routes.ts`, `package.json`, and `test/api.test.ts`.
- Commands/tests run: `npm test -- --run test/api.test.ts`, `npm run build`, and `git diff --check`.
- Generated artifacts intentionally not committed: `dist/api/assets/logo.svg` is created by the build and remains uncommitted.
- Known caveats: the logo is served by the audit UI API route; the Stoplight API documentation page remains unchanged.
- Follow-up backlog items: none.
- CLI changed: no. API changed: added the static SVG asset route. OpenAPI changed: no. Validators, schemas, reports, fixtures, and docs changed: no. Handoff policy changed: no.

## Generated Result Paths

- `dist/api/assets/logo.svg` — intentionally uncommitted build output containing the favicon asset copied for the compiled API server.
- `artifacts/handoffs/20260723_01_audit_ui_favicon.md` — intentionally uncommitted task handoff note.
