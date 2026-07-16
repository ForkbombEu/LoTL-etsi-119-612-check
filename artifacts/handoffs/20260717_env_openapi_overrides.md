# Env Overrides and Dynamic OpenAPI Handoff

## Task Name

Fix HOST/PORT override behavior for Stoplight/OpenAPI and add `.env` runtime configuration.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `.env-example`
- `README.md`
- `package.json`
- `package-lock.json`
- `src/api/config.ts`
- `src/api/openapi.ts`
- `src/api/routes.ts`
- `src/api/schemas.ts`
- `src/api/server.ts`
- `test/api.test.ts`
- `artifacts/handoffs/20260717_env_openapi_overrides.md`

## Commands / Tests Run

- `npm install dotenv`
- `npm run build`
- `npm test`
- `HOST=0.0.0.0 PORT=8088 npm run api`
- Smoke `GET http://127.0.0.1:8088/healthz`
- Smoke `GET http://127.0.0.1:8088/openapi.json`, verified `servers[0].url` is `http://127.0.0.1:8088`
- Smoke `GET http://127.0.0.1:8088/docs`, verified docs point to `/openapi.yaml`
- Temporary `.env` smoke with `PORT=8090` and `AUDIT_FETCH=false`
- Smoke `POST /api/v1/audit/json` with options omitted, verified `.env` default prevented referenced fetches

## Generated Artifacts Intentionally Not Committed

- `dist/`: build output
- `node_modules/`: dependency install output
- temporary `.env`: created for smoke verification, then removed

## Known Caveats

- Stoplight Elements still loads from the unpkg CDN. Runtime OpenAPI is local and dynamically sets `servers[0].url`.
- `PUBLIC_BASE_URL` overrides request-origin detection. Use it behind reverse proxies or when docs are opened through a different public URL.
- `.env` is intentionally ignored; `.env-example` documents supported keys.
- Existing npm audit findings remain from dependency tree; no forced audit fix was applied.

## Follow-up Backlog Items

- Consider vendoring Stoplight assets for fully offline docs.
- Consider exposing current runtime config from a read-only diagnostics endpoint.
- Add reverse-proxy tests for `x-forwarded-proto` if deploying behind TLS termination.

## Change Matrix

- API changed: yes
- OpenAPI changed: yes, served spec now has dynamic server URL
- Stoplight docs changed: indirectly, Try-It now uses served spec origin
- Tests changed: yes
- CLI changed: no
- Report schema changed: no
- README changed: yes
- Validators/schemas changed: yes, defaults now read runtime config
- Fixtures changed: no

## Generated Result Paths

- `dist/` (not committed): TypeScript build output.
- temporary `.env` (removed): local smoke configuration.
