# TS602-08 — TS 119 602 clauses 6.4-6.7 entities and services

## Task

Implement ETSI TS 119 602 V1.1.1 clauses 6.4 through 6.7 entity, service, digital-identity, status, and history semantics for the supported scheme-explicit JSON and XML assessment paths.

## Commit

Pending (this handoff is included in the task commit).

## Files Changed

- `TODO.md`
- `src/json/loteChecks.ts`
- `src/standards/ts119602Entities.ts`
- `src/standards/ts119602Requirements.ts`
- `src/xml/loteMetadata.ts`
- `test/fixtures/json-lote.json`
- `test/fixtures/ts119602-entities-invalid.json`
- `test/loteChecks.test.ts`
- `test/ts119602Entities.test.ts`
- `test/ts119602Requirements.test.ts`
- `test/xmlLoteMetadata.test.ts`
- `artifacts/handoffs/20260721_08_ts119602_entities_services.md`

## Commands and Tests Run

- `pnpm run build` — passed after the shared observation model and both binding adapters were integrated.
- `pnpm test` — initially exposed that the positive entity fixture lacked the mandatory contact email; the fixture was corrected without weakening the validator.
- `pnpm test -- test/ts119602Entities.test.ts test/loteChecks.test.ts test/xmlLoteMetadata.test.ts` — passed: 27 test files, 139 tests (the package script runs the complete suite).
- `pnpm run build && pnpm test` — passed: 27 test files, 139 tests.
- `git diff --check` — passed.

## Implementation Notes

- Added a binding-neutral entity/service observation model with stable findings for clauses 6.4 through 6.7 and adapters for the official JSON and XML shapes.
- Local checks cover entity-list cardinality, mandatory entity information, names, addresses, information URIs, service wrappers, optional service URIs, supply points, identities, status/history-period coupling, current-status time ordering, and complete descending history instances.
- Digital-identity checks require at least one identifier, validate strict Base64 certificate/SKI strings, parse X.509 certificates, validate local DN shape, and retain certificate evidence in extracted results.
- Added versioned entity and service extension registries. Known `OtherAssociatedBodies` and `ServiceUniqueIdentifier` payloads receive local structure checks; unknown critical extensions fail closed.
- A missing TrustedEntitiesList is `inconclusive`, because one artifact cannot prove that no entity service is or was approved.
- Certificate/public-key and certificate/SKI equivalence is a separate `not_checked` finding when comparable material is present.

## Known Caveats

- Exact service type/status URI sets, mandatory X.509 usage, organization-name matching, and profile-specific history restrictions belong to Annex D-I dispatch.
- Official-record identity and trade-name claims require contextual evidence and are not treated as locally verified.
- History retention-window completeness cannot be established without prior-list or archive evidence.
- Entity/service extension registries recognize only the two V1.1.1 extensions defined by the pinned base extension schemas.
- XML XSD validation remains separate backlog work; this task adds semantic XML checks without claiming schema validation.

## Follow-up Backlog

- TS602-09: implement XAdES Baseline B and the exact Annex H.4 XML signature constraints, signer evidence, and trust separation.
- TS602-10: implement compact JAdES Baseline B parsing and verification for JSON LoTEs.
- TS602-11: apply the Annex D-I profile-specific identity, status, service-extension, and history rules.
- TS602-12: assess retention completeness using supplied prior/archive evidence.

## Surface Changes

- CLI: shared assessment behavior and extracted certificate evidence changed; no CLI option changes.
- API: shared assessment responses include the new findings; no route or request-schema changes.
- OpenAPI: unchanged.
- Validators: changed; clauses 6.4-6.7 shared validators and extension registries added.
- Schemas: unchanged; semantic checks close known gaps without modifying pinned upstream schemas.
- Reports: changed; JSON and Markdown render the new stable findings through the existing report contract.
- Fixtures: changed; the positive fixture has complete entity contact data and a schema-valid semantic-negative fixture was added.
- Docs: `TODO.md` marks TS602-08 complete and TS602-09 next.
- Handoff policy: followed.

## Generated Result Paths

- `artifacts/handoffs/20260721_08_ts119602_entities_services.md` — committed; concise task handoff.
- `dist/` — intentionally uncommitted and ignored; TypeScript build output used only for local verification.

No audit reports, fetched live artifacts, or review archives were generated.
