# General xmlsec1 XMLDSig backend

## Task

Replace `xml-crypto` with a general `xmlsec1` cryptographic verification
backend for ETSI TS 119 612 and ETSI TS 119 602-style XML artifacts, without
hard-coding behavior for one live XML document.

## Commit

Pending at handoff creation.

## Files Changed

- `README.md`
- `package.json`
- `package-lock.json`
- `src/audit.ts`
- `src/xml/loteMetadata.ts`
- `src/xml/signature.ts`
- `src/xml/ts119612Checks.ts`
- `src/xml/xmlsec.ts`
- `test/signature.test.ts`
- `test/xmlsec.test.ts`

## Commands and Tests

- `npm test -- --run test/signature.test.ts test/xmlsec.test.ts`
- `npm test`
- `npm run build`
- Executable smoke verification with `xmlsec1 1.2.39 (openssl)` against the
  temporary NXD ETSI TS 119 602-style `TrustedEntitiesList`: passed.
- Executable smoke verification with `xmlsec1 1.2.39 (openssl)` against the
  temporary IDunion `TrustServiceStatusList`: passed.
- `git diff --check`

## Generated Result Paths

- `artifacts/handoffs/20260720_04_xmlsec1_signature_backend.md` — committed
  handoff for this change.
- `/tmp/xmlsec1-eval/` — intentionally uncommitted temporary executable,
  libraries, and live XML smoke inputs.

## Generated Artifacts Not Committed

- `/tmp/xmlsec1-eval/NXD-TL-EAA.xml`
- `/tmp/xmlsec1-eval/idunion-tsl.xml`
- `/tmp/xmlsec1-eval/` extracted Ubuntu `xmlsec1` evaluation packages.

## Known Caveats

- Deployments must install `xmlsec1` on `PATH`; otherwise cryptographic
  verification is reported as `not_checked`.
- Runtime algorithm and transform coverage depends on the installed xmlsec
  version, crypto backend, and build options.
- Verification permits only empty and same-document Reference URIs and does
  not fetch detached signature inputs.
- The current assessor evaluates the first `ds:Signature`; it checks expected
  root coverage but does not implement full XAdES semantic/profile validation.
- A successful signature is cryptographic evidence only. Trust in the embedded
  signing certificate remains a separate assessment.

## Follow-up Backlog

- Add an optional CI/integration job with a pinned `xmlsec1` package so a real
  executable verification can run without making default tests platform
  dependent.
- Add deployment/container packaging when a deployment target is selected.
- Implement full XAdES signed-properties and certificate-policy checks only
  after the applicable normative profile is selected.

## Change Scope

- XML validators, signature report findings, package dependencies, tests,
  README documentation, and handoff policy output changed.
- CLI and API behavior changed through the shared asynchronous XML assessment
  path; API routes, OpenAPI, report schemas, fixtures, and durable schemas were
  not changed.
