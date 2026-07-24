# Prompt 1 — Harmonize the four existing tools

You are working with four related Credimi Extras repositories:

1. `credimi-capture-wallet` — Node.js/TypeScript because it depends on Credo.TS
2. `eudi-conformance-atlas` — static Eleventy site
3. `eudi-conformance-evidence` — reusable Go module, CLI and web/API
4. `eudi-trust-inspector` — current Node.js/TypeScript/Fastify CLI, API and web UI

Each repo contains ./directives read all the files inside. The content is the same in all repos, so you can read it only once. 


The Trust Inspector has intentionally not yet been migrated to Go. Work with its current Node.js/TypeScript implementation. Do not port it to Go, prepare a partial Go migration, or restructure it around a hypothetical future Go implementation during this prompt. The UX harmonization must be completed against the current application first; a separate later prompt may perform the behavioural Go port.

Goal: harmonize the visual identity, navigation, OpenAPI documentation and public project links without changing protocol, conformance, evidence or trust-assessment behaviour.

## Authoritative visual assets

Each repository contains these human-supplied files:

```text
HITL/style.css
HITL/credimi_logo.svg
HITL/credimi_logo_negative.svg
```

They are authoritative copies of:

```text
eudi-conformance-atlas/src/css/style.css
https://github.com/ForkbombEu/credimi/blob/main/webapp/static/logos/credimi_logo.svg
https://github.com/ForkbombEu/credimi/blob/main/webapp/static/logos/credimi_logo_negative.svg
```

Treat all three HITL files as immutable inputs. Do not:

- choose, draw or generate another logo;
- modify, simplify, optimize, recolor, trace or rasterize either SVG;
- reconstruct the stylesheet from screenshots or design documents;
- replace the stylesheet with a generated “equivalent”;
- edit the HITL files;
- reintroduce the obsolete neubrutalist design;
- fetch runtime CSS or branding assets from a deployed website or GitHub.

For Atlas, verify that `src/css/style.css` matches `HITL/style.css`. For every application:

- install unchanged runtime copies of the stylesheet and both SVG files in the application’s normal static/embedded asset location;
- load a small application-specific stylesheet after the shared foundation;
- adapt HTML classes and structure to reuse Atlas components wherever practical;
- keep application-specific CSS limited to layouts or behaviours genuinely absent from the supplied foundation;
- do not redefine shared colors, typography, buttons, cards, badges, forms, topbar or footer merely for convenience;
- use `credimi_logo.svg` on light or neutral backgrounds;
- use `credimi_logo_negative.svg` only on dark backgrounds;
- preserve each SVG’s aspect ratio and give meaningful visible logo instances accessible text such as `alt="Credimi"`;
- use the regular `credimi_logo.svg` directly as the site favicon, served from a stable same-origin path such as `/favicon.svg`;
- add `<link rel="icon" type="image/svg+xml" href="…">` to every HTML page shell, including Stoplight documentation shells;
- do not generate an `.ico`, PNG or Apple touch icon unless an existing application demonstrably requires it.

Add tests that verify the installed runtime stylesheet and both installed runtime logos remain byte-for-byte identical to their HITL sources. Document each runtime destination and SHA-256 hash.

Remove dead Atlas stylesheet copies, large embedded CSS strings, copied/generated logos and competing design files after confirming they are unused. Do not introduce third-party font tracking.

## Stack boundaries

Preserve these architectural decisions:

- Capture Wallet stays TypeScript because of Credo.TS.
- Conformance Evidence stays a Go module with CLI and web/API adapters.
- Trust Inspector stays Node.js/TypeScript/Fastify for this work.
- Atlas stays a static Eleventy site.
- Do not add an API or OpenAPI document to Atlas.
- Do not create a shared runtime CSS, logo or asset service/package.
- Do not introduce React, Vue, Svelte, Tailwind or CSS-in-JS.
- Do not migrate between Express, Fastify, Go or another server stack.
- Do not change the public Go API of Evidence or the public TypeScript, CLI or HTTP interfaces of Trust Inspector unless fixing an objectively broken interface, and report any such change before implementing it.

Read every repository’s `AGENTS.md` and required governance files before editing.

## Phase 1: audit

Inspect all four repositories and produce a compact audit table covering:

- runtime and rendering model;
- current stylesheet sources;
- current logo and favicon assets and references;
- inline or embedded CSS;
- header and footer implementation;
- repository links;
- OpenAPI source and served routes;
- Stoplight route;
- responsive behaviour;
- stale or contradictory design instructions.

Verify known issues rather than assuming them:

- Capture Wallet previously had stale `ForkbombEu/fake-issuer` links.
- Evidence previously contained multiple Atlas stylesheet copies while using an independent runtime stylesheet.
- Trust Inspector previously embedded reduced CSS inside TypeScript.
- Atlas’s old design documentation contradicted its live stylesheet.

Continue into implementation unless an unresolved governance conflict requires human input.

## Phase 2: application shell

Give all four tools the same recognizable shell:

- the supplied Credimi logo and visual identity;
- product-specific title;
- Atlas topbar proportions and navigation treatment;
- consistent buttons, cards, forms, badges and technical output;
- consistent footer;
- correct repository link;
- responsive mobile navigation;
- visible keyboard focus;
- WCAG AA contrast;
- status information that does not rely only on color;
- working same-origin SVG favicon on every rendered HTML surface.

Use these repository URLs unless repository metadata proves otherwise:

- `https://github.com/ForkbombEu/credimi-capture-wallet`
- `https://github.com/ForkbombEu/eudi-conformance-atlas`
- `https://github.com/ForkbombEu/eudi-conformance-evidence`
- `https://github.com/ForkbombEu/eudi-trust-inspector`

Required navigation:

### Capture Wallet

- Home
- API docs → `/docs`
- OpenAPI → its canonical raw OpenAPI route
- Repository

Remove every stale `fake-issuer` link.

### Conformance Evidence

- Home
- API docs → `/docs`
- OpenAPI → `/openapi.yaml`
- Repository

Preserve the Go module, CLI, templates and embedded-assets architecture.

### Trust Inspector

- Home
- API docs → `/docs`
- OpenAPI → `/openapi.yaml`
- Repository

Preserve the current Node.js/TypeScript/Fastify architecture, CLI/core reuse, assessment logic, reports and API behaviour. Replace large embedded CSS strings with normal static assets only where needed for this UX work; do not otherwise reorganize application code.

### Conformance Atlas

Preserve its task-specific navigation, including Map, Reference and Tests where applicable. Add or preserve:

- Data/Source data
- Repository

Do not show API docs or OpenAPI links anywhere in Atlas.

The page contents do not need to become identical. Harmonize the shell and reusable components while retaining the best task-specific layouts.

## Phase 3: OpenAPI and Stoplight

For Capture Wallet, Conformance Evidence and Trust Inspector only:

- preserve OpenAPI 3.1;
- use one authoritative OpenAPI document;
- derive JSON from YAML or YAML from JSON rather than maintaining two specifications;
- document every public JSON API endpoint;
- match methods, request bodies, status codes and schemas to the implementation;
- serve a raw machine-readable document;
- render `/docs` with a consistently pinned Stoplight Elements version;
- configure same-origin Try It;
- derive public server URLs from explicit configuration or the incoming request;
- link the main UI to Stoplight and the raw document;
- give the Stoplight host page the same Credimi favicon;
- do not describe browser HTML form routes as JSON APIs;
- do not change API contracts merely to make specifications look uniform.

Atlas remains entirely outside this work.

## Phase 4: governance cleanup

Update `DESIGN.md`, `AGENTS.md`, directives and related documentation so they state:

- `HITL/style.css` is the human-provided canonical design input;
- `HITL/credimi_logo.svg` and `HITL/credimi_logo_negative.svg` are the human-provided canonical brand assets;
- where their unchanged runtime copies are installed;
- which logo is used on light and dark surfaces;
- the regular SVG is the canonical favicon;
- application-specific CSS loads after the shared foundation;
- shared component styles must not be silently redefined;
- the obsolete neubrutalist instructions no longer apply;
- updating the shared design or branding requires replacing the relevant HITL file intentionally and synchronizing its runtime copy.

Do not leave contradictory instructions in the repositories.

## Phase 5: validation

Add or update proportionate tests for:

- main page availability;
- correct repository URLs;
- required navigation;
- absence of `fake-issuer` links;
- byte equality between all three HITL assets and their installed runtime copies;
- successful delivery and correct content type of the two SVG logos and favicon;
- every HTML page shell containing a valid same-origin SVG favicon link;
- visible header/footer logo references resolving successfully;
- `/docs` in the three API applications;
- OpenAPI version and content type;
- implemented API routes appearing in OpenAPI;
- Atlas having no OpenAPI or Stoplight artifact;
- successful builds;
- existing protocol and application regression suites.

Visually inspect:

- approximately 1440 px desktop;
- approximately 768 px tablet;
- approximately 390 px mobile;
- each main page;
- a representative operational/result page;
- Stoplight in all three API applications;
- regular and negative logos against their actual backgrounds;
- favicon presence in the browser tab.

Fix clipping, stretched logos, missing assets, overflow, inaccessible focus and unreadable status states. Do not chase pixel identity for application-specific content.

Run each repository’s required format, lint, test and build commands.

Do not push or deploy.

## Non-goals

Do not alter:

- OpenID4VCI or OpenID4VP behaviour;
- cryptographic or trust logic;
- conformance assessment semantics;
- evidence or report schemas;
- Atlas source-of-truth data;
- Evidence’s public Go module behaviour;
- Trust Inspector’s public TypeScript, CLI and HTTP behaviour;
- CLI flags or exit semantics;
- API contracts;
- unrelated dependencies.

Do not migrate Trust Inspector to Go in this prompt.

Do not modify any supplied conformance source-of-truth archive.

## Handoff

Return:

1. audit table;
2. changed files grouped by repository;
3. location and SHA-256 of each installed stylesheet, logo and favicon source;
4. navigation and OpenAPI routes;
5. validation commands and results;
6. visual inspection notes;
7. remaining inconsistencies or risks;
8. commit hashes, if commits were required.

Keep the report compact and do not enumerate dependency or generated build files.
