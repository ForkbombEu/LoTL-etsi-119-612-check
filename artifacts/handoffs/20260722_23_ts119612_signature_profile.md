# TS612-07 — TS 119 612 signature profile

## Task

Implement the exact locally decidable ETSI TS 119 612 V2.4.1 XML
signature/XAdES profile, explicit signer metadata and certificate restrictions,
and separate certificate-path, revocation and signer-trust inputs.

Commit: pending

## Files Changed

- `src/xml/ts119612Signature.ts`
- `src/xml/signature.ts`
- `src/xml/ts119612Checks.ts`
- `src/types.ts`
- `src/audit.ts`
- `src/standards/ts119612Requirements.ts`
- `src/api/schemas.ts`
- `openapi/we-build-tl-audit.openapi.yaml`
- `test/fixtures/ts119612-signature-profile.xml`
- `test/ts119612Signature.test.ts`
- `test/ts119612Checks.test.ts`
- `test/ts119612Requirements.test.ts`
- `test/api.test.ts`
- `README.md`
- `TODO.md`
- `docs/architecture.md`

## Implementation Notes

- Applied XAdES-B-B checks to every supported TS 119 612 artifact.
- Added exact normative Annex B root reference, transform order and exclusive
  canonicalization checks.
- Added signature-method/value and single embedded TLSO certificate checks.
- Added TLSO certificate KeyUsage, recommended TSL-signing EKU,
  SubjectKeyIdentifier, BasicConstraints and self-signed issuer evidence.
- Added separately supplied intermediate/anchor path assessment, timestamped
  revocation evidence and signer trust without treating `ds:KeyInfo` as trust.
- Added the same evidence input to API schemas and OpenAPI.
- Reconciled the 69-family ledger to 11 implemented, 45 partial and 13 not
  implemented families.
- Normative source: ETSI TS 119 612 V2.4.1 clauses 5.7.1-5.7.3 and Annex B.1,
  `https://www.etsi.org/deliver/etsi_TS/119600_119699/119612/02.04.01_60/ts_119612v020401p.pdf`.

## Commands / Tests Run

- `npx vitest run test/ts119612Signature.test.ts test/signature.test.ts test/ts119612Checks.test.ts test/api.test.ts test/ts119612Requirements.test.ts`
- `npm test`
- `npm run build`
- `git diff --check`

## Known Caveats

- ETSI TS 119 612 references ETSI TS 119 312 non-specifically. The exact
  three-year usable-key table policy remains `not_checked` until an applicable
  policy snapshot is selected.
- A valid supplied path does not establish that a non-self-signed issuer is a
  listed TSP in the TL or the same community; that authorization remains
  `inconclusive`.
- Revocation status is explicit caller-supplied evidence. This task does not
  fetch or cryptographically validate CRLs or OCSP responses.
- The positive profile fixture has deterministic placeholder digest/signature
  values and uses a test verifier for structural checks; `xmlsec1` correctly
  does not treat it as a cryptographic positive fixture.

## Follow-up Backlog

- TS612-08: implement LoTL `OtherTSLPointer` semantics, authentication
  identities, rollover and namespace/profile dispatch.
- Select and pin the applicable ETSI TS 119 312 usable-key policy before making
  the algorithm-policy finding conclusive.
- Add authenticated TL/community issuer evidence and validated CRL/OCSP input
  formats in later contextual tasks.

## Surface Changes

- CLI: no new flags.
- API: added `context.ts119612Signer` path and revocation evidence.
- OpenAPI: added `Ts119612SignerEvidence`.
- Validators: added TS 119 612 XAdES/Annex B and TLSO certificate checks.
- Schemas: API request schemas changed; XML schemas unchanged.
- Reports: added stable `ts119612.signature.*` findings.
- Fixtures: added one deterministic signature-profile fixture.
- Docs: README, TODO and architecture updated.
- Handoff policy: updated for this prompt.

## Generated Result Paths

- `test/fixtures/ts119612-signature-profile.xml` — committed deterministic
  public-certificate signature-profile fixture.
- No generated result directories or standalone generated files are left
  intentionally uncommitted. Temporary private-key material used to create the
  public fixture certificate was deleted from `/tmp`.
