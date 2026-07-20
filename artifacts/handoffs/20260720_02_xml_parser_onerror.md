# XML parser `onError` migration

## Task

Replace the deprecated `@xmldom/xmldom` parser option `errorHandler` with `onError` so the audit does not report the parser's configuration deprecation as an XML-document warning.

## Commit

Pending at handoff creation.

## Files Changed

- `src/xml/parse.ts`
- `test/ts119612Checks.test.ts`

## Commands and Tests

- `npm test`
- `npm run build`
- `git diff --check`

## Generated Result Paths

- `artifacts/handoffs/20260720_02_xml_parser_onerror.md` — committed handoff for this change.

## Generated Artifacts Not Committed

- None.

## Known Caveats

- Genuine XML parser warnings continue to be collected through `onError` and reported as parse evidence.

## Follow-up Backlog

- None.

## Change Scope

- XML parser configuration and XML validation regression coverage changed.
- CLI, API, OpenAPI, schemas, reports, fixtures, and docs unchanged.
