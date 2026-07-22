# TS612-08 — OtherTSLPointer semantics

## Task

Implement locally decidable ETSI TS 119 612 `OtherTSLPointer` structure,
qualifier, signing-certificate, rollover and supported target-profile dispatch
checks while keeping actual pointed-list authentication contextual.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `README.md`
- `TODO.md`
- `docs/architecture.md`
- `src/standards/ts119612Requirements.ts`
- `src/xml/ts119612Checks.ts`
- `src/xml/ts119612Pointers.ts`
- `src/xml/ts119612ServiceSemantics.ts`
- `test/ts119612Checks.test.ts`
- `test/ts119612Pointers.test.ts`
- `test/ts119612Requirements.test.ts`
- `artifacts/handoffs/20260722_24_ts119612_pointer_semantics.md`

## Commands and Tests Run

- `npm run build` — passed.
- `npx vitest run test/ts119612Pointers.test.ts test/ts119612Requirements.test.ts` — passed: 2 files, 9 tests.
- `npm test` — passed: 40 files, 218 tests.
- `git diff --check` — passed.

## Implementation Notes

- Added exact namespace-aware `PointersToOtherTSL` and `OtherTSLPointer`
  cardinality/order checks for both TL and LoTL artifacts where applicable.
- Validates one absolute `TSLLocation` and the five required wrapped qualifiers:
  type, scheme operator name, community rules, territory and the exact
  `application/vnd.etsi.tsl+xml` media type.
- Reuses the service-identity parser to compare X.509 subject, SKI and RSA
  `KeyValue` representations with the declared pointer certificate.
- Extracts pointer certificates into the shared report evidence and emits
  stable parse/validity, operator/territory metadata and rollover findings.
- Treats Annex A continuity as evidence: two distinct keys, shifted validity
  intervals and a currently valid certificate pass; incomplete evidence warns.
  No unsupported numeric separation threshold was invented.
- Dispatches canonical `EUgeneric` and `EUlistofthelists` target types to the
  supported TL/LoTL profiles. Custom types remain `inconclusive`; the observed
  EUDI RI namespace variant remains warning-only.
- Leaves signer-certificate digest matching against an actual dereferenced
  target as `ts119612.scheme.pointers.authentication: not_checked`.
- Updated the 69-family ledger to 12 implemented, 45 partial and 12 not
  implemented families without enabling complete conformance.

## Known Caveats

- Target dereferencing, target-signature authentication, certificate
  chain/revocation policy and bounded cross-list traversal remain TS612-09.
- Annex A does not provide a numeric definition of validity dates being “too
  close”; the local check compares key and interval distinctness only.
- Local `KeyValue` equivalence supports RSA material; other XMLDSig key forms
  are not silently accepted as equivalent.
- Only the registered EU generic TL and EU list-of-lists target types have
  normative local dispatch. Custom community types require explicit profiles.

## Follow-up Backlog

- Implement TS612-09 contextual sequence, distribution, archive/history,
  pointer-authentication and bounded traversal checks.
- Add explicit EUDI RI and WE BUILD TS 119 612 profile behavior in TS612-10
  without treating reference services as normative ETSI sources.
- Expand final positive/negative fixture coverage during TS612-11.

## Surface Changes

- CLI: behavior changed through the shared XML assessor; no options changed.
- API: behavior changed through the shared core; request/response shapes are
  unchanged.
- OpenAPI: unchanged; existing finding and certificate schemas cover the new
  evidence.
- Validators: changed; pointer semantics and dispatch were added.
- Schemas: unchanged.
- Reports: changed; stable pointer findings and pointer certificate summaries
  are now included in existing JSON/Markdown structures.
- Fixtures: existing deterministic XML and certificate fixtures are reused by
  focused positive and negative tests.
- Docs: README, architecture and roadmap updated.
- Handoff policy: followed.

## Generated Result Paths

- `artifacts/handoffs/20260722_24_ts119612_pointer_semantics.md` — committed;
  concise task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used
  only for local verification.

No audit reports, live fetched artifacts, schema downloads or review archives
were generated.
