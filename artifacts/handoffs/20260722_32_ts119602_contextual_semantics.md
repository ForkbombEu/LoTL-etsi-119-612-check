# TS602-18 — Contextual semantics and retained evidence

## Task

Complete the bounded TS 119 602 contextual slice for scheme pages,
authoritative registration/contact evidence, archive traversal, register
authentication, history retention, and final closed lists.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `README.md`
- `TODO.md`
- `openapi/we-build-tl-audit.openapi.yaml`
- `src/api/schemas.ts`
- `src/standards/ts119602Context.ts`
- `src/standards/ts119602ContextFacts.ts`
- `src/standards/ts119602Profiles.ts`
- `src/standards/ts119602Requirements.ts`
- `src/types.ts`
- `test/api.test.ts`
- `test/ts119602Context.test.ts`
- `test/ts119602Profiles.test.ts`
- `test/ts119602Requirements.test.ts`
- `artifacts/handoffs/20260722_32_ts119602_contextual_semantics.md`

## Commands and Tests Run

- `pnpm run build` — passed.
- `pnpm test` — passed: 44 files, 259 tests.
- `git diff --check` — passed.

## Implementation Notes

- Scheme-information, rules, and policy semantics use caller-supplied review
  assertions bound to the exact SHA-256 of dereferenced bytes. Reachability or
  prose inspection alone never establishes legal/policy meaning.
- Scheme-operator and trusted-entity names, registration identifiers,
  postal/electronic contacts, and associated-body relationships can be
  compared with explicit source-identified authoritative records.
- Archive traversal follows bounded same-origin HTML links and selected
  JSON/JWS index link fields, shares the contextual fetch cache, and requires
  complete previous-sequence coverage for a pass.
- Annex I compact-JWS register data is cryptographically verified and its
  embedded signer is matched to the declaring service identity.
- HistoricalInformationPeriod `65535` is checked against every state in a
  complete supplied prior sequence. Missing observed states fail; incomplete
  sequences remain inconclusive.
- A null `NextUpdate` requires every service to have an explicit status and an
  explicit caller-supplied profile/scheme URI whose semantics are `expired`.
  Local Annex D-I status rules defer this final-list override to the contextual
  finding.
- The requirements ledger remains 81 families and now records 39 implemented,
  42 partial, and 0 not implemented families. Complete conformance remains
  disabled.

## Known Caveats

- Archive index formats other than same-origin HTML anchors or configured
  JSON/JWS link field names remain inconclusive.
- Register signatures/seals other than compact JWS with embedded `x5c`, and
  register-specific record schemas, remain unsupported contextual semantics.
- Human-reviewed resource assertions and authoritative records are trusted
  inputs whose provenance is reported but not independently certified.
- Finite history-retention periods require scheme policy and remain
  inconclusive; the implemented complete-retention proof targets value 65535.
- Non-PKI pointer `OtherId`, automatic path discovery, certificate-policy
  authority, and CRL/OCSP retrieval remain open.

## Follow-up Backlog

- TS602-19: add dedicated positive and negative fixture files for every
  base/extension schema and newly implemented ledger family, including these
  contextual findings, and extend interpretation-registry regressions.
- TS602-20: perform the product-surface/ledger completion audit and optional
  bounded live smoke procedures.

## Surface Changes

- CLI: unchanged; existing contextual controls are reused.
- API: changed; `context.ts119602` accepts reviewed resources, authoritative
  identities, and expired-status URIs.
- OpenAPI: changed; the new contextual evidence schemas are documented.
- Validators: changed; bounded archive traversal, resource hash binding,
  authoritative matching, register authentication, retained-history, and final
  closure checks were added.
- Schemas: request schemas changed; pinned ETSI artifact schemas are unchanged.
- Reports: changed only through additional standard findings using the existing
  `CheckResult` contract; report schema remains v6.
- Fixtures: no committed fixture file changed; deterministic tests reuse the
  existing signed JWS/certificate fixtures and construct small inline records.
- Docs: changed; README limitations and TODO sequencing/coverage were updated.
- Handoff policy: followed.

## Generated Result Paths

- `artifacts/handoffs/20260722_32_ts119602_contextual_semantics.md` — committed;
  this task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used
  only for local verification.

No live fetched LoTEs, reports, private keys, or review packages were retained.
