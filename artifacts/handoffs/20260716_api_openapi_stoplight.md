# API, OpenAPI, and Stoplight Handoff

## Task Name

Implement POST APIs and Stoplight/OpenAPI documentation for `we-build-tl-audit`.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `.gitignore`
- `README.md`
- `package.json`
- `package-lock.json`
- `openapi/we-build-tl-audit.openapi.yaml`
- `src/audit.ts`
- `src/types.ts`
- `src/api/docs.ts`
- `src/api/openapi.ts`
- `src/api/routes.ts`
- `src/api/schemas.ts`
- `src/api/server.ts`
- `test/api.test.ts`

## Commands / Tests Run

- `npm install fastify @fastify/cors yaml`
- `npm install -D tsx`
- `npm run build`
- `npm test`
- `npm run api`
- `curl -s http://127.0.0.1:3000/healthz`
- `curl -s http://127.0.0.1:3000/openapi.yaml`
- `curl -s http://127.0.0.1:3000/openapi.json`
- `curl -s http://127.0.0.1:3000/docs`
- Local POST smoke for `/api/v1/lotl/parse`
- Local POST smoke for `/api/v1/audit/json`
- Local POST smoke for `/api/v1/artifact/assess-url`
- Local POST smoke for `/api/v1/report/markdown`
- Live URL smoke for `/api/v1/audit/url` with `fetch:false` for referenced artifacts

## Generated Artifacts Intentionally Not Committed

- `dist/`: build output from `npm run build`
- `/tmp/openapi-smoke.yaml`: temporary smoke output
- `/tmp/openapi-smoke.json`: temporary smoke output
- `/tmp/docs-smoke.html`: temporary smoke output

## Known Caveats

- Stoplight Elements is loaded from the unpkg CDN in `src/api/docs.ts`; OpenAPI specs are served locally. Fully offline docs would require vendoring Stoplight assets.
- API routes currently do not accept XSD upload/path for schema validation. CLI still supports `--xsd`.
- `/api/v1/audit/url` depends on network availability for loading the top-level LoTL URL. Referenced artifact fetch failures are represented inside the audit report.
- XMLDSig/XAdES checks remain best-effort and report unsupported cases as `not_checked` or `failed`.
- CLI persistence currently uses the shared in-memory audit path and then persists fetched artifacts for CLI output only; API requests do not persist fetched artifacts.

## Follow-up Backlog Items

- Add optional API support for local/server-managed XSD schema validation.
- Consider vendoring Stoplight Elements for offline documentation deployments.
- Add optional manual live-network test script outside `npm test`.
- Avoid double fetches during CLI artifact persistence by carrying fetched bytes through a bounded evidence cache.

## Change Matrix

- API changed: yes
- OpenAPI changed: yes
- Stoplight docs changed: yes
- Tests changed: yes
- CLI changed: yes, refactored through shared in-memory core while preserving CLI behavior
- Report schema changed: yes, `input.kind` now includes `json` for API request-body audits
- README changed: yes
- Validators/schemas changed: yes
- Fixtures changed: no

## Generated Result Paths

- `dist/` (not committed): TypeScript build output.
- `/tmp/openapi-smoke.yaml` (not committed): temporary OpenAPI YAML smoke response.
- `/tmp/openapi-smoke.json` (not committed): temporary OpenAPI JSON smoke response.
- `/tmp/docs-smoke.html` (not committed): temporary docs HTML smoke response.
