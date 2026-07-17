# Node `crypto.X509Certificate` migration

- Commit: pending at handoff creation.
- Files changed: X.509 parsing and chain assessment runtime code, certificate/chain tests, and package dependency lockfiles.
- Commands/tests run: `npm uninstall node-forge @types/node-forge`, `npm test`, `npm run build`, `git diff --check`.
- Generated artifacts intentionally not committed: none.
- Scope: certificate parser and certificate-chain verifier now use Node's built-in `crypto.X509Certificate`; `node-forge` and its types were removed.
- Known caveats: Node exposes extended key usage through `X509Certificate.keyUsage`, but does not expose the full standard key-usage bit set used by the former library. That check remains explicitly `not_checked` when no standard key-usage evidence is available. Revocation remains `not_checked`.
- Follow-up backlog: none requested.
