# TS612-06 — TS 119 612 service history and certificate semantics

## Task

Implement locally decidable ETSI TS 119 612 V2.4.1 service-history,
predefined-extension, qualifier, status-transition, service-identity and
certificate-purpose evidence without inferring external legal, registry,
archive, chain, trust or revocation facts.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `src/standards/ts119612ServiceSemantics.ts`
- `src/standards/ts119612Requirements.ts`
- `src/xml/ts119612ServiceSemantics.ts`
- `src/xml/ts119612Checks.ts`
- `test/ts119612ServiceSemantics.test.ts`
- `test/ts119612TspServices.test.ts`
- `test/ts119612Checks.test.ts`
- `test/ts119612Requirements.test.ts`
- `test/fixtures/ts119612-service-ca.cert.pem`
- `test/fixtures/ts119612-service-end-entity.cert.pem`
- `TODO.md`
- `artifacts/handoffs/20260722_21_ts119612_service_semantics.md`

## Commands and Tests Run

- `npm test -- --run test/ts119612ServiceSemantics.test.ts` — passed: 1 file,
  6 tests, including automatic pinned-XSD validation through `xmllint` when
  available.
- `npm test` — passed: 37 files, 207 tests.
- `npm run build` — passed.
- `git diff --check` — passed.

## Implementation Notes

- Added service-history exact instance structure, non-empty presence, strict UTC
  newest-to-oldest ordering, current-state boundary, registered status values,
  modern qualified/non-qualified transitions and explicit legacy/custom
  transition ambiguity.
- Historical identities must omit certificates, retain `X509SKI`, and match the
  current certificate SKI when comparable. Completeness of all retained states
  remains `inconclusive` without prior trusted-list evidence.
- Added the closed 13-value qualification vocabulary, obvious conflicting
  qualifier pairs, criteria assertions, key-usage vocabulary and non-empty
  criteria checks. Whether the certificate required a Qualifications extension
  and custom criteria meaning remain explicit limitations.
- Added local semantics for `ExpiredCertsRevocationInfo`, `Qualifications`,
  `TakenOverBy`, and `AdditionalServiceInformation`, including service-type
  dependencies and criticality where locally decidable.
- Added deterministic X.509 evidence for subject, issuer, serial, validity,
  SHA-256 fingerprint, public-key hash, SKI, basic constraints, key usage and
  self-signature. Public X.509 certificate, subject DN, RSA `KeyValue` and SKI
  representations are compared for equivalence.
- Added same-service-type duplicate-public-key detection, CA/CRL certificate
  purpose checks and certificate subject-organization comparison with TSP name.
  Scheme-definition fallback content, chain validation and revocation remain
  separate findings/limitations.
- Updated the 69-family ledger to 9 implemented, 46 partial and 14 not
  implemented; complete-conformance coverage gating remains active.
- Updated the roadmap: TS612-06 is complete and TS602-14 is the next task in the
  cross-standard sequence.

## Known Caveats

- A single current TL cannot prove that every historical state was retained.
- Annex J/legacy EU status migration is not inferred from registered status
  values alone.
- Custom service types, qualifiers, criteria and additional-information URI
  registrations require supplied scheme/registry evidence.
- `TakenOverBy` authorization and target-list consistency require authenticated
  external evidence.
- Service certificates are evidence only; no implicit chain trust or revocation
  conclusion is made.
- DN comparison covers the deterministic common representation used by the
  fixtures; exotic equivalent X.500 encodings may require a dedicated canonical
  name library in future work.

## Follow-up Backlog

- TS602-14: map TS 119 612 validated facts to the TS 119 602 Annex A.2.2/Table
  A.1 alternative XML binding without ad hoc reparsing.
- TS612-07: complete the exact XML signature/XAdES profile and explicit signer
  path, revocation and trust inputs.

## Surface Changes

- CLI: no option changes; shared TS 119 612 results include the new findings.
- API: no route/request changes; shared core responses expose the same findings.
- OpenAPI: unchanged; existing stable finding schemas cover the added evidence.
- Validators: service history, predefined extension, identity equivalence and
  certificate-purpose validation added.
- Schemas: unchanged; the composed positive fixture passes the pinned V2.4.1
  bundle.
- Reports: existing JSON and Markdown rendering receives identical new
  findings.
- Fixtures: two small public certificate fixtures added; no private keys are
  committed.
- Docs/TODO: roadmap, coverage totals and next cross-standard task updated.
- Handoff policy: followed.

## Generated Result Paths

- `test/fixtures/ts119612-service-ca.cert.pem` — committed; deterministic public
  CA certificate for positive identity/role evidence.
- `test/fixtures/ts119612-service-end-entity.cert.pem` — committed;
  deterministic public end-entity certificate for negative CA-role evidence.
- `artifacts/handoffs/20260722_21_ts119612_service_semantics.md` — committed;
  concise task handoff.
- `/tmp/ts61206-cert/` — intentionally uncommitted; ephemeral certificate
  generation workspace containing private keys used only to create the public
  fixtures.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used
  only for verification.

No audit reports, live fetched artifacts or review packages were retained. The
temporary ETSI PDF/text used for clause reconciliation remains outside the
repository under `/tmp`.
