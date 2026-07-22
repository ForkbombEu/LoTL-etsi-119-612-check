# TS612-10 — EUDI RI and WE BUILD TS 119 612 reference profiles

## Task

Add explicit EUDI RI and WE BUILD TS 119 612 profile checks while keeping
observed reference-service behavior separate from normative ETSI findings and
production trust decisions.

## Commit

Pending at handoff creation.

## Files Changed

- `src/profiles/ts119612ReferenceProfiles.ts`
- `src/audit.ts`
- `src/types.ts`
- `src/report/jsonReport.ts`
- `src/report/markdownReport.ts`
- `openapi/we-build-tl-audit.openapi.yaml`
- `test/fixtures/eudi-ri-ts119612-tl.xml`
- `test/fixtures/we-build-ts119612-index.xml`
- `test/ts119612ReferenceProfiles.test.ts`
- `test/api.test.ts`
- `test/report.test.ts`
- `test/ts119602Context.test.ts`
- `README.md`
- `TODO.md`
- `docs/architecture.md`
- `artifacts/handoffs/20260722_26_ts119612_reference_profiles.md`

## Implementation Summary

- Added isolated `referenceProfiles.eudiRiTs119612` and
  `referenceProfiles.weBuildTs119612` results to every artifact result.
- EUDI RI recognition uses the exact Trusted List Provider host or embedded RI
  evidence. Checks cover endpoint/TL-or-LoTL alignment, HTTPS pointer
  observation, EUDI role classification and X.509 role-anchor evidence.
- WE BUILD recognition uses the exact WP4 publication path or embedded WP4
  evidence. Checks cover canonical versus observed compatibility namespace,
  distribution-index/member-TL shape, distribution URI quality, EUDI roles and
  role-anchor evidence.
- Reference-profile warnings do not enter TS 119 612 checks, scores, mandatory
  failures or conformance levels. Embedded certificates remain untrusted until
  assessed against explicit trust evidence.
- Bumped the report contract to schema v5 and synchronized TypeScript,
  Markdown, API responses, OpenAPI and tests.
- Added small offline fixtures based on the observable reference shapes; no
  live artifact snapshot is part of normal tests.

## Commands and Tests Run

- `curl -fsSL --max-time 20 --range 0-60000 https://trustedlist.serviceproviders.eudiw.dev/`
- `curl -fsSL --max-time 20 --range 0-60000 https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.xml`
- `curl -fsSL --max-time 20 --range 0-100000 https://trustedlist.serviceproviders.eudiw.dev/LOTL/01.xml`
- `curl -fsSL --max-time 20 --range 0-100000 https://trustedlist.serviceproviders.eudiw.dev/TL/EU/01.xml`
- `npx vitest run test/ts119612ReferenceProfiles.test.ts`
- `npm run build`
- `npx vitest run test/ts119612ReferenceProfiles.test.ts test/report.test.ts test/api.test.ts test/ts119602Context.test.ts test/weBuild.test.ts`
- `npm run build && npm test && git diff --check` — 42 files and 229 tests passed.

## Generated Artifacts Intentionally Not Committed

- `dist/` — ignored TypeScript build output.
- No live EUDI RI or WE BUILD response was saved; the live reads were bounded
  implementation research only.

## Known Caveats

- Reference services can change. Recognition requires exact hosts/paths or
  embedded evidence; unrecognized drift is reported as not applicable instead
  of being guessed.
- The implemented service-role table covers the explicit EUDI role URIs known
  to this task. Other service types remain warning evidence.
- Profile recognition, role classification and embedded X.509 material do not
  establish signer trust, trust-anchor authorization, legal status or
  production suitability.
- The observed `http://uri.etsi.org/19612/v2.4.1#` namespace is retained only as
  compatibility evidence and is not promoted to a normative ETSI binding.

## Follow-up Backlog

- TS612-11: audit deterministic positive/negative fixture coverage for every
  implemented TS 119 612 requirement family and synchronize all product
  surfaces.
- TS612-12: complete the ledger-driven coverage audit and manual live-smoke
  procedure.
- Extend the EUDI role URI map only from versioned profile evidence.

## Surface Changes

- CLI: output report contract changed through shared core; no new CLI option.
- API: artifact and audit responses now include `referenceProfiles`.
- OpenAPI: report schema v5 and `ReferenceProfileAssessment` added.
- Validators: no normative validator behavior changed.
- Schemas: OpenAPI/report schema changed; ETSI XSD bundles unchanged.
- Reports: JSON and Markdown now render the same isolated profile findings.
- Fixtures: two reduced deterministic XML fixtures added.
- Docs: README, TODO and architecture updated.
- Handoff policy: this handoff was created before the single task commit.

## Generated Result Paths

- `dist/` — intentionally uncommitted; ignored build output.
- `artifacts/handoffs/20260722_26_ts119612_reference_profiles.md` — committed;
  task handoff and validation summary.
