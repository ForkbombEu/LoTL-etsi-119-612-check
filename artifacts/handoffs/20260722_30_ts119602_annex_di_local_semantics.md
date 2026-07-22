# TS602-16 — Annex D-I local semantics

## Task

Close the locally decidable ETSI TS 119 602 Annex D-I registration-identifier,
associated-body, certificate-purpose and profile cross-field gaps.

## Commit

Pending at handoff creation.

## Files Changed

- `src/standards/ts119602Profiles.ts`
- `test/ts119602Profiles.test.ts`
- `test/fixtures/ts119602-wallet-profile.json`
- `README.md`
- `TODO.md`
- `artifacts/handoffs/20260722_30_ts119602_annex_di_local_semantics.md`

## Implementation Summary

- Validated locally asserted ETSI EN 319 412-1-style registration identifiers,
  including country-code policy, without claiming an official-record match.
- Compared asserted registration identifiers with certificate
  `organizationIdentifier` or `serialNumber` subject attributes where Annex
  D, E or I requires certified identity consistency.
- Included recognized associated-body extension payload validity in Annex D/E
  profile results while retaining external responsibility evidence as
  unchecked.
- Added certificate BasicConstraints and DER KeyUsage evidence. WRPAC/WRPRC
  service identities must be CA-capable certificate issuers; the other
  profiles apply signing/sealing or permitted Pub-EAA CA purpose rules.
- Corrected Annex country-role and Pub-EAA law-reference checks to use EU
  Member State codes under the TS 119 602 `EL` exception.
- Kept authoritative registration, associated-body role, certificate policy,
  chain and revocation conclusions outside local syntax checks.
- Marked TS602-16 complete and advanced TS602-17 as the next task.

## Commands and Tests Run

- `pnpm test` — 44 test files and 248 tests passed.
- `pnpm run build`
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/` — ignored TypeScript build output.
- No live network evidence, fetched lists or generated audit reports were
  created.

## Known Caveats

- Official registration existence and identifier ownership cannot be inferred
  from a local LoTE and remain contextual.
- Associated-body responsibility requires explicit external role evidence.
- BasicConstraints and KeyUsage establish local certificate capability only;
  certificate policies, path trust and revocation remain separate.
- Complete TS 119 602 conformance remains disabled.

## Follow-up Backlog

- TS602-17: compare certificate, public-key and SKI identity forms and use all
  supported pointer identities with explicit chain/revocation trust inputs.
- TS602-18 through TS602-20 remain sequenced in `TODO.md`.

## Surface Changes

- CLI/API/OpenAPI: no option, endpoint or schema change; shared profile finding
  evidence is more precise through the existing report contract.
- Validators: Annex D-I registration, associated-body, country/law,
  certificate-purpose and identity cross-field rules changed.
- Schemas: pinned ETSI schemas are unchanged.
- Reports: existing stable Annex profile findings now include the new local
  evidence; no report-schema version change was required.
- Fixtures: the schema-valid wallet fixture no longer asserts a registration
  identifier that its test certificate does not contain.
- Docs: README and TODO roadmap updated.
- Handoff policy: this handoff was created before the single task commit.

## Generated Result Paths

- `dist/` — intentionally uncommitted; ignored TypeScript build output.
- `artifacts/handoffs/20260722_30_ts119602_annex_di_local_semantics.md` —
  committed; task handoff and validation summary.
