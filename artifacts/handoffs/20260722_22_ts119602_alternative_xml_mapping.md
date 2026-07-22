# TS602-14 — TS 119 612 alternative XML binding mapping

## Task

Implement ETSI TS 119 602 V1.1.1 Annex A.2.2/Table A.1 by consuming typed,
validated TS 119 612 facts, gating profile checks on the source schema/binding,
and avoiding a second ad hoc XML parse.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `src/xml/ts119612Facts.ts`
- `src/xml/ts119612Checks.ts`
- `src/standards/ts119602AlternativeXml.ts`
- `src/standards/ts119602Interpretations.ts`
- `src/standards/ts119602Requirements.ts`
- `src/xml/loteMetadata.ts`
- `src/json/loteChecks.ts`
- `src/audit.ts`
- `test/ts119602AlternativeXml.test.ts`
- `test/ts119602Interpretations.test.ts`
- `test/ts119602Requirements.test.ts`
- `test/fixtures/ts119602-alternative-pub-eaa.xml`
- `README.md`
- `TODO.md`
- `docs/architecture.md`
- `artifacts/handoffs/20260722_22_ts119602_alternative_xml_mapping.md`

## Commands and Tests Run

- `XML_CATALOG_FILES=schemas/etsi-ts-119-612/v2.4.1/catalog.xml xmllint --nonet --schema schemas/etsi-ts-119-612/v2.4.1/19612_xsd.xsd --noout test/fixtures/ts119602-alternative-pub-eaa.xml` — passed.
- `npm test -- --run test/ts119602AlternativeXml.test.ts` — passed: 1
  file, 3 tests.
- `npm test` — passed: 38 files, 210 tests.
- `npm run build` — passed.
- `git diff --check` — passed.

## Implementation Notes

- Reconciled the implementation against the official ETSI TS 119 602 V1.1.1
  Annex A.2.2 and all 34 rows of Table A.1.
- The TS 119 612 assessor now emits a typed source-fact contract containing the
  mapped scheme, provider/entity, service, identity and history observations,
  plus source schema/binding status and source-check evidence.
- The TS 119 602 alternative-binding assessor consumes only that contract. Its
  mapping finding records `xmlReparsedByTs119602: false` and all source/target
  component names and clauses.
- Base metadata/entity checks and Annex H Pub-EAA checks run only after the
  pinned TS 119 612 schema and canonical namespace/version binding pass.
  Mapping/profile evaluation is stopped with an actionable gate finding when
  source schema validation fails or is unavailable.
- Pub-EAA alternative documents request the existing XAdES Baseline B and Annex
  H.4 signature findings from the shared TS 119 612 parse rather than parsing
  the XML again.
- Added extracted alternative-binding counts/version/type evidence through the
  existing `jsonLote` report object; no public report schema version change was
  required.
- Recorded two unresolved V1.1.1 conflicts: Table A.1 maps the TS 119 612 fixed
  version value `6` into an Annex H field requiring `1`, and Table A.1 omits a
  mapping for required `LOTETag` while the source binding provides `TSLTag`.
  Values are preserved and reported rather than normalized.
- Updated the 81-family TS 119 602 ledger to 20 implemented, 61 partial and 0
  not implemented. Coverage gating remains active because partial families
  still prevent complete conformance conclusions.

## Known Caveats

- A schema-valid TS 119 612 V2.4.1 Pub-EAA alternative document cannot satisfy
  the published Annex H version value without resolving the `6` versus `1`
  conflict; the tool reports both independent requirements.
- `TSLTag` is retained as evidence but is not silently treated as the unmapped
  `LOTETag` component.
- Alternative-binding contextual dereferencing still requires a future adapter
  that consumes mapped facts; the existing contextual parser is not run against
  TS 119 612 XML.
- Remaining Annex B multilingual, legal-registration, profile cross-field,
  chain, revocation and external trust gaps remain partial/contextual.

## Follow-up Backlog

- TS612-07: complete the exact TS 119 612 XML signature/XAdES profile and
  explicit signer path, revocation and trust inputs.
- TS602-15: close core structure, multilingual, name/address/URI and service
  semantics after the next cross-standard task.

## Surface Changes

- CLI: no option changes; alternative-binding artifacts now receive mapped TS
  119 602 findings after the source gate passes.
- API: no route/request changes; shared core responses expose the same mapped
  findings and extracted summary.
- OpenAPI: unchanged; existing stable finding and extracted-object schemas
  cover the added evidence.
- Validators: typed Table A.1 source facts and alternative-binding gate added.
- Schemas: unchanged; a canonical schema-valid alternative Pub-EAA fixture was
  added.
- Reports: JSON and Markdown render the same mapped findings through the shared
  report contract.
- Fixtures: one positive mapping fixture plus a focused in-test schema failure.
- Docs/TODO: TS602-14 complete, ledger counts updated, conflicts documented and
  TS612-07 marked next.
- Handoff policy: followed.

## Generated Result Paths

- `test/fixtures/ts119602-alternative-pub-eaa.xml` — committed; small
  schema-valid Annex A.2.2 mapping fixture.
- `artifacts/handoffs/20260722_22_ts119602_alternative_xml_mapping.md` —
  committed; concise task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used
  only for verification.

No audit reports, live fetched artifacts, standards snapshots or review
packages were retained.
