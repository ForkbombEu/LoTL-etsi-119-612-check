# HITL.md

## ⚠️ Human In The Loop

This file contains observations that require human validation.

It is a controlled buffer between:

- agent discovery
- human decision
- doctrine (`BARIO.md`)

---

## Rules

- entries are NOT authoritative
- entries MUST NOT influence agent decisions
- this file is **write-only for agents**
- only humans may promote entries into `BARIO.md`

Agents MUST:

- append new valid observations
- NEVER modify or delete existing entries
- keep entries minimal and factual

---

## Constraints

Only add an entry if:

- the pattern appears at least twice
- it may impact architecture, naming, or workflow

If unsure:

→ DO NOT add  
→ DO NOT assume

---

## Entry Template

- id: hitl-XXXX
- observation:
- location:
- evidence:
- rationale:

---

## Entries

- id: hitl-0001
- observation: Required validation tooling is missing for pre-commit checks.
- location: repository root
- evidence: `task lint` fails with `task: command not found`; `Taskfile.yml` and `mise.toml` are absent.
- rationale: `BARIO.md` requires formatting and linting before commits, with required tools declared in `mise.toml`.

- id: hitl-0002
- observation: Repository formatting rule is missing.
- location: repository root
- evidence: `Taskfile.yml` defines `lint` and `lint:design`, but no formatting task or formatter is defined.
- rationale: `BARIO.md` requires formatting through a repository-defined formatter before commits.
