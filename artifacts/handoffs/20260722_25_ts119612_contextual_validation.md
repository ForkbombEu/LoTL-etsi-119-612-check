# TS612-09 — Contextual validation and bounded traversal

## Task

Add supplied-context validation for TS 119 612 sequence progression,
distribution equality, retained service history, pointer dereferencing and
authentication, and bounded cross-list traversal.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `README.md`
- `TODO.md`
- `docs/architecture.md`
- `openapi/we-build-tl-audit.openapi.yaml`
- `src/api/schemas.ts`
- `src/audit.ts`
- `src/cli.ts`
- `src/detect.ts`
- `src/standards/ts119612Context.ts`
- `src/standards/ts119612Requirements.ts`
- `src/types.ts`
- `test/api.test.ts`
- `test/detect.test.ts`
- `test/ts119612Checks.test.ts`
- `test/ts119612Context.test.ts`
- `test/ts119612Requirements.test.ts`
- `artifacts/handoffs/20260722_25_ts119612_contextual_validation.md`

## Commands and Tests Run

- `npm run build` — passed.
- `npx vitest run test/ts119612Context.test.ts test/detect.test.ts test/ts119612Requirements.test.ts test/api.test.ts` — passed: 4 files, 34 tests.
- `npm test` — passed: 41 files, 224 tests.
- `git diff --check` — passed.

## Implementation Notes

- Added a TS 119 612 contextual evaluator using the existing explicit context
  request shape; normal assessment remains offline unless `dereference` is
  true.
- Compares same-type/same-territory supplied prior lists for increasing
  sequence/issue time and retained services/status states.
- Requires every dereferenced pointer target to be fetched successfully,
  classified as the declared target kind, current or validly closed,
  cryptographically verified, and signed by a certificate whose SHA-256 digest
  is declared by the parent pointer.
- Nested pointers are parsed only after their parent target authenticates.
- Uses one fetch per URL, bounded concurrency and response bytes, configurable
  pointer depth, a total dereference bound, and cycle detection without
  recursive re-fetching.
- Compares each root distribution response byte-for-byte with the assessed
  current TL.
- Corrected TL/LoTL detection to use the direct scheme `TSLType`, not a nested
  pointer qualifier.
- Added `maxTraversalDepth` to TypeScript, Fastify and OpenAPI request
  contracts: default 3, hard maximum 8.
- Added generic `TrustListContextOptions`; the historical
  `Ts119602ContextOptions` name remains as a deprecated source-compatible
  alias.
- Updated the 69-family ledger to 15 implemented, 45 partial and 9 not
  implemented families without enabling complete conformance.

## Known Caveats

- Public-key/SKI-only pointer authentication is not implemented; X.509
  certificate digest identities are required for contextual authentication.
- Prior-list comparison can only prove retention relative to the supplied
  instances; absent older releases remain unknown.
- TS 119 612 does not define an archive-index protocol in the assessed fields;
  prior archive instances are therefore explicit inputs rather than hidden
  secondary fetches.
- Signature verification still depends on `xmlsec1`; unsupported or failed
  verification prevents pointer authentication and nested traversal.

## Follow-up Backlog

- Implement TS612-10 EUDI RI and WE BUILD TS 119 612 profile checks while
  keeping reference-service behavior distinct from normative ETSI rules.
- Add exhaustive fixture and product-surface synchronization in TS612-11.
- Retain explicit limitations for unavailable legal/authority and monitoring
  evidence during the TS612-12 coverage audit.

## Surface Changes

- CLI: contextual descriptions now cover TL and LoTE prior/context evidence;
  existing options remain compatible.
- API: TS 119 612 artifact assessment now consumes supplied context and opt-in
  dereferencing through the shared core.
- OpenAPI: contextual evidence documents prior TL/LoTE use and traversal depth.
- Validators: sequence/history, distribution, pointer authentication and
  bounded traversal added; TL/LoTL classification corrected.
- Schemas: report schema unchanged; request validation adds one optional field.
- Reports: new stable contextual findings use the existing JSON/Markdown
  finding contract.
- Fixtures: existing deterministic XML/certificate fixtures are composed in
  focused mocked-network tests; no live network is used.
- Docs: README, architecture and roadmap updated.
- Handoff policy: followed.

## Generated Result Paths

- `artifacts/handoffs/20260722_25_ts119612_contextual_validation.md` — committed;
  concise task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used
  only for local verification.

No audit reports, live fetched artifacts, schema downloads or review archives
were generated.
