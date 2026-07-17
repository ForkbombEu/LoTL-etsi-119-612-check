# XML LoTE metadata routing

## Task

Recognize ETSI TS 119 602 XML `TrustedEntitiesList` artifacts and route them to XML metadata extraction, without adding `SchemeOperatorAddress` extraction yet.

## Commit

Pending at handoff creation; committed with this task.

## Files Changed

- `src/detect.ts`
- `src/xml/loteMetadata.ts`
- `src/audit.ts`
- `src/types.ts`
- `src/eudi/fixtureReadiness.ts`
- `src/fcaf/trustedAuthorities.ts`
- `src/fixtures/negativeDescriptors.ts`
- `openapi/we-build-tl-audit.openapi.yaml`
- `test/detect.test.ts`
- `test/xmlLoteMetadata.test.ts`

## Commands and Tests Run

- `npm test -- --run test/detect.test.ts test/xmlLoteMetadata.test.ts`
- `npm run build`
- `npm test`
- `git diff --check`

## Generated Result Paths

- None. No generated audit results were created.

## Known Caveats

- The route extracts common `ListAndSchemeInformation` metadata only. It does not perform full ETSI TS 119 602 XML profile or XMLDSig assessment.
- `SchemeOperatorAddress` is intentionally not extracted in this change.
- TS 119 612 remains `not_applicable` for XML LoTE artifacts.

## Follow-up Backlog

- Add typed `SchemeOperatorAddress` extraction and dedicated ETSI TS 119 602 XML structural/signature checks.

## Change Surface

- CLI and API: XML LoTE responses now include extracted metadata.
- OpenAPI: `xml_lote` artifact kind documented.
- Validators, schemas, reports, fixtures, docs: no schema/report format change; tests added.
- Handoff policy: fulfilled.
