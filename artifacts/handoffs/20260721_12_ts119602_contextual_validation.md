# TS602-12 — Contextual validation and product surfaces

## Task

Add explicit prior-list evidence and optional bounded pointer, distribution, archive, and supply-point dereferencing, then expose the same TS 119 602 findings through CLI, API, OpenAPI, JSON, and Markdown without enabling hidden network activity.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `README.md`
- `TODO.md`
- `openapi/we-build-tl-audit.openapi.yaml`
- `src/api/routes.ts`
- `src/api/schemas.ts`
- `src/audit.ts`
- `src/cli.ts`
- `src/fetcher.ts`
- `src/lotl.ts`
- `src/standards/ts119602Context.ts`
- `src/standards/ts119602Requirements.ts`
- `src/types.ts`
- `src/xml/loteMetadata.ts`
- `test/api.test.ts`
- `test/fixtures/ts119602-context-current.jws`
- `test/ts119602Context.test.ts`
- `test/ts119602Requirements.test.ts`
- `artifacts/handoffs/20260721_12_ts119602_contextual_validation.md`

## Commands and Tests Run

- `npm run build` — passed.
- `node dist/cli.js --help` — passed; contextual CLI options are present.
- `npm test -- --run test/ts119602Context.test.ts test/api.test.ts test/ts119602Requirements.test.ts test/lotl.test.ts test/report.test.ts test/loteChecks.test.ts` — passed: 6 files, 37 tests before the final report-compatibility case was added.
- `npm test` — passed: 30 files, 165 tests.
- `git diff --check` — passed.

## Implementation Notes

- Added explicit `Ts119602ContextOptions` for supplied prior artifacts, trusted signer fingerprints, opt-in dereferencing, and bounded count, byte, and concurrency controls.
- Added `--contextual` and `--prior-lote` CLI options. Contextual network activity remains disabled unless explicitly requested.
- Added stable findings for prior sequence progression, certificate-based self-pointer authentication, exact distribution-byte consistency, direct archive evidence, machine-processable supply-point content, and collection bounds.
- Pointer authentication requires identical current LoTE bytes, a successfully verified target signature, and a target signer certificate matching at least one certificate identity declared by the pointer. Multiple identities support certificate rollover; embedded target certificates are never trusted by themselves.
- Contextual URL fetches use the existing timeout, cache duplicate URLs per assessed artifact, stream response bodies through a byte limit, and report HTTP/hash/size/error evidence.
- Added explicit signer-fingerprint trust propagation to both JAdES and XAdES assessment paths.
- Preserved report schema version 4 because contextual results use the existing `CheckResult` contract. JSON and Markdown render the same shared findings.
- Synchronized Fastify validation and OpenAPI schemas, including hard maxima and the existing `json_signature` certificate source value.
- Updated the requirements ledger to 18 implemented, 62 partial, and 1 not-implemented family without claiming complete conformance.

## Known Caveats

- Pointer identity authentication currently supports X.509 certificate equality. Public-key and SKI equivalence remain `inconclusive`.
- Archive validation recognizes a previous LoTE returned directly by the archive URI; HTML indexes and multi-step archive protocols are not traversed.
- Supply-point validation establishes bounded reachability and JSON/XML syntax, not authoritative register-record semantics.
- Explicit trusted signer fingerprints do not implement certificate path construction, revocation, or production trust-policy evaluation.
- A supplied prior LoTE can establish progression, but absence of prior evidence cannot prove that sequence number 1 is the first release.
- Official scheme-explicit XML Schema validation and TS 119 612 alternative-binding mapping remain incomplete, so complete conformance remains unavailable.
- Contextually fetched bodies are represented by report evidence but are not separately persisted as fetched artifacts.

## Follow-up Backlog

- Route scheme-explicit XML through the pinned offline XSD bundle with source-identified diagnostics.
- Implement the Annex A.2.2 / Table A.1 TS 119 612 alternative XML binding mapping.
- Add public-key/SKI pointer identity equivalence and explicit certificate-chain/revocation trust policy.

## Surface Changes

- CLI: changed; `--contextual` and `--prior-lote` added.
- API: changed; audit and artifact POST bodies accept an optional `context` object.
- OpenAPI: changed; contextual request schemas and limits added, with report schema version preserved.
- Validators: changed; contextual collection/validation and bounded response streaming added.
- Schemas: request schemas changed; pinned ETSI schemas and report schema version are unchanged.
- Reports: changed; contextual findings use the existing JSON/Markdown check contract.
- Fixtures: changed; one compact signed self-pointer fixture containing only public certificate material added.
- Docs: changed; CLI/API contextual usage, limits, and caveats documented, and TS602-12 marked complete.
- Handoff policy: followed.

## Generated Result Paths

- `test/fixtures/ts119602-context-current.jws` — committed; deterministic compact JAdES fixture for self-pointer, distribution, archive, and supply-point context tests.
- `artifacts/handoffs/20260721_12_ts119602_contextual_validation.md` — committed; concise task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used only for local verification.

The temporary fixture private key and PEM generation directory were deleted. No audit reports, live fetched artifacts, private keys, or review archives were retained.
