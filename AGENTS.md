# AGENTS.md

## eudi-trust-infrastructure-audit
Version: 1.1

# Purpose

This repository builds a deterministic TypeScript/Node.js audit tool for EUDI and WE BUILD trust-infrastructure artifacts.

The current repository name may mention ETSI TS 119 612, but the project scope is broader:

- ETSI TS 119 612 XML Trusted Lists / LoTLs;
- ETSI TS 119 602-style JSON/XML LoTE artifacts, where applicable;
- WE BUILD WP4 LoTL/LoTE profiles;
- EUDI Reference Implementation trusted-list fixtures;
- Wallet / Verifier trust-chain test-readiness checks for FCAF-style wallet testing.

The canonical product artifact is an assessment result:

- a machine-readable JSON report;
- a human-readable Markdown report;
- optional fetched evidence artifacts;
- optional API/OpenAPI responses when API functionality is present.

The project is **not** a general-purpose PKI stack.
The project is **not** a legal conformance authority.
The project is **not** an ETSI replacement.
The project is an evidence-oriented assessment utility for trust-list structure, signatures, profiles, trust anchors, certificate chains, and machine-readable audit output.

---

# Prime Directive

The human owns the assessment scope.

The AI proposes implementation changes.

The human approves them.

The AI must never silently expand the tool into a broader certification engine, trust framework, or undocumented policy interpreter.

When standards or EUDI profiles are ambiguous, the tool must report ambiguity explicitly instead of inventing normative behavior.

---

# First-Class Reference Inputs

The following EUDI / WE BUILD resources are first-class citizens in design, tests, documentation, and manual smoke checks:

- EUDI RI Trusted List Provider hosted list service: `https://trustedlist.serviceproviders.eudiw.dev/`
- EUDI RI RP Registration Service / guide: `https://registry.serviceproviders.eudiw.dev/guide`
- WE BUILD WP4 LoTL JSON: `https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.json`
- WE BUILD WP4 LoTL XML: `https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.xml`

The hosted EUDI RI Trusted List Provider is a reference/testing input, not a production trust source unless explicitly configured as such by the human.

Tests must not depend on live network by default. If live reference-service checks are added, they must be optional/manual and must write outputs under an ignored artifact directory.

---

# Source of Truth

1. `src/` implementation
2. `test/` fixtures and tests
3. `README.md`
4. `AGENTS.md`
5. OpenAPI specification, when API functionality is present
6. Durable docs under `docs/`, when added

When sources disagree, prefer executable tests and deterministic fixtures over prose.

When the standard/profile is ambiguous, report the ambiguity explicitly instead of inventing normative behavior.

---

# Engineering Principles

Prefer:

- deterministic output;
- explicit data structures;
- stable JSON report schemas;
- small, reversible patches;
- validation before completion;
- evidence-backed findings;
- clear distinction between parsed facts, inferred checks, and unsupported claims;
- offline-capable checks where feasible;
- explicit artifact classification before applying conformance checks.

Avoid:

- hidden magic;
- lossy conversions;
- destructive rewrites;
- broad refactors without need;
- network-only tests;
- vague “invalid” or “non-conformant” messages without evidence;
- overstating ETSI, EUDI, WE BUILD, or legal conformance.

---

# EUDI Trust Model Doctrine

Do not confuse end-entity relying-party certificates with trusted-list trust anchors.

The expected EUDI relying-party authentication model is:

```text
LoTL / common trust infrastructure
  -> Trusted List or LoTE for Access Certificate Authorities
      -> Access CA trust anchor
          -> Relying Party Instance access certificate / RPAC / WRPAC
              -> OpenID4VP or ISO mdoc request signed by the Relying Party Instance
```

Rules:

- A Relying Party Instance access certificate is normally carried in the presentation request, together with intermediate certificates up to but excluding the trust anchor.
- The trust anchor used to validate that certificate chain is obtained from the relevant Trusted List or LoTE.
- The tool must not assume that individual Relying Party end-entity certificates are directly listed as trust anchors unless a fixture explicitly models that as an experimental or negative case.
- Access CA trust anchors, Registration Certificate Provider trust anchors, Wallet Provider trust anchors, PID Provider trust anchors, and Attestation Provider trust anchors must be classified by role/list type before validation.
- Registration certificates and access certificates are related but distinct. Access certificates authenticate the technical party/instance. Registration certificates or registrar data describe registered attributes, intended uses, and policy/entitlement information.

---

# Conformance Doctrine

The tool must distinguish artifact type before applying checks.

Do not assess all artifacts as ETSI TS 119 612.

Rules:

- XML `TrustServiceStatusList` artifacts may be assessed against ETSI TS 119 612-style checks.
- JSON LoTE/LoTL artifacts are not ETSI TS 119 612 XML artifacts and must be reported as `not_applicable` for TS 119 612.
- JSON LoTE/LoTL artifacts may be assessed under JSON LoTE / ETSI TS 119 602 / WE BUILD profile checks only when such checks are implemented explicitly.
- Plain XMLDSig presence is not the same as full XAdES or full ETSI profile conformance.
- Schema validation, signature validation, semantic validation, profile validation, certificate validity, and trust-chain usability are separate results.

Never write “fully conformant” unless all relevant implemented checks pass and the report clearly states the limits of the implemented checks.

---

# Repository Architecture

Target architecture:

```text
Input source
   ├── LoTL JSON URL/file
   ├── LoTL XML URL/file
   ├── single TL/LoTE URL/file
   ├── RPAC / certificate chain material
   └── FCAF fixture bundle
        │
Input loader
        │
Artifact classifier
        ├── TS 119 612 XML TSL/LoTL assessor
        ├── TS 119 602 / JSON LoTE assessor
        ├── WE BUILD profile assessor
        ├── EUDI RI TLP fixture assessor
        ├── certificate / chain assessor
        └── FCAF trust-fixture readiness assessor
        │
Audit report builder
        ├── JSON report
        ├── Markdown report
        └── optional API/OpenAPI response
```

The parser and report builder must preserve enough original evidence to explain each finding.

Round-tripping is not required, but report schema stability is required.

---

# Report Contract

Every assessment finding must include:

- a stable check ID;
- category;
- status;
- severity;
- message;
- evidence, when available;
- artifact applicability, where relevant.

The machine-readable JSON report is the primary integration surface.
The Markdown report is a readable rendering of the same assessment data.

Do not add Markdown-only findings that are absent from the JSON report.

Report terminology must distinguish:

- `pass`
- `fail`
- `warn`
- `not_applicable`
- `not_checked`
- `unsupported`
- `inconclusive`

---

# API Contract

When HTTP APIs are present:

- every assessment operation must be available through a POST endpoint;
- every endpoint must be described in OpenAPI;
- every response must use stable JSON schemas;
- Markdown output may be included as a string or returned through a dedicated report endpoint;
- API behavior must match CLI behavior unless explicitly documented;
- API implementation must reuse core assessment functions, not shell out to the CLI;
- OpenAPI examples must be executable and reflect real schema fields;
- the OpenAPI web UI should use Stoplight Elements unless the human selects another renderer.

The OpenAPI document is source, not generated decoration. Keep it in sync with implementation and tests.

---

# Input Doctrine

Supported input forms should be explicit:

- local file path for CLI;
- URL for CLI/API;
- raw JSON object or JSON string for API;
- raw XML string for API;
- certificate PEM/DER/base64/x5c for certificate or chain assessment;
- fetched artifact references only when the fetch operation is part of the audit.

Do not guess input type from unsafe assumptions when the caller supplies an explicit mode.

All fetched URLs must observe timeout and concurrency limits.

---

# Network Doctrine

Network activity must be bounded and explainable.

- Respect configured timeout.
- Respect configured concurrency.
- Capture HTTP status, final URL, content type, byte length, hash, and error details.
- Do not make hidden secondary network calls except documented schema/signature dependencies.
- Tests must mock network by default.
- Live checks against `trustedlist.serviceproviders.eudiw.dev`, `registry.serviceproviders.eudiw.dev`, or WE BUILD URLs must be optional/manual.

---

# Signature and Certificate Doctrine

Signature and certificate checks are evidence checks, not magic trust decisions.

For each signature/certificate finding, report:

- whether material is present;
- whether it parses;
- subject, issuer, serial, validity period, and SHA-256 fingerprint when available;
- whether cryptographic verification was attempted;
- verification result or reason it was not checked.

Do not treat an embedded signing certificate as inherently trusted unless the implemented trust model validates it against an explicit anchor or trust list.

For Relying Party / Verifier tests, model the certificate chain explicitly:

```text
RPAC / WRPAC end-entity certificate
  -> optional intermediate CA certificates
      -> Access CA trust anchor from TL/LoTE
```

---

# Error Doctrine

Failures must be actionable.

Prefer:

```text
structure.scheme_information.missing: SchemeInformation element is missing.
```

Avoid:

```text
Invalid XML.
```

If a check is not implemented, report `not_checked`.
If a check is outside the artifact type, report `not_applicable`.
If a check fails due to unsupported library behavior, report the limitation precisely.

---

# Coding Guidelines

Preferred language:

TypeScript on Node.js 20+.

Reasons:

- integration with Credimi and web/API services;
- strong JSON tooling;
- good CLI and HTTP ecosystem;
- suitable for CI and automation.

Use explicit TypeScript types for public report objects, API request/response bodies, and durable schemas.

Avoid `any` in new public interfaces unless there is a justified compatibility boundary.

---

# Testing Policy

Every non-trivial change needs tests.

Required test categories, where applicable:

- input loading tests;
- LoTL pointer parsing tests;
- artifact detection tests;
- XML structure checks;
- JSON LoTE checks;
- WE BUILD profile checks;
- EUDI RI TLP fixture checks;
- certificate and chain validation tests;
- FCAF fixture-readiness tests;
- report rendering tests;
- API route tests;
- OpenAPI contract tests;
- invalid-input tests;
- network failure tests using mocked fetches.

Tests must not depend on live network unless placed in an explicit optional/manual test path.

---

# Fixture Doctrine

Fixtures are canonical examples.

Use small, deterministic fixtures for:

- minimal LoTL JSON;
- JSON LoTE;
- valid-ish XML TSL;
- XML LoTL-like artifact;
- malformed XML;
- XML missing mandatory sections;
- HTML error page;
- unreachable/fetch-failure mocks;
- RPAC / WRPAC certificate chain positive and negative cases;
- Access CA trust-anchor positive and negative cases.

When documentation and fixtures disagree, either update the fixture intentionally or document why the fixture models a specific edge case.

Do not commit large live TL snapshots unless intentionally curated as small test fixtures.

---

# Repository Layout and Hygiene

Expected layout:

```text
src/              committed application/library code
src/xml/          XML parsing, XPath, TS 119 612 checks, signature and XSD helpers
src/json/         JSON LoTE / TS 119 602-style checks
src/eudi/         EUDI role semantics, Access CA/RPAC chain helpers
src/fcaf/         FCAF fixture-readiness and trusted_authorities helpers
src/report/       JSON and Markdown report renderers
src/api/          HTTP API server, routes, OpenAPI serving, docs UI when present
test/             committed automated tests
test/fixtures/    small deterministic test fixtures
docs/             durable documentation
scripts/          reusable automation
artifacts/        generated outputs, ignored except selected handoffs
```

Do not commit:

- generated audit outputs;
- fetched live trusted-list artifacts unless they are intentional small fixtures;
- `dist/` unless the project explicitly changes distribution policy;
- `node_modules/`;
- caches;
- local `.env` files;
- secrets;
- temporary debugging files.

---

# Repository Command Conventions

Use package scripts when available:

```bash
npm test
npm run build
```

Add new durable commands to `package.json` scripts.

Shell scripts must fail fast:

```bash
set -euo pipefail
```

Do not use `/tmp` for project artifacts when a repository-local ignored `artifacts/` directory is more reviewable.

---

# Git / Commit Discipline

After completing each Codex prompt, make exactly one Git commit for that prompt unless the human explicitly asks not to commit.

Commit only files strictly required for the requested implementation.

Allowed in commits:

- TypeScript source required by runtime;
- tests and small fixtures;
- package/config files required by runtime, build, or test;
- OpenAPI specifications required by API/docs;
- user-facing documentation when explicitly requested;
- handoff notes required by this file.

Do not commit:

- generated reports;
- fetched live artifacts produced by local runs;
- build output such as `dist/` unless explicitly required;
- `node_modules/`;
- temporary scripts created only for local debugging;
- caches and machine-local logs.

Do not use broad staging commands such as:

```bash
git add .
git add -A
```

Stage paths intentionally.

---

# Codex Task Handoff Log

After every Codex task, write or update a concise Markdown handoff note before committing.

Use this path and filename style:

```text
artifacts/handoffs/YYYYMMDD_prompt-id_short-slug.md
```

Example:

```text
artifacts/handoffs/20260717_03_ts119602_lote_checks.md
```

Each handoff must include:

- task or prompt name;
- commit hash, if available;
- files changed;
- commands/tests run;
- generated artifacts intentionally not committed;
- known caveats;
- follow-up backlog items;
- whether CLI, API, OpenAPI, validators, schemas, reports, fixtures, docs, or handoff policy were changed.

Do not commit handoffs that contain secrets, large logs, generated report bodies, fetched live data dumps, or machine-local noise.

Promote durable design decisions into source, tests, `README.md`, OpenAPI schemas, or docs. Do not leave important decisions only in handoff notes.

---

# Generated Result Reporting

Every Codex task that creates generated artifacts must report them compactly.

Every handoff must include a section named:

```markdown
## Generated Result Paths
```

List:

- each generated result directory;
- important standalone generated files not inside a listed directory;
- whether each path is committed or intentionally uncommitted;
- a short description of what each path contains.

Compact-path rule:

- when many generated files are grouped inside one directory, list the directory once;
- do not enumerate every file in a large result directory;
- prefer the narrowest useful directory path.

Packaging rule:

- include only artifacts relevant to the current prompt;
- do not include repository snapshots, `node_modules`, caches, or unrelated previous outputs;
- report archive paths explicitly if review packages are created.

---

# Final Codex Output

At the end of every Codex run, print a concise summary:

```text
Commit: <hash or none>
Changed files:
- ...
Tests run:
- ...
Generated artifacts not committed:
- ...
Known caveats:
- ...
Handoff:
- artifacts/handoffs/<file>.md
Next recommended task:
- ...
```

Do not print hundreds of generated filenames to the terminal.
