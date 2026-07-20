# TS 119 602 XML binding paths

## Task

Validate the ETSI TS 119 602 V1.1.1 scheme-explicit XML path
`ListOfTrustedEntities/TrustedEntitiesList/TrustedEntity`, while continuing to
extract the WE BUILD compatibility path
`TrustedEntitiesList/TrustedEntitiesList/TrustedEntity` with a non-conformance
warning.

## Commit

Pending at handoff creation.

## Files Changed

- `README.md`
- `src/detect.ts`
- `src/xml/loteMetadata.ts`
- `test/detect.test.ts`
- `test/xmlLoteMetadata.test.ts`

## Commands and Tests

- `npm test -- --run test/detect.test.ts test/xmlLoteMetadata.test.ts`
- `npm test` — 18 test files and 70 tests passed
- `npm run build`
- `git diff --check`
- Read-only inspection of the ETSI TS 119 602 V1.1.1 specification and the
  EUDI library's bundled copy of `1960201_xsd_schema.xsd`
- Manual audit smoke against a local copy of
  `https://trustlist.nxd.foundation/trust-lists/NXD-TL-EAA.xml` — compatibility
  binding warning emitted and 3 trusted entities counted

## Generated Result Paths

- `artifacts/handoffs/20260720_06_ts119602_xml_binding_paths.md` — committed
  handoff for this change.

## Generated Artifacts Not Committed

- None.

## Known Caveats

- `xml_lote.structure.xml_binding` validates the selected XML binding and
  namespace path; it is not a claim of complete ETSI TS 119 602 conformance.
- No normative ETSI version or published WE BUILD profile defining the
  double-`TrustedEntitiesList` root was identified. The report therefore marks
  its historical version as `not_established` instead of calling it an old
  version.
- The final ETSI XML schema makes the inner `TrustedEntitiesList` optional when
  no trusted entity is or was approved. Its absence is reported separately
  from a wrong-namespace or wrong-path entity list.

## Follow-up Backlog

- Add full XSD validation against a curated, offline TS 119 602 schema bundle
  if complete syntax validation is selected as a future assessment scope.
- Replace the WE BUILD compatibility label if WE BUILD publishes a normative
  profile or migration note for the alternative root.

## Change Scope

- Artifact detection, XML LoTE structure/service validation, extracted report
  evidence, fixtures/tests, README documentation, and handoff policy output
  changed.
- CLI and API behavior change through their shared core assessor.
- OpenAPI, schemas, and standalone API routes were not changed.
