# TS612-04 — TS 119 612 SchemeInformation validation

## Task

Implement exact `SchemeInformation` direct structure and locally decidable
ETSI TS 119 612 V2.4.1 semantics without turning contextual evidence into a
local conformance claim.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `src/xml/ts119612SchemeInformation.ts`
- `src/xml/ts119612Checks.ts`
- `src/standards/ts119612Requirements.ts`
- `test/ts119612SchemeInformation.test.ts`
- `test/ts119612Checks.test.ts`
- `test/ts119612Requirements.test.ts`
- `test/fixtures/ts119612-scheme-information-valid.xml`
- `README.md`
- `TODO.md`
- `artifacts/handoffs/20260722_19_ts119612_scheme_information.md`

## Commands and Tests Run

- `npm test -- --run test/ts119612SchemeInformation.test.ts test/ts119612Requirements.test.ts test/ts119612Checks.test.ts` — passed: 3 files, 17 tests.
- `npm test` — passed: 35 files, 193 tests.
- `npm run build` — passed.
- `XML_CATALOG_FILES=schemas/etsi-ts-119-612/v2.4.1/catalog.xml xmllint --nonet --schema schemas/etsi-ts-119-612/v2.4.1/19612_xsd.xsd --noout test/fixtures/ts119612-scheme-information-valid.xml` — passed.
- `git diff --check` — passed.

## Implementation Notes

- Added namespace-aware direct `SchemeInformation` cardinality and ordering
  checks. Normative document requirements take precedence where the pinned
  Annex C schema is more permissive.
- Added stable findings for TL version, positive local sequence shape, list
  type/territory consistency, operator name/address, scheme name/information
  URI, status determination, community rules, territory, policy/legal choice,
  history period, issue time, next update, distribution points and extensions.
- Reused deterministic RFC 3986, RFC 5646/multilingual, country-code and strict
  UTC syntax helpers already exercised by TS 119 602. This does not imply that
  the two standards or their artifact types are interchangeable.
- Replaced the former 183-day approximation with exact UTC calendar-month
  arithmetic. Empty `NextUpdate` is accepted only when all locally observed
  current service statuses are expired.
- Registered/custom values that cannot be established from local evidence are
  `inconclusive`; referenced URI content, policy authority, registration,
  sequence progression, distribution equality and history consequences are
  explicitly reported as unchecked contextual evidence.
- Added a small canonical positive fixture that validates against the pinned
  official schema, plus focused mutations for structure, namespaces,
  semantics, TL/LoTL territory distinctions, closed-list behavior and calendar
  boundaries.
- Updated ledger coverage to 69 total: 5 implemented, 32 partial and 32 not
  implemented. Coverage gating therefore remains active.

## Known Caveats

- Sequence progression still requires supplied prior-list evidence.
- URI targets, scheme/operator legal authority, custom URI registration,
  distribution binary equality and historical retention are not established
  by local XML inspection.
- `OtherTSLPointer` contents are only required by local scheme context here;
  their detailed structure, signing identities and authentication remain
  TS612-08 work.
- TSP/service structure and semantics remain the next task. Scheme checks can
  expose additional failures in older valid-ish compatibility fixtures without
  treating those fixtures as normative positives.
- Shared syntax helpers retain TS 119 602-oriented filenames; their applicable
  rule behavior is selected explicitly by the TS 119 612 assessor.

## Follow-up Backlog

- TS612-05: implement exact TSP and service-information nesting/cardinality and
  locally decidable field semantics.
- TS612-06: connect `HistoricalInformationPeriod` to service-history retention
  and transition evidence.
- TS612-08/09: implement pointer semantics, contextual sequence progression,
  distribution equality and bounded cross-list authentication.

## Surface Changes

- CLI: no option changes; TS 119 612 XML assessments include the new findings.
- API: no route/request changes; shared core responses include the new findings.
- OpenAPI: unchanged; findings use the existing stable report schema.
- Validators: added SchemeInformation structure/local semantic validation and
  exact next-update calendar handling.
- Schemas: pinned bundle unchanged; one canonical schema-valid fixture added.
- Reports: JSON and Markdown receive the same core findings through the existing
  renderer contract.
- Fixtures: one positive canonical fixture plus in-test negative mutations.
- Docs/TODO: TS612-04 complete, TS612-05 next, coverage/test totals updated.
- Handoff policy: followed.

## Generated Result Paths

- `artifacts/handoffs/20260722_19_ts119612_scheme_information.md` — committed;
  concise task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used
  only for verification.

No audit reports, live fetched artifacts, standards downloads or review
packages were retained.
