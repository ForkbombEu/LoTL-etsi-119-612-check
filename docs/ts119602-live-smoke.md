# Optional TS 119 602 live smoke procedure

This procedure observes current EUDI RI and WE BUILD trust-infrastructure
inputs with the implemented TS 119 602 evidence checks. It is manual,
networked, non-normative, and must not run from `npm test`. A reference service
is not a production trust source unless the human explicitly configures it as
one.

## Prerequisites

1. Install repository tools and dependencies with `mise install` and
   `npm install`.
2. Confirm `xmllint` and `xmlsec1` are on `PATH`; missing executables remain
   explicit `unsupported` or `not_checked` evidence.
3. Use a new timestamped directory beneath ignored
   `artifacts/reference-smoke/`; never overwrite an earlier observation.

## Bounded WE BUILD runs

Run both first-class WP4 LoTL inputs independently. The runner records the
source URL, fetch metadata, reports, and optional fetched members beneath a
timestamped ignored directory.

```bash
npm run reference-smoke-run -- we-build-lotl-json \
  --contextual \
  --timeout-ms 15000 \
  --concurrency 2

npm run reference-smoke-run -- we-build-lotl-xml \
  --contextual \
  --timeout-ms 15000 \
  --concurrency 2
```

The named sources resolve to:

- `https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.json`
- `https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.xml`

Contextual assessment defaults to at most 16 dereferences, 5 MiB per artifact,
and traversal depth 3, with hard caps of 32 dereferences, 20 MiB, and depth 8.
The commands deliberately state the top-level timeout and concurrency.

The runner prints the exact result path. A completed observation can be
packaged without including the repository:

```bash
npm run package-reference-smoke -- we-build-lotl-json 20260722T140000Z
```

## Direct artifact API check

When the human has selected a specific LoTE/TL URL from the EUDI RI Trusted
List Provider at `https://trustedlist.serviceproviders.eudiw.dev/`, assess that
exact URL through the shared API. Do not guess a changing endpoint from the
service root.

Start the built server:

```bash
npm run build
npm run api
```

Then post the human-selected URL with explicit bounds and retain only the
machine-readable response beneath an ignored timestamped directory:

```bash
smoke_timestamp=20260722T140000Z
mkdir -p "artifacts/reference-smoke/ts119602-direct/$smoke_timestamp"

curl -fsS -X POST http://127.0.0.1:3000/api/v1/artifact/assess-url \
  -H 'content-type: application/json' \
  -d '{"url":"https://trustedlist.serviceproviders.eudiw.dev/HUMAN-SELECTED-PATH","options":{"timeoutMs":15000,"strict":false},"context":{"dereference":true,"maxDereferences":8,"maxBytesPerArtifact":5242880,"concurrency":2,"maxTraversalDepth":3}}' \
  -o "artifacts/reference-smoke/ts119602-direct/$smoke_timestamp/result.json"
```

The placeholder path must be replaced only after a human selects the intended
reference artifact. A missing or changed endpoint is service drift, not a
reason to invent a compatibility rule.

## Review checklist

- Preserve HTTP status, final URL, content type, byte length, and SHA-256.
- Confirm TS 119 602 data model, Annex A binding, Annex D-I profile, and
  implicit/explicit scheme mode before interpreting findings.
- Review schema, semantic, signature, certificate, chain, trust, and contextual
  results separately.
- Review `ts119602Coverage`: it must contain all 81 ledger families, including
  non-applicable families and every partial or non-conclusive blocker.
- Confirm `completeVerdictEligible` remains false while any applicable family
  is partial/not implemented, any implemented family is non-conclusive, or
  binding/profile/mode selection is ambiguous.
- Treat absent reviewed resources, authoritative records, history, register,
  path, or revocation evidence as absent evidence—not success.
- Record live drift and ambiguity as observations; never silently change the
  versioned interpretation registry from one response.

## Retention and disclosure

Outputs and review archives remain ignored under `artifacts/reference-smoke/`.
Do not commit live response bodies, large reports, unexpected personal data,
access tokens, cookies, or headers. Promote only durable reviewed decisions
into source, tests, OpenAPI, or documentation.
