# WE BUILD TL Audit

TypeScript/Node.js CLI and HTTP API for auditing trusted-list pointers in a WE BUILD WP4 `list_of_trusted_lists.json`.

Repository orientation:

- [Current and target architecture](docs/architecture.md)
- [Trust-infrastructure glossary](docs/glossary.md)

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
npm run reference-smoke -- we-build-lotl-json
```

The optional command builds the CLI, fetches the named live source, and writes reports and fetched evidence to `artifacts/reference-smoke/<source-name>/`, which is ignored by git.

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
- signature presence, embedded signing certificate extraction, and best-effort `xml-crypto` XMLDSig verification;
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

## Report schema v2

Reports now include `schemaVersion: 2`. Each assessed artifact has a stable report-local `id`, `source` (with the legacy `location` retained), detected format/kind, and `standardApplicability` for TS 119 612, TS 119 602, the WE BUILD profile, and EUDI trust roles. Markdown renders the same compact classification in its summary table.

## TS 119 612 vs TS 119 602

ETSI TS 119 612 defines the XML Trusted List format. JSON LoTE/LoTL-style artifacts are not directly assessable as TS 119 612 XML.

When a fetched artifact is JSON and contains a `LoTE` root, the tool classifies it as `json_lote`, sets TS 119 612 applicability to `not_applicable`, and reports:

```text
Artifact is JSON LoTE/LoTL-style. ETSI TS 119 612 is XML Trusted List format; this artifact should be assessed under ETSI TS 119 602 / WE BUILD profile rules instead.
```

Pass `--include-json-lote-checks` in the CLI or `includeJsonLoteChecks: true` in API options to include basic JSON LoTE metadata checks such as `LoTEType`, sequence number, issue date, next update, pointer count, trusted-entity count, and signature-object presence.

## Known limitations

- XSD validation depends on `xmllint` and a local schema supplied through CLI `--xsd`; API requests currently do not accept an XSD upload/path.
- XMLDSig/XAdES verification is best-effort. Unsupported transforms, canonicalization, detached references, or profile-specific rules are reported as `not_checked` or `failed`; success is never faked.
- Full legal ETSI conformance requires normative interpretation beyond structural checks, schema checks, and cryptographic checks.
- JSON LoTE artifacts should be assessed under ETSI TS 119 602 / WE BUILD profile rules, not ETSI TS 119 612.
- The Stoplight docs page uses CDN assets by default; OpenAPI specs are served locally.

## Development

```bash
npm test
npm run build
```
