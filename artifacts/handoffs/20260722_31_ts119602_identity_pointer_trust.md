# TS602-17 — identity equivalence and pointer trust evidence

## Task

Implement ETSI TS 119 602 certificate/PublicKeyValue/X509SKI equivalence and
use every supported PKI pointer identity with explicit path and revocation
inputs.

## Commit

Pending at handoff creation.

## Files Changed

- `src/standards/ts119602Identity.ts`
- `src/standards/ts119602Entities.ts`
- `src/standards/ts119602Context.ts`
- `src/standards/ts119602Requirements.ts`
- `src/xml/loteMetadata.ts`
- `src/xml/ts119612Facts.ts`
- `src/types.ts`
- `src/api/schemas.ts`
- `openapi/we-build-tl-audit.openapi.yaml`
- `test/ts119602Entities.test.ts`
- `test/ts119602Context.test.ts`
- `test/xmlLoteMetadata.test.ts`
- `test/ts119602Requirements.test.ts`
- `test/api.test.ts`
- `README.md`
- `TODO.md`
- `artifacts/handoffs/20260722_31_ts119602_identity_pointer_trust.md`

## Implementation Summary

- Added one binding-neutral identity inspector that derives certificate
  fingerprints, SPKI SHA-256 hashes and SubjectKeyIdentifiers.
- Compared JSON JWK and XML RSA `ds:KeyValue` public keys and X509SKI values
  with certificates in the same service identity.
- Preserved XML RSA key material in both scheme-explicit and Table A.1 mapped
  observations instead of reducing it to an element-name marker.
- Authenticated JSON/XML pointer signers through declared certificate,
  public-key or SKI identities.
- Added `context.pointerSigners`, keyed by exact `LoTELocation`, for separately
  supplied intermediate certificates, trust anchors and timestamped revocation
  evidence. Embedded signer certificates are not implicit anchors.
- Kept open-format non-PKI `OtherId` authentication explicitly inconclusive;
  the 81-family ledger therefore remains 24 implemented and 57 partial.
- Marked TS602-17 complete and advanced TS602-18 as the next task.

## Commands and Tests Run

- `pnpm test` — 44 test files and 253 tests passed.
- `pnpm run build`
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/` — ignored TypeScript build output.
- No live network evidence, fetched lists or generated audit reports were
  created.

## Known Caveats

- `OtherId` has open, profile-defined semantics and is not treated as a generic
  cryptographic pointer identity.
- Only JSON JWK and XML RSA `KeyValue` forms supported by Node's public-key
  parser are compared; unsupported key representations fail locally.
- Certificate paths and revocation are evaluated only when explicitly
  supplied. The tool does not discover intermediates or fetch CRL/OCSP data.
- Complete TS 119 602 conformance remains disabled.

## Follow-up Backlog

- TS602-18: contextual scheme pages, authoritative registration evidence,
  archive traversal, register semantics, history retention and final lists.
- TS602-19 and TS602-20 remain sequenced in `TODO.md`.

## Surface Changes

- CLI: no new flag; shared in-memory/API context accepts pointer signer
  evidence.
- API/OpenAPI: added `context.pointerSigners` and
  `TrustListPointerSignerEvidence`.
- Validators: service identity equivalence and contextual pointer
  authentication changed.
- Schemas: pinned ETSI schemas are unchanged.
- Reports: existing stable identity-equivalence and pointer-authentication
  findings contain richer evidence; report schema remains v6.
- Fixtures: existing deterministic certificate/JAdES fixtures were reused.
- Docs: README and TODO roadmap updated.
- Handoff policy: this handoff was created before the single task commit.

## Generated Result Paths

- `dist/` — intentionally uncommitted; ignored TypeScript build output.
- `artifacts/handoffs/20260722_31_ts119602_identity_pointer_trust.md` —
  committed; task handoff and validation summary.
