# Prompt 01 — Baseline Inventory and Architecture Map Handoff

## Task / Prompt Name

Prompt 01 — Baseline inventory and architecture map.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `docs/architecture.md`
- `docs/glossary.md`
- `README.md`
- `artifacts/handoffs/20260717_prompt-01_baseline-inventory-architecture-map.md`

## Commands / Tests Run

- Repository inventory with `rg --files` and source/test/README inspection.
- `npm test`
- `npm run build`

## Generated Artifacts Intentionally Not Committed

- `dist/`: TypeScript build output.

## Known Caveats

- The architecture map documents the current repository, which already includes API and report-classification capabilities beyond the original narrow CLI description.
- Access CA, RPAC/WRPAC chain, registration evidence, and FCAF readiness are target-stage concepts only; no runtime behavior was added for them.

## Follow-up Backlog Items

- Add named EUDI RI and WE BUILD reference-source support as a later, explicit implementation prompt.
- Add EUDI trust-role and RPAC/WRPAC chain assessment only with deterministic fixtures and explicit trust-anchor rules.
- Add FCAF `trusted_authorities` fixture-readiness mapping after role and chain evidence exist.

## Change Matrix

- CLI changed: no
- API changed: no
- OpenAPI changed: no
- Validators changed: no
- Schemas changed: no
- Reports changed: no
- Fixtures changed: no
- Documentation changed: yes

## Generated Result Paths

- `dist/` (not committed): TypeScript build output produced by `npm run build`.
