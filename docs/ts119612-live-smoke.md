# Optional TS 119 612 live smoke procedure

This procedure checks current EUDI RI and WE BUILD reference inputs against the
implemented evidence checks. It is manual, networked and non-normative. It does
not make either service a production trust source and it must not run from
`npm test`.

## Prerequisites

1. Install the repository tools and dependencies with `mise install` and
   `npm install`.
2. Confirm that `xmllint` and `xmlsec1` are on `PATH`. Missing tools remain
   explicit `unsupported` or `not_checked` results.
3. Create a new timestamped directory under ignored
   `artifacts/reference-smoke/`; never overwrite a previous observation.

## Full WE BUILD LoTL run

The existing runner produces the canonical JSON and Markdown audit reports,
plus fetched evidence, beneath a timestamped ignored directory:

```bash
npm run reference-smoke-run -- we-build-lotl-json \
  --contextual \
  --timeout-ms 15000 \
  --concurrency 2
```

The contextual assessor defaults to at most 16 dereferences, 5 MiB per
artifact and depth 3, with hard caps of 32 dereferences, 20 MiB and depth 8.
The command above is deliberately explicit about top-level fetch concurrency
and timeout.

The runner prints the exact
`artifacts/reference-smoke/we-build-lotl-json/<timestamp>/` result path. A
review archive can be created without including the repository:

```bash
npm run package-reference-smoke -- we-build-lotl-json <timestamp>
```

## Direct XML reference checks

Direct XML inputs can be assessed through the API so the request carries all
context bounds explicitly. Start the built server:

```bash
npm run build
npm run api
```

In another terminal, create an ignored timestamped result directory and POST
each request to `/api/v1/artifact/assess-url`. The EUDI RI path below is an
observed reference-service endpoint; a changed or missing endpoint is recorded
as live-service drift, not normalized into a conformance rule.

```bash
smoke_timestamp=20260722T140000Z
mkdir -p "artifacts/reference-smoke/ts119612-direct/$smoke_timestamp"

curl -fsS -X POST http://127.0.0.1:3000/api/v1/artifact/assess-url \
  -H 'content-type: application/json' \
  -d '{"url":"https://trustedlist.serviceproviders.eudiw.dev/LOTL/01.xml","options":{"timeoutMs":15000,"strict":false},"context":{"dereference":true,"maxDereferences":8,"maxBytesPerArtifact":5242880,"concurrency":2,"maxTraversalDepth":3}}' \
  -o "artifacts/reference-smoke/ts119612-direct/$smoke_timestamp/eudi-ri-lotl.json"

curl -fsS -X POST http://127.0.0.1:3000/api/v1/artifact/assess-url \
  -H 'content-type: application/json' \
  -d '{"url":"https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.xml","options":{"timeoutMs":15000,"strict":false},"context":{"dereference":true,"maxDereferences":8,"maxBytesPerArtifact":5242880,"concurrency":2,"maxTraversalDepth":3}}' \
  -o "artifacts/reference-smoke/ts119612-direct/$smoke_timestamp/we-build-lotl.xml-result.json"
```

Use a fresh UTC `smoke_timestamp` for every run. The API returns
machine-readable JSON; it does not save the fetched XML body.

## Review checklist

- Preserve HTTP status, final URL, content type, byte length and SHA-256 from
  each fetch result.
- Confirm artifact classification before reading TS 119 612 findings.
- Review namespace/version binding, pinned XSD source and diagnostics,
  XMLDSig/XAdES result, signer certificate evidence and explicit trust inputs
  separately.
- Review `ts119612Coverage`: it must contain all 69 ledger families, including
  families not applicable to the artifact and every partial, not-implemented
  or non-conclusive blocker.
- Confirm `completeVerdictEligible` is false while any applicable family is
  partial/not implemented or any implemented family is non-conclusive.
- Keep `referenceProfiles` observations separate from the normative
  `ts119612` assessment.
- Record service drift and ambiguity as observations. Do not update normative
  behavior from one live response.

## Retention and disclosure

Smoke outputs and review archives stay ignored under `artifacts/reference-smoke/`.
Do not commit live response bodies, large reports, certificates containing
unexpected personal data, access tokens or headers. Promote only durable,
reviewed decisions into source, tests and documentation.
