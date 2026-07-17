# Prompt 04 — Harden ETSI TS 119 612 XML Structural Checks Handoff

## Task / Prompt Name

Prompt 04 — Harden ETSI TS 119 612 XML structural checks.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `src/xml/ts119612Checks.ts`
- `test/ts119612Checks.test.ts`
- `test/report.test.ts`
- `test/fixtures/tsl-bad-namespace.xml`
- `test/fixtures/tsl-expired-next-update.xml`
- `README.md`
- `artifacts/handoffs/20260717_prompt-04_xml-structural-checks.md`

## Commands / Tests Run

- `npm test`
- `npm run build`
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/`: TypeScript build output.

## Known Caveats

- The implemented checks are structural/date evidence checks and do not claim full ETSI TS 119 612 conformance.
- An XML document with the `TrustServiceStatusList` local name but a non-ETSI namespace is explicitly reported as TS 119 612 `not_applicable`; root-name and namespace check evidence remains available.
- XML LoTLs are not required by this implementation to carry `TrustServiceProviderList`, and service-content warnings are not generated solely because that list is absent.

## Follow-up Backlog Items

- Add fixture coverage for an XML LoTL with `TSLType` identifying a list of lists and verify its `TrustServiceProviderList` result is `not_applicable`.
- Add more profile-specific validation only when an explicit normative/profile rule is selected.
- Continue optional XSD validation work in its dedicated prompt.

## Change Matrix

- CLI changed: no
- API changed: no
- OpenAPI changed: no
- Validators changed: yes, XML root evidence and conditional TSP-list/service checks
- Schemas changed: no
- Reports changed: existing JSON/Markdown check rendering now has added structural-check coverage
- Fixtures changed: yes
- Documentation changed: yes

## Generated Result Paths

- `dist/` (not committed): TypeScript build output produced by `npm run build`.
