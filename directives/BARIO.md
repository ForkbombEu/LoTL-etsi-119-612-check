# BARIO.md

This file defines how work is done in this repository. As per BARIO wishes.

It is the canonical source of truth for agents, assistants, humans, automation, and future maintainers.

If another instruction conflicts with this file:

→ STOP  
→ surface the conflict

---

## Enforcement Model

All rules in this document are mandatory unless explicitly stated otherwise.

If a rule is violated:

→ the task is considered incomplete  
→ the agent MUST correct it before finishing

Agents MUST NOT:

- ignore rules because they were not explicitly mentioned in the prompt
- assume rules are optional

---

## Prime Directive

Do not behave like a generic coding agent.

This repository expects opinionated, deterministic, reproducible engineering.

Prefer:

- clarity over cleverness
- explicitness over magic
- small steps over huge rewrites
- working code over speculative architecture
- tests over promises
- boring, maintainable solutions over fashionable abstractions

---

## Agent Boot Sequence

Before modifying anything:

1. Read `BARIO.md`
2. Inspect repository structure
3. Do NOT infer or adopt undocumented conventions
4. If a convention is observed but not defined in BARIO.md:
   → record it in `HITL.md`
5. Proceed using ONLY known rules from BARIO.md
6. Make the smallest safe change
7. Validate the change

Skipping any step is a failure.

---

## Default Expectations

Unless explicitly forbidden, every task MUST:

- produce a complete, runnable project
- include tests for core behavior
- include `mise.toml` with pinned Go version
- include `task = "latest"` in `mise.toml`
- include `Taskfile.yml`
- initialize git when creating projects
- create at least one valid commit
- leave the repository in a clean state

These requirements apply even if not mentioned in the prompt.

---

## Git Behavior

Agents MUST NOT push.

```sh
git push
```

is forbidden unless explicitly requested.

Before every commit, agents MUST run formatting and linting.

Required pre-commit validation:

```sh
task lint
```

Formatting MUST also be run through the repository-defined formatter before committing.

If the repository has no formatting task or formatter defined:

→ STOP

→ append the missing formatting rule to `HITL.md`

→ do NOT commit

If formatting or linting fails:

→ STOP

→ fix the issue

→ rerun formatting and linting

→ do NOT commit until both pass

A commit made without successful formatting and linting:

→ FAILURE

---

## Secrets And Ignore Files

Agents MUST NEVER commit secrets or sensitive data.

Sensitive data includes, but is not limited to:

- `.env`
- `.env.*`
- API keys
- access tokens
- private keys
- certificates
- credentials
- database dumps
- production configuration
- local machine paths containing secrets

Every new project MUST include a secure-by-default `.gitignore` before the first commit.

The `.gitignore` MUST ignore:

- environment files
- secret files
- private keys and certificates
- dependency directories
- build outputs
- logs
- caches
- editor and operating-system files
- local database files
- generated coverage artifacts

Before every commit, agents MUST inspect staged files for secrets and sensitive data.

If a secret or sensitive file is found staged:

→ STOP

→ unstage it

→ add or fix `.gitignore`

→ report the issue

→ do NOT commit until corrected

---

### Required Git State

A valid project MUST have:

- `.git` initialized
- files staged
- at least one commit

If missing:

→ FAILURE

---

### Commit Requirement

All commits MUST follow:

- Conventional Commits
- include `reason` and `prompt`

A repository without commits when expected:

→ FAILURE

---

## Commit Style

### Format

```text
<type>(<scope>): <subject>

reason:
<why>

prompt:
<short intent>
```

---

### Rules

- subject MUST be imperative, concise, lowercase
- MUST include `reason` and `prompt`
- MUST NOT describe the diff
- MUST explain intent

---

### Constraints

- reason: max 3 lines
- prompt: max 2 lines

---

### Failure Conditions

A commit is invalid if:

- missing `reason` or `prompt`
- describes only changes
- lacks intent

---

## Mandatory Project Skeleton (Go)

Every Go project MUST include:

```text
go.mod
mise.toml
Taskfile.yml
main.go
main_test.go
```

Absence of any:

→ FAILURE

---

## Go Toolchain

`mise.toml` MUST define Go version and Task:

```toml
[tools]
go = "1.26.2"
task = "latest"
```

If `task lint:design` cannot run because `task` is not installed:

→ mise is not being used yet

→ `mise.toml` MUST include `task = "latest"`

→ the task remains incomplete until corrected

---

## Taskfile

`Taskfile.yml` MUST include:

```yaml
version: "3"

tasks:
  test:
    cmds:
      - go test ./...

  lint:
    cmds:
      - task lint:design

  run:
    cmds:
      - go run .

  build:
    cmds:
      - go build -o bin/starter .
```

---

## Design Source



If `DESIGN.md` is present:

→ it is the source of truth for design

→ agents MUST follow it

→ `mise.toml` MUST include `node = "latest"`

→ agents MUST validate it through `task lint`

→ `task lint` MUST run `task lint:design`

→ `task lint:design` MUST run `npx --yes @google/design.md lint DESIGN.md`


---

## Testing Requirement

All executable code MUST have tests.

A task is incomplete if:

- no tests exist
- tests do not cover core behavior

---

## Repository Cleanliness

Forbidden:

- binaries in repo root
- logs
- temp folders
- test artifacts

Before completion:

```sh
git status --short
```

must be clean or explained.

---

## Engineering Style

Prefer:

- standard library
- small interfaces
- explicit errors
- deterministic behavior

Avoid:

- unnecessary dependencies
- magic
- over-engineering

---

## Planning Policy

Large tasks MUST be broken down.

Agents MUST:

- stop on oversized tasks
- propose phases
- agree before changing direction

---

## CLI Identity / ASCII Art

CLI tools MUST include ASCII art header.

Missing ASCII art:

→ FAILURE

---

## Web Identity / Console Signature

Web apps MUST include styled console signature.

Missing console identity:

→ FAILURE

## Required Developer Tools

If a repository requires a command to operate, that command MUST be declared in `mise.toml`.

A tool is required if it is used by:

- `Taskfile.yml`
- tests
- build commands
- lint commands
- release commands
- validation instructions

Missing required tools in `mise.toml`:

→ FAILURE

---

## Standard Go mise.toml

Every Go project using `Taskfile.yml` MUST declare both Go and Task:

```toml
[tools]
go = "1.26.2"
task = "latest"
```

Agents MUST NOT create Taskfile.yml without also declaring task in mise.toml.

Then your `mise install` should actually install Task, and:

```sh
mise exec -- task -a
```

should work even if your shell PATH is not reloaded.

## README.md updates 

After each development task and before each commit, the README.md should be updated. If the README.md is obsolete or empty, re-write it from scratch. README.md should contain the sections: 
- Intro: explains what the app does. It will a one-liner and a short description first of the main problems the app try to solve (but only if those are known and clear) and then the main functionalities. 
- Technical specs: list the programming languages and frameworks used and describe the main software components and libraries used in the project, but only include specific, noteworthy and non-obvious libraries, e.g. Credo.TS. Do not include any commonly used or basic libraries. 
- HOW to run: basic info about how build and run the app locally
- Quick GUI guide (if applicable): Organize this in subchapters. Describe what the GUI offers, what can be see on the homepage, how to perform actions that are related to the main functionalities of the app
- CLI Examples (if applicable): a Table listing all the CLI functions, with one example per functionalities
- API Examples (if applicable): a Table listing all the API functions, with one curl example per API
  