# Prompt 09 — EUDI Trust-Role Model and Access CA/RPAC Chain Assessment Handoff

## Task / Prompt Name

Prompt 09 — EUDI trust-role model and Access CA/RPAC chain assessment.

## Commit Hash

Pending at handoff creation.

## Files Changed

- `src/eudi/roles.ts`
- `src/eudi/certificateChain.ts`
- `test/certificateChain.test.ts`
- `README.md`
- `artifacts/handoffs/20260717_prompt-09_eudi-rpac-chain-assessment.md`

## Commands / Tests Run

- `npm test`
- `npm run build`
- `git diff --check`

## Generated Artifacts Intentionally Not Committed

- `dist/`: TypeScript build output.

## Known Caveats

- The chain assessor is an explicit library input for PEM bundles, DER/base64 arrays, and JOSE/JWT `x5c` arrays; CLI input is addressed by a later fixture-readiness prompt.
- Trust anchors must be supplied separately (for example, after explicit TL/LoTE extraction). The RPAC/WRPAC leaf is always reported as an end-entity and never promoted to a trust anchor.
- Revocation is intentionally `not_checked`; no CRL or OCSP network calls are made.
- Trust-anchor evidence proves only a match against supplied anchors, not a full trust-list policy decision.

## Follow-up Backlog Items

- Add audited-bundle trust-anchor extraction and RPAC-chain CLI input in the fixture-readiness prompt.
- Add API exposure only with the dedicated API/OpenAPI prompt and stable schemas.
- Add policy-specific EKU/key-usage requirements only when a selected EUDI profile supplies them.

## Change Matrix

- CLI changed: no
- API changed: no
- OpenAPI changed: no
- Validators changed: yes, EUDI certificate-chain and role evidence checks
- Schemas changed: no
- Reports changed: standalone chain assessment result contract added; main LoTL report unchanged
- Fixtures changed: generated in deterministic test setup
- Documentation changed: yes

## Generated Result Paths

- `dist/` (not committed): TypeScript build output produced by `npm run build`.
