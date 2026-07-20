# TS 119 602 conformance gap report

## Task

Review ETSI TS 119 602 V1.1.1 closely, compare its core clauses, bindings, and
Annex D-I profiles with the current implementation, and write a prioritized
completeness report in `TODO.md`.

## Commit

Pending at handoff creation.

## Files Changed

- `TODO.md`

## Commands and Tests

- Inspected the current XML LoTE, JSON LoTE, XMLDSig/xmlsec1, XSD, report,
  artifact-classification, and WE BUILD profile implementation.
- Downloaded and extracted the authoritative ETSI TS 119 602 V1.1.1 PDF for
  clause-by-clause review.
- Inspected the ETSI binding repository tree and official v1.1.1 JSON schemas
  through the read-only GitLab API.
- Visually checked published profile tables where text extraction could hide
  table boundaries.
- `git diff --check`
- Automated code tests were not run because this task changes documentation
  only.

## Generated Result Paths

- `TODO.md` — committed TS 119 602 completeness and implementation-priority
  report.
- `artifacts/handoffs/20260720_07_ts119602_conformance_gap_report.md` —
  committed handoff for this change.
- `/tmp/ts_119602v010101p.pdf` — intentionally uncommitted authoritative
  research input.
- `/tmp/ts_119602v010101p.txt` — intentionally uncommitted extracted research
  text.
- `/tmp/ts119602-page64.png` — intentionally uncommitted table-inspection
  image.

## Generated Artifacts Not Committed

- `/tmp/ts_119602v010101p.pdf`
- `/tmp/ts_119602v010101p.txt`
- `/tmp/ts119602-page64.png`

## Known Caveats

- The maturity percentages in `TODO.md` are explicitly non-normative planning
  estimates. A formal coverage percentage requires the proposed normative
  requirements ledger.
- Complete JAdES and XAdES validation also requires detailed requirement
  mapping against ETSI TS 119 182-1 and ETSI EN 319 132-1 respectively.
- Contextual and legal-semantic requirements may remain inconclusive without
  prior list versions, dereferenced resources, or authoritative external
  evidence.
- The report records apparent conflicts in the published PDF/schema and does
  not silently select convenience corrections.

## Follow-up Backlog

- Begin Phase 1 from `TODO.md`: add a first-class TS 119 602 result model and
  a clause/profile requirements ledger.
- Pin the official v1.1.1 JSON/XSD binding bundle and checksums before
  implementing profile validators.

## Change Scope

- TODO documentation and handoff policy output changed.
- CLI, API, OpenAPI, validators, schemas, reports, fixtures, tests, and runtime
  behavior were not changed.
