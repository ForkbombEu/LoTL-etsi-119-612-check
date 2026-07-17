# Exact LoTL/LoTE list certificate match

## Task

Change the prior LoTL/LoTE first-list signing-certificate check so it requires exact X.509 certificate equality, rather than public-key equality.

## Commit

Pending at handoff creation; committed with this task.

## Files Changed

- `src/certs.ts`
- `src/xml/signature.ts`
- `test/signature.test.ts`

## Commands and Tests Run

- `npm test -- --run test/signature.test.ts`
- `npm run build`
- `npm test`
- `git diff --check`

## Generated Result Paths

- None. No generated audit results were created.

## Known Caveats

- Exact equality compares SHA-256 fingerprints of normalized DER certificate bytes. Whitespace or PEM wrapping does not affect the result; any certificate reissuance does.
- XMLDSig verification still reports unsupported algorithms, transforms, or canonicalization as `not_checked` with evidence.

## Follow-up Backlog

- Add a curated cryptographically valid signed XML LoTL fixture for default XMLDSig verification end-to-end.

## Change Surface

- CLI and API: indirectly changed through the shared XML assessor.
- OpenAPI, validators, schemas, reports, fixtures, docs: unchanged.
- Handoff policy: fulfilled.
