# XML KeyInfo and list public-key match

## Task

Verify XMLDSig using the certificate in `ds:KeyInfo`, and for XML LoTL/LoTE-like list types verify that the first list `ServiceDigitalIdentity` certificate has the same public key.

## Commit

Pending at handoff creation; committed with this task.

## Files Changed

- `src/certs.ts`
- `src/xml/signature.ts`
- `src/xml/ts119612Checks.ts`
- `test/signature.test.ts`

## Commands and Tests Run

- `npm test -- --run test/signature.test.ts`
- `npm run build`
- `npm test`
- `git diff --check`

## Generated Result Paths

- None. No generated audit results were created.

## Known Caveats

- XMLDSig verification remains subject to the supported algorithms, transforms, and canonicalization capabilities of `xml-crypto`; unsupported structures are reported as `not_checked` with evidence.
- The list-key comparison is deliberately enabled only for XML artifacts whose `TSLType` looks like LoTL/LoTE; JSON LoTE/LoTL remains outside TS 119 612 XML signature processing.

## Follow-up Backlog

- Add a curated, cryptographically valid signed XML LoTL fixture to exercise default (non-injected) XMLDSig verification end-to-end.

## Change Surface

- CLI: indirectly changed through the shared XML assessor.
- API: indirectly changed through the shared XML assessor.
- OpenAPI, validators, schemas, reports, fixtures, docs: unchanged.
- Handoff policy: fulfilled.
