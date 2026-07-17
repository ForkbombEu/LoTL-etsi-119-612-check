# Prompt 05 — Optional XSD Validation with Local Schema and xmllint Fallback Handoff

## Task / Prompt Name

Prompt 05 — Optional XSD validation with local schema and xmllint fallback.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `src/xml/xsd.ts`
- `test/xsd.test.ts`
- `test/fixtures/minimal-tsl.xsd`
- `test/report.test.ts`
- `README.md`
- `artifacts/handoffs/20260717_prompt-05_optional-xsd-validation.md`

## Commands / Tests Run

- `npm test`
- `npm run build`
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/`: TypeScript build output.

## Known Caveats

- XSD validation relies on a caller-supplied local schema and `xmllint`; no schema is downloaded.
- The API does not accept an XSD path/upload, so this explicit option remains CLI/core-function scoped.
- The test XSD is only an accessible local test input for mocked command execution; it is not a complete ETSI schema.

## Follow-up Backlog Items

- Add an explicit API policy/contract if server-side XSD paths or uploaded schemas are ever required.
- Consider configurable `xmllint` executable location only if deployment environments cannot provide it on `PATH`.
- Continue XML signature evidence work in its dedicated prompt.

## Change Matrix

- CLI changed: existing `--xsd` behavior documented; option unchanged
- API changed: no
- OpenAPI changed: no
- Validators changed: yes, XSD runner is injectable and temporary XML files are cleaned up
- Schemas changed: no
- Reports changed: existing JSON/Markdown XSD finding is now covered by tests
- Fixtures changed: yes, local mock-validation XSD fixture
- Documentation changed: yes

## Generated Result Paths

- `dist/` (not committed): TypeScript build output produced by `npm run build`.
