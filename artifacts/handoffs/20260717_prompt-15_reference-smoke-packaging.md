# Prompt 15 — Optional live smoke runner and artifact packaging

- Commit: pending at handoff creation.
- Files changed: timestamped smoke runner, scoped review-packaging script, package scripts, README usage, and non-network script tests.
- Commands/tests run: `bash -n scripts/optional/run-reference-smoke.sh scripts/optional/package-reference-smoke.sh`, `npm test`, `npm run build`, `git diff --check`.
- Generated artifacts intentionally not committed: none; no live smoke was run.
- Generated result paths: `artifacts/reference-smoke/<source-name>/<timestamp>/` (ignored; optional smoke reports and fetched evidence) and `artifacts/reference-smoke/<source-name>/<timestamp>-review.zip` (ignored; contains only that timestamped directory).
- Scope: optional scripts, package commands, README, and tests changed. Normal tests do not run the live smoke scripts.
- Known caveats: a live run requires network access to the selected reference source; packaging requires the local `zip` command and refuses to overwrite an existing archive.
- Follow-up backlog: no further planned development prompts remain.
