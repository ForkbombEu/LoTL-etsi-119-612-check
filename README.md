# WE BUILD TL Audit

TypeScript/Node.js CLI and HTTP API for auditing trusted-list pointers in a WE BUILD WP4 `list_of_trusted_lists.json`.

Repository orientation:

- [Current and target architecture](docs/architecture.md)
- [Trust-infrastructure glossary](docs/glossary.md)
- [EUDI trust model](docs/eudi-trust-model.md)
- [Credimi / Reference Wallet / Verifier workflow](docs/credimi-reference-wallet-workflow.md)

The tool reads:

```ts
LoTE.ListAndSchemeInformation.PointersToOtherLoTE[]
```

For each `LoTELocation`, it can fetch the artifact, detect XML/JSON/HTML/empty/unknown content, run best-effort ETSI TS 119 612 checks for XML Trusted Lists, and return both a machine-readable JSON report and a Markdown report.

## Install

```bash
npm install
npm run build
```

Node.js 20 or newer is required.

Cryptographic XMLDSig verification also requires the `xmlsec1` executable on
`PATH`. On Debian/Ubuntu, the repository's `.mise.toml` declares it as a Mise
bootstrap package, so the complete development environment can be installed
with:

```bash
mise bootstrap
```

Without Mise, install it directly:

```bash
sudo apt-get install xmlsec1
```

If `xmlsec1` is unavailable, the audit still runs and reports cryptographic
verification as `not_checked`; signature structure and certificate evidence
checks remain available.

## CLI examples

Local input:

```bash
node dist/cli.js \
  --input ./list_of_trusted_lists.json \
  --out-dir ./audit-output \
  --concurrency 4 \
  --timeout-ms 15000
```

URL input:

```bash
node dist/cli.js \
  --input https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.json \
  --out-dir ./audit-output
```

Named reference source:

```bash
node dist/cli.js \
  --reference-source we-build-lotl-json \
  --out-dir ./audit-output
```

Supported named sources are `eudi-ri-tlp`, `we-build-lotl-json`, and `we-build-lotl-xml`. They resolve to the EUDI RI Trusted List Provider and the WE BUILD WP4 JSON/XML LoTL URLs. They are explicit reference inputs for manual assessment, not implicit production trust roots. `--input` remains available for local paths and arbitrary URLs; it cannot be combined with `--reference-source`.

Optional live smoke checks are intentionally outside `npm test`:

```bash
npm run reference-smoke-run -- we-build-lotl-json
```

The optional runner supports `eudi-ri-tlp`, `we-build-lotl-json`, and `we-build-lotl-xml`. It builds the CLI, fetches the selected live source, and writes reports and fetched evidence to ignored `artifacts/reference-smoke/<source-name>/<timestamp>/`.

Package one completed smoke directory for review without including the repository:

```bash
npm run package-reference-smoke -- we-build-lotl-json 20260717T120000Z
```

This creates the ignored sibling archive `artifacts/reference-smoke/we-build-lotl-json/20260717T120000Z-review.zip`, containing only that timestamped smoke directory. The runner and packager are manual commands and never run from `npm test`.

With local ETSI TS 119 612 XSD and strict structural scoring:

```bash
node dist/cli.js \
  --input ./list_of_trusted_lists.json \
  --out-dir ./audit-output \
  --xsd ./schemas/19612_xsd.xsd \
  --strict
```

Parse the LoTL and list pointers without fetching referenced artifacts:

```bash
node dist/cli.js \
  --input ./list_of_trusted_lists.json \
  --out-dir ./audit-output \
  --no-fetch
```

CLI outputs:

```text
audit-output/report.md
audit-output/report.json
audit-output/fetched/<safe-file-name>.xml|json|txt
```

`audit-output/` and `tl-audit-output/` are ignored by git.

## API server

Build and run from compiled output:

```bash
npm install
npm run build
npm run api
```

Defaults:

```text
HOST=127.0.0.1
PORT=3000
```

Override example:

```bash
HOST=0.0.0.0 PORT=8080 npm run api
```

Development server:

```bash
npm run dev:api
```

Runtime config can come from shell environment or a local `.env` file. Start from `.env-example`:

```bash
cp .env-example .env
```

Supported variables:

```text
HOST=127.0.0.1
PORT=3000
PUBLIC_BASE_URL=
CORS_ORIGIN=*
AUDIT_CONCURRENCY=4
AUDIT_TIMEOUT_MS=15000
AUDIT_STRICT=false
AUDIT_INCLUDE_JSON_LOTE_CHECKS=false
AUDIT_FETCH=true
```

Health check:

```bash
curl -s http://127.0.0.1:3000/healthz | jq
```

Audit a LoTL URL:

```bash
curl -s -X POST http://127.0.0.1:3000/api/v1/audit/url \
  -H 'content-type: application/json' \
  -d '{
    "url": "https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.json",
    "options": {
      "concurrency": 4,
      "timeoutMs": 15000,
      "strict": false,
      "includeJsonLoteChecks": true,
      "fetch": true
    }
  }' | jq '.report.summary'
```

Audit a LoTL JSON body:

```bash
curl -s -X POST http://127.0.0.1:3000/api/v1/audit/json \
  -H 'content-type: application/json' \
  -d @list_of_trusted_lists.request.json | jq '.report.summary'
```

Expected request shape for JSON body:

```json
{
  "lotl": { "LoTE": { "ListAndSchemeInformation": { "PointersToOtherLoTE": [] } } },
  "options": {
    "concurrency": 4,
    "timeoutMs": 15000,
    "strict": false,
    "includeJsonLoteChecks": true,
    "fetch": true
  }
}
```

Parse a LoTL without fetching:

```bash
curl -s -X POST http://127.0.0.1:3000/api/v1/lotl/parse \
  -H 'content-type: application/json' \
  -d '{"lotl":{"LoTE":{"ListAndSchemeInformation":{"PointersToOtherLoTE":[]}}}}' | jq
```

Assess one artifact URL:

```bash
curl -s -X POST http://127.0.0.1:3000/api/v1/artifact/assess-url \
  -H 'content-type: application/json' \
  -d '{
    "url": "https://example.test/tl.xml",
    "declared": {
      "mimeType": "application/xml",
      "loteType": "http://uri.etsi.org/19602/LoTEType/EUPIDProvidersList",
      "schemeOperatorName": "Example Operator",
      "schemeTerritory": "EU",
      "pointerCertificateFingerprintsSha256": []
    },
    "options": {
      "timeoutMs": 15000,
      "strict": false,
      "includeJsonLoteChecks": true
    }
  }' | jq '.result.ts119612'
```

Render Markdown from a JSON report:

```bash
curl -s -X POST http://127.0.0.1:3000/api/v1/report/markdown \
  -H 'content-type: application/json' \
  -d @report-wrapper.json | jq -r '.markdown'
```

Expanded POST endpoints (also documented in Stoplight) are `/api/audit/lotl`, `/api/audit/artifact`, `/api/audit/certificate-chain`, `/api/audit/fixture-readiness`, and `/api/reports/markdown`. The LoTL endpoint accepts `url`, `lotl`, or raw JSON `content`; the artifact endpoint accepts raw XML/JSON content without fetching it. Certificate-chain and fixture-readiness responses reuse the same core assessment functions as the CLI/API audit flow.

Assessment endpoints return both:

- `report`: machine-readable `AuditReport` JSON;
- `markdown`: human-readable Markdown rendering of the same report.

Individual referenced trusted-list fetch failures return HTTP 200 and appear inside `report.results[]`. Invalid request bodies, malformed LoTL JSON strings, and invalid top-level URLs return HTTP 400 with a stable `error.code` and `error.message` shape.

## API documentation

OpenAPI:

```text
http://127.0.0.1:3000/openapi.yaml
http://127.0.0.1:3000/openapi.json
```

Interactive docs:

```text
http://127.0.0.1:3000/docs
```

The docs page serves local OpenAPI from `/openapi.yaml` and loads Stoplight Elements from the public unpkg CDN. `/openapi.yaml` and `/openapi.json` set `servers[0].url` from `PUBLIC_BASE_URL` when present, otherwise from the incoming request host, so `HOST=0.0.0.0 PORT=8088 npm run api` and `http://127.0.0.1:8088/docs` produce Try-It requests against port 8088. CORS is enabled on the API server so the Stoplight Try-It console can call local endpoints where browser/network policy allows it. For fully offline docs, vendor Stoplight Elements assets and update `src/api/docs.ts`.

## Checks

For XML artifacts, the tool performs layered best-effort ETSI TS 119 612 checks:

- fetch status, final URL, content type, SHA-256, byte count, duration;
- XML parse and root element checks;
- core `SchemeInformation` structure checks;
- issue/next-update timestamp checks;
- signature presence, embedded signing certificate extraction, signed-root reference checks, and `xmlsec1` XMLDSig verification;
- XAdES qualifying-property detection;
- trust service provider and service metadata checks;
- service digital identity X.509 extraction and validity warnings;
- optional XSD validation with `xmllint` when `--xsd` is passed to CLI.

Conformance levels are deliberately limited:

```ts
conformant | partially_conformant | non_conformant | not_applicable | not_checked | fetch_failed | parse_failed
```

The report does not claim full legal or normative ETSI conformance.

XML findings are implemented structural, date, schema, signature, certificate, and service-metadata checks. They are evidence-oriented results rather than a claim of full ETSI TS 119 612 conformance.

For XML signatures, the report records signature presence, embedded signing-certificate presence and parsing, Reference URIs, expected-root coverage, whether cryptographic verification was attempted, its result or limitation, and XAdES-property detection. Parsed embedded certificates include subject, issuer, serial number, validity period, assessment-time validity, and SHA-256 fingerprint in JSON and Markdown evidence.

The verifier is document-driven rather than fixture-specific: it derives the
root local name, namespace, `Id`/`ID`/`id` attribute, and Reference URIs from
each parsed XML document. It invokes `xmlsec1` with the embedded signing
certificate explicitly and permits only empty or same-document references.
This supports ETSI TS 119 612 `TrustServiceStatusList` roots, the ETSI TS
119 602 V1.1.1 `ListOfTrustedEntities` root, and explicitly reported WE BUILD
compatibility `TrustedEntitiesList` roots without hard-coded URLs or IDs.
Cryptographic validity remains separate from certificate trust: an embedded
certificate is not treated as trusted merely because its signature verifies.
XAdES detection is evidence only; full XAdES semantic validation is not
implemented.

### Optional local XSD validation

Pass `--xsd <path>` to validate fetched XML with a local schema through `xmllint`. The tool does not download schemas. If no schema is supplied, the schema check is `not_checked`; if `xmllint` is unavailable, it is also `not_checked` with an actionable message. An `xmllint` validation failure is reported as a schema finding in both JSON and Markdown output.

## Report schema v2

Reports now include `schemaVersion: 2`. Each assessed artifact has a stable report-local `id`, `source` (with the legacy `location` retained), detected format/kind, and `standardApplicability` for TS 119 612, TS 119 602, the WE BUILD profile, and EUDI trust roles. Markdown renders the same compact classification in its summary table.

## WE BUILD profile checks

When the input identifies itself through the canonical WE BUILD WP4 LoTL type URI or WE BUILD WP4 scheme metadata, the report adds a `weBuildProfile` summary. It classifies implemented pointer list types, reports pointer MIME/format consistency, duplicate locations, missing identities/qualifiers, and parses available pointer certificates as evidence. These are profile checks, not a declaration of WE BUILD trust or certificate-chain validation.

## EUDI RPAC/WRPAC chain assessment library

`src/eudi/certificateChain.ts` exposes a core assessment function for PEM bundles, base64/DER certificate arrays, and JOSE/JWT `x5c` arrays. It reports end-entity, intermediate, and separately supplied trust-anchor evidence; structural chain validity and TL/LoTE-anchor trust are separate results. An RPAC/WRPAC leaf is never treated as a trust anchor. Revocation is intentionally reported as `not_checked` until an explicit CRL/OCSP policy is implemented.

## EUDI RI fixture readiness

Every audit report includes `fixtureReadiness`, answering whether the audited bundle has the implemented prerequisites for a wallet trust fixture and listing the evidence/caveats. It checks fetched artifact types, XML/JSON assessment coverage, WRPAC-provider role presence, parseable pointer certificate material, signing evidence, NextUpdate warnings, MIME consistency, and an optional RPAC chain result.

Pass a local certificate chain with `--rpac-chain <path>`. The file may be a PEM bundle, one base64/DER value, a JSON string array, or a JSON object with `x5c`. The CLI assesses it against parseable pointer certificate material without promoting the RPAC leaf to an anchor.

The live EUDI RI readiness smoke is manual only:

```bash
npm run eudi-ri-tlp-fixture-readiness
```

It writes results under `artifacts/reference-smoke/eudi-ri-tlp/` and is not part of `npm test`.

## FCAF `trusted_authorities` fixture mapping

Every audit report also includes `fcafTrustedAuthorities`, a readiness matrix for the implemented FCAF WS_RP trust-mechanism fixture scenarios. It maps the audited LoTL pointers, fetched TL/LoTE artifacts, XML signing-certificate evidence, parseable pointer certificates, WE BUILD Access CA/WRPAC roles, and optional RPAC-chain result to AKI, `etsi_tl`, cascading, and RPAC-to-Access-CA cases. Each scenario includes a readiness status, evidence, and explicit missing prerequisites. It does not create presentation requests or make a verifier trust decision.

## Negative fixture descriptors

The report's `negativeFixtureDescriptors` provides compact JSON and Markdown-ready instructions for unknown Access CA, expired RPAC, wrong list type, unreachable URL, invalid signature, missing anchor, unanchored-but-structurally-valid RPAC chain, and missing verifier-role scenarios. They describe test-owned configuration or copies only and never modify fetched artifacts. Pass `--generate-negative-fixtures` to additionally write `negative-fixture-descriptors.json` and `.md` beneath ignored `artifacts/generated-fixtures/`.

## TS 119 612 vs TS 119 602

ETSI TS 119 612 defines the XML Trusted List format. JSON LoTE/LoTL-style artifacts are not directly assessable as TS 119 612 XML.

When a fetched artifact is JSON and contains a `LoTE` root, the tool classifies it as `json_lote`, sets TS 119 612 applicability to `not_applicable`, and reports:

```text
Artifact is JSON LoTE/LoTL-style. ETSI TS 119 612 is XML Trusted List format; this artifact should be assessed under ETSI TS 119 602 / WE BUILD profile rules instead.
```

Deterministic local TS 119 602 JSON LoTE evidence checks run whenever a JSON LoTE is detected. The former `--include-json-lote-checks`, `includeJsonLoteChecks`, and `AUDIT_INCLUDE_JSON_LOTE_CHECKS` controls are retained as deprecated compatibility inputs but no longer disable those checks. The report keeps TS 119 602 findings in `results[].ts119602`, separately from `results[].ts119612`; report schema v4 also has a separate `summary.ts119602` and `results[].ts119602Classification`.

Current JSON evidence checks cover list metadata, pointer identities, and issue/next-update dates. Compact JAdES Baseline B validation is reported as `unsupported`; a JSON `signature` property is not accepted as normative signature evidence. Because official schema, complete semantic, signature, and Annex D-I profile coverage remain incomplete, passing presence checks cannot produce a TS 119 602 `conformant` verdict.

The versioned requirements ledger is maintained in `src/standards/ts119602Requirements.ts`. It reserves stable `ts119602.*` check IDs for 81 coherent requirement families across clauses 6.1–6.8, Annex A bindings, Annex B/C rules, and every Annex D–I profile. Each entry records normative citations, binding/profile/scheme-mode applicability, local or contextual evidence scope, default severity, and current implementation coverage. The ledger is an engineering inventory, not proof that the listed requirements are implemented.

Report schema v4 classifies the TS 119 602 data model, Annex A binding, and Annex D-I profile independently. Scheme-explicit JSON and XML roots are distinguished from compatibility structures. A TS 119 612 document remains only an alternative-XML-binding candidate unless its embedded type selects the XML-capable Pub-EAA profile; a pointer's declared type is evidence but cannot select the profile by itself. Selected alternative bindings remain `not_checked` until Table A.1 component mapping is implemented.

For scheme-explicit TS 119 602 XML, the normative entity path implemented by
the tool is
`/ListOfTrustedEntities/TrustedEntitiesList/TrustedEntity`. Current WE BUILD
reference artifacts that instead use
`/TrustedEntitiesList/TrustedEntitiesList/TrustedEntity` are parsed so their
evidence is not lost, but receive an `xml_lote.structure.xml_binding` warning.
The report does not label that compatibility root as an older ETSI version
because no normative version defining it has been identified. The basis is
[ETSI TS 119 602 V1.1.1, normative Annex A.2.1](https://www.etsi.org/deliver/etsi_ts/119600_119699/119602/01.01.01_60/ts_119602v010101p.pdf)
and its referenced
[ETSI scheme-explicit binding repository](https://forge.etsi.org/rep/esi/x19_60201_lists_of_trusted_entities).

## Known limitations

- XSD validation depends on `xmllint` and a local schema supplied through CLI `--xsd`; API requests currently do not accept an XSD upload/path.
- XMLDSig verification depends on the installed `xmlsec1` build and crypto backend. Unsupported algorithms/transforms, a missing executable, timeouts, and prohibited external references are reported explicitly; success is never faked.
- Only empty and same-document XMLDSig Reference URIs are accepted. Detached or external-reference signatures are deliberately not fetched or verified.
- The current signature assessor evaluates the first `ds:Signature` and requires a Reference to cover the expected document root; full XAdES semantic/profile validation is not implemented.
- Full legal ETSI conformance requires normative interpretation beyond structural checks, schema checks, and cryptographic checks.
- JSON LoTE artifacts should be assessed under ETSI TS 119 602 / WE BUILD profile rules, not ETSI TS 119 612.
- The Stoplight docs page uses CDN assets by default; OpenAPI specs are served locally.

## Development

```bash
npm test
npm run build
```
