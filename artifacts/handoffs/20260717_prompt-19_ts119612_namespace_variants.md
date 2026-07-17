# TS 119 612 namespace variants and XSD matching

## Task

Accept `http://uri.etsi.org/02231/v2#` as the canonical TS 119 612 namespace, recognize `http://uri.etsi.org/19612/v2.4.1#` as an observed EUDI RI/profile variant with a warning, and validate only against an XSD for the artifact's actual namespace.

## Commit

Pending at handoff creation; committed with this task.

## Files Changed

- `src/detect.ts`
- `src/xml/ts119612Checks.ts`
- `src/xml/xsd.ts`
- `test/detect.test.ts`
- `test/ts119612Checks.test.ts`
- `test/xsd.test.ts`
- `test/fixtures/minimal-tsl-canonical.xsd`

## Commands and Tests Run

- `npm test -- --run test/detect.test.ts test/ts119612Checks.test.ts test/xsd.test.ts`
- `npm run build`
- `npm test`
- `git diff --check`

## Generated Result Paths

- None. No generated audit results were created.

## Known Caveats

- XSD validation remains optional and requires a local `--xsd` path plus `xmllint`.
- A supplied XSD without a matching `targetNamespace` is not used; the `schema.xsd` result is `not_checked` with both namespaces in evidence.

## Follow-up Backlog

- Bundle or document curated canonical and EUDI-RI-variant XSD acquisition paths, including schema-import dependencies.

## Change Surface

- CLI and API: namespace recognition and schema-validation evidence changed through the shared XML assessor.
- OpenAPI, schemas, reports, fixtures, docs: fixture and tests added; response schema unchanged.
- Handoff policy: fulfilled.
