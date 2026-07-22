# TS602-15 — core structure and syntax closure

## Task

Close the locally decidable ETSI TS 119 602 core XML/JSON structure and syntax
gaps, then advance the sequential roadmap.

## Commit

Pending at handoff creation.

## Files Changed

- `src/json/loteChecks.ts`
- `src/xml/loteMetadata.ts`
- `src/xml/ts119612Facts.ts`
- `src/standards/ts119602Entities.ts`
- `src/standards/ts119602Metadata.ts`
- `src/standards/ts119602Profiles.ts`
- `src/standards/ts119602Requirements.ts`
- `src/standards/ts119602Syntax.ts`
- `src/standards/ts119602SyntaxFindings.ts`
- `test/loteChecks.test.ts`
- `test/xmlLoteMetadata.test.ts`
- `test/ts119602Entities.test.ts`
- `test/ts119602Metadata.test.ts`
- `test/ts119602Profiles.test.ts`
- `test/ts119602Requirements.test.ts`
- `test/ts119602Syntax.test.ts`
- `README.md`
- `TODO.md`
- `docs/architecture.md`
- `artifacts/handoffs/20260722_29_ts119602_core_structure_syntax.md`

## Implementation Summary

- Added binding-neutral structure evidence and exact JSON object/array and XML
  direct-child/cardinality/order checks for entity, service, information and
  address containers.
- Removed descendant searches as proof of the XML entity/service structure.
- Preserved language tags on `TEInformationURI` and validated its English
  coverage, multilingual values and every RFC 3986 URI.
- Tightened postal/electronic address structure, language, required contact
  schemes and per-URI validation.
- Added local Annex B native-term transliteration validation, including the
  published `bg-Latn` and `el-Latn` tags.
- Kept dereferenced pointer content, source encoding, parser interoperability
  and authoritative name/contact claims explicitly incomplete.
- Advanced four complete local ledger families to implemented: 24 implemented,
  57 partial and 0 not implemented out of 81.
- Marked TS602-15 complete and TS602-16 as the next cross-standard task.

## Commands and Tests Run

- `npm run build`
- Focused Vitest runs for syntax, metadata, entity, profile, JSON, XML and
  alternative-binding coverage.
- `npm test` — 44 test files and 245 tests passed.
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/` — ignored TypeScript build output.
- No live network evidence, reports or fetched trusted-list artifacts were
  generated.

## Known Caveats

- `ts119602.language.annex_b` remains `not_checked` because pointed content and
  parser capability are not observable from the local LoTE alone.
- Legal/registration name matching and the operational meaning of contact
  endpoints need explicit authoritative or dereferenced evidence.
- Country identifiers for an unpinned multi-state grouping remain
  `inconclusive`, as required by the local recognition policy.
- Complete TS 119 602 conformance remains disabled.

## Follow-up Backlog

- TS602-16: close Annex D-I registration identifier, associated-body,
  certificate-purpose and remaining profile cross-field gaps.
- TS602-17 through TS602-20 remain sequenced in `TODO.md`.

## Surface Changes

- CLI/API/OpenAPI: no option, endpoint or schema change; shared findings become
  more precise through existing report contracts.
- Validators: core XML/JSON structure, address, URI, multilingual and local
  Annex B transliteration checks changed.
- Schemas: pinned ETSI schemas are unchanged.
- Reports: one new stable finding, `ts119602.language.transliteration`, is
  emitted in JSON and the derived Markdown report.
- Fixtures: existing fixtures were reused; focused mutations cover new
  negative cases.
- Docs: README, architecture and TODO roadmap updated.
- Handoff policy: this handoff was created before the single task commit.

## Generated Result Paths

- `dist/` — intentionally uncommitted; ignored TypeScript build output.
- `artifacts/handoffs/20260722_29_ts119602_core_structure_syntax.md` — committed;
  task handoff and validation summary.
