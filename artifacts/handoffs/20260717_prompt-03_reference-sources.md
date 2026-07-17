# Prompt 03 — First-Class EUDI RI TLP and WE BUILD Reference-Source Support Handoff

## Task / Prompt Name

Prompt 03 — First-class EUDI RI TLP and WE BUILD reference-source support.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `src/referenceSources.ts`
- `src/cli.ts`
- `scripts/optional/reference-source-smoke.sh`
- `test/referenceSources.test.ts`
- `package.json`
- `README.md`
- `artifacts/handoffs/20260717_prompt-03_reference-sources.md`

## Commands / Tests Run

- `npm test`
- `npm run build`
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/`: TypeScript build output.
- `artifacts/reference-smoke/<source-name>/`: optional/manual live smoke results; not run during this task.

## Known Caveats

- The smoke script intentionally performs live network activity only when explicitly run. It is not part of `npm test`.
- Named sources are reference inputs, not automatically trusted production roots.
- The EUDI RI endpoint is passed to the existing LoTL JSON input flow; any content/profile incompatibility is reported by the normal audit path.

## Follow-up Backlog Items

- Add profile-aware handling for EUDI RI hosted-service landing pages if the endpoint requires discovery before a LoTL JSON document can be assessed.
- Add named-source support to API input only when the API contract explicitly authorizes it.
- Add optional smoke result retention/metadata policy if manual reference checks become a release process.

## Change Matrix

- CLI changed: yes, `--reference-source <id>` resolves one of three named source URLs
- API changed: no
- OpenAPI changed: no
- Validators changed: no
- Schemas changed: no
- Reports changed: no
- Fixtures changed: no
- Tests changed: yes, deterministic reference-source resolution tests
- Documentation changed: yes

## Generated Result Paths

- `dist/` (not committed): TypeScript build output produced by `npm run build`.
- `artifacts/reference-smoke/<source-name>/` (not committed): optional live audit reports and fetched evidence produced by `npm run reference-smoke -- <source-name>`.
