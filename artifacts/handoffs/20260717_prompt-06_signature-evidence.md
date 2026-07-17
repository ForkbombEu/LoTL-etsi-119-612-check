# Prompt 06 — XML Signature and Signing-Certificate Evidence Improvements Handoff

## Task / Prompt Name

Prompt 06 — XML signature and signing-certificate evidence improvements.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `src/xml/signature.ts`
- `src/report/markdownReport.ts`
- `test/signature.test.ts`
- `test/fixtures/tsl-signed-unsupported.xml`
- `test/report.test.ts`
- `README.md`
- `artifacts/handoffs/20260717_prompt-06_signature-evidence.md`

## Commands / Tests Run

- `npm test`
- `npm run build`
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/`: TypeScript build output.

## Known Caveats

- XMLDSig verification is best-effort and only uses the first parseable embedded signing certificate as the verification candidate.
- A verification limitation is reported as `not_checked`; this does not imply a valid signature or a trusted certificate.
- The signed fixture deliberately has incomplete XMLDSig structure and uses a local test certificate to exercise parsed-certificate and unsupported-verification evidence paths.

## Follow-up Backlog Items

- Add a complete, cryptographically valid XMLDSig fixture if a stable signing process and compatible canonicalization profile are selected.
- Add explicit signature-algorithm and reference/transform evidence only when it is needed by an implemented profile check.
- Continue JSON LoTE assessment work in its dedicated prompt.

## Change Matrix

- CLI changed: no
- API changed: no
- OpenAPI changed: no
- Validators changed: yes, explicit signature evidence and injectable verification boundary
- Schemas changed: no
- Reports changed: yes, Markdown now renders detailed certificate evidence
- Fixtures changed: yes
- Documentation changed: yes

## Generated Result Paths

- `dist/` (not committed): TypeScript build output produced by `npm run build`.
