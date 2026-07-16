# WE BUILD TL Audit

TypeScript/Node.js CLI for auditing trusted-list pointers in a WE BUILD WP4 `list_of_trusted_lists.json`.

The tool reads:

```ts
LoTE.ListAndSchemeInformation.PointersToOtherLoTE[]
```

For each `LoTELocation`, it fetches the artifact, detects XML/JSON/HTML/empty/unknown content, and writes both a Markdown report and a stable JSON report.

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

With local ETSI TS 119 612 XSD and strict structural scoring:

```bash
node dist/cli.js \
  --input https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.json \
  --out-dir ./audit-output \
  --xsd ./schemas/19612_xsd.xsd \
  --strict
```

Parse the LoTL and list pointers without fetching referenced artifacts:

```bash
node dist/cli.js \
  --input ./test/fixtures/list_of_trusted_lists.json \
  --out-dir ./audit-output \
  --no-fetch
```

Outputs:

```text
audit-output/report.md
audit-output/report.json
audit-output/fetched/<safe-file-name>.xml|json|txt
```

`audit-output/` and `tl-audit-output/` are ignored by git.

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
- optional XSD validation with `xmllint` when `--xsd` is passed.

Conformance levels are deliberately limited:

```ts
conformant | partially_conformant | non_conformant | not_applicable | not_checked | fetch_failed | parse_failed
```

The report does not claim full legal or normative ETSI conformance.

## TS 119 612 vs TS 119 602

ETSI TS 119 612 defines the XML Trusted List format. JSON LoTE/LoTL-style artifacts are not directly assessable as TS 119 612 XML.

When a fetched artifact is JSON and contains a `LoTE` root, the tool classifies it as `json_lote`, sets TS 119 612 applicability to `not_applicable`, and reports:

```text
Artifact is JSON LoTE/LoTL-style. ETSI TS 119 612 is XML Trusted List format; this artifact should be assessed under ETSI TS 119 602 / WE BUILD profile rules instead.
```

Pass `--include-json-lote-checks` to include basic JSON LoTE metadata checks such as `LoTEType`, sequence number, issue date, next update, pointer count, trusted-entity count, and signature-object presence.

## Known limitations

- XSD validation depends on `xmllint` and a local schema supplied through `--xsd`.
- XMLDSig/XAdES verification is best-effort. Unsupported transforms, canonicalization, detached references, or profile-specific rules are reported as `not_checked` or `failed`; success is never faked.
- Full legal ETSI conformance requires normative interpretation beyond structural checks, schema checks, and cryptographic checks.
- JSON LoTE artifacts should be assessed under ETSI TS 119 602 / WE BUILD profile rules, not ETSI TS 119 612.

## Development

```bash
npm test
npm run build
```
