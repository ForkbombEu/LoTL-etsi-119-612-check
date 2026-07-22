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

For each `LoTELocation`, it can fetch the artifact, detect XML/JSON/compact-JWS/HTML/empty/unknown content, run the applicable evidence checks, and return both a machine-readable JSON report and a Markdown report.

## Install

```bash
npm install
npm run build
```

Node.js 20 or newer is required.

Cryptographic XMLDSig verification requires `xmlsec1`, and XML Schema
validation requires `xmllint`, on `PATH`. On Debian/Ubuntu, the repository's
`.mise.toml` declares both as Mise bootstrap packages, so the complete
development environment can be installed with:

```bash
mise bootstrap
```

Without Mise, install it directly:

```bash
sudo apt-get install xmlsec1 libxml2-utils
```

If either executable is unavailable, the audit still runs: cryptographic
verification is reported as `not_checked`, while applicable XSD validation is
reported as `not_checked` or `unsupported`. Signature structure, certificate
evidence, and semantic checks remain available.

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

Opt in to bounded contextual dereferencing and supply a prior TL or LoTE for
sequence/history evidence:

```bash
node dist/cli.js \
  --input ./list_of_trusted_lists.json \
  --out-dir ./audit-output \
  --contextual \
  --prior-lote ./previous-list.xml
```

Contextual mode is off by default. It caches duplicate URLs per assessed
artifact and caps contextual work at 16 references, 4 concurrent requests,
5 MiB per response, three TS 119 612 pointer edges, and the existing
per-request timeout. Library and API callers may configure these limits up to
hard maxima of 32 references, 20 MiB and eight pointer edges. A prior artifact
is compared only with a current artifact of the same standard, list type and
scheme territory.

CLI outputs:

```text
audit-output/report.md
audit-output/report.json
audit-output/fetched/<safe-file-name>.xml|json|jws|txt
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

Expanded POST endpoints (also documented in Stoplight) are `/api/audit/lotl`, `/api/audit/artifact`, `/api/audit/certificate-chain`, `/api/audit/fixture-readiness`, and `/api/reports/markdown`. The LoTL endpoint accepts `url`, `lotl`, or raw JSON `content`; the artifact endpoint accepts raw XML, JSON, or compact JAdES content. Audit and artifact requests may include a `context` object with explicit `priorArtifacts`, trusted signer SHA-256 fingerprints, opt-in `dereference`, and bounded concurrency/count/byte limits. Certificate-chain and fixture-readiness responses reuse the same core assessment functions as the CLI/API audit flow.

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
- `OtherTSLPointer` tuple, qualifier, certificate, rollover and target-profile
  dispatch checks;
- issue/next-update timestamp checks;
- signature presence, embedded signing certificate extraction, signed-root reference checks, and `xmlsec1` XMLDSig verification;
- XAdES qualifying-property detection;
- trust service provider and service metadata checks;
- service digital identity X.509 extraction and validity warnings;
- automatic integrity-checked V2.4.1 XSD validation for canonical TLv6
  artifacts, with an optional CLI `--xsd` override.

Conformance levels are deliberately limited:

```ts
conformant | partially_conformant | non_conformant | not_applicable | not_checked | unsupported | inconclusive | fetch_failed | parse_failed
```

The selected normative TS 119 612 source is
[V2.4.1 (2025-08)](https://www.etsi.org/deliver/etsi_TS/119600_119699/119612/02.04.01_60/ts_119612v020401p.pdf),
with TL format version `6` and canonical namespace
`http://uri.etsi.org/02231/v2#`. The observed
`http://uri.etsi.org/19612/v2.4.1#` EUDI RI namespace is retained as an
explicit warning-only compatibility input; its normative status is not
assumed.

The TS 119 612 requirements ledger in
`src/standards/ts119612Requirements.ts` inventories 69 coherent families
across clauses 4-6 and normative Annexes B-E/G/J. It currently records 15
families as implemented, 45 as partial, and 9 as not implemented. Every
applicable assessment includes `ts119612.coverage.complete`; incomplete
coverage prevents the result from ever becoming `conformant`, while concrete
failures remain visible as partial/non-conformance evidence.

The report does not claim full legal or normative ETSI conformance.

XML findings are implemented structural, date, schema, signature, certificate, and service-metadata checks. They are evidence-oriented results rather than a claim of full ETSI TS 119 612 conformance.

`SchemeInformation` assessment validates direct namespace-aware child
cardinality/order and locally decidable V2.4.1 rules for version, sequence,
type, multilingual operator/name/address/pointers, territory, policy choice,
history period, strict UTC issuance, exact six-calendar-month next update,
distribution URIs and extension criticality. Registry recognition, referenced
URI content and legal authority remain explicit contextual limitations.
Sequence progression, distribution equality and retained service states are
checked when explicit prior/dereferencing context is supplied.

`OtherTSLPointer` assessment validates the exact identity/location/qualifier
tuple, the five type/operator/community-rules/territory/MIME qualifiers, the
registered ETSI XML media type, X.509/subject/SKI/RSA-key identity
equivalence, certificate metadata matching, Annex A rollover evidence, and
canonical dispatch for EU generic TL and EU LoTL targets. Opt-in contextual
assessment fetches each target within explicit bounds, requires its XMLDSig
verification and current-validity checks to pass, matches the actual signer
certificate digest against the declaring pointer, validates the target kind,
and follows authenticated pointers while detecting cycles without re-fetching.

TSP and current-service assessment validates direct provider/service nesting,
the 52 registered V2.4.1 service-type URIs, multilingual names and information
pointers, mandatory TSP official-identifier syntax, postal/electronic contact
structure, PKI versus non-PKI identity representation, EU status families,
strict status-start ordering, conditional service definitions, supply-point
URIs and base extension criticality. It retains the prior indexed finding IDs
while adding requirement-oriented findings. Registry/legal facts, certificate
and representation equivalence, target content, transition history and detailed
extension semantics remain explicit limitations.

For XML signatures, the report records signature presence, embedded signing-certificate presence and parsing, Reference URIs, expected-root coverage, whether cryptographic verification was attempted, its result or limitation, and XAdES properties. TS 119 612 artifacts additionally receive XAdES-B-B checks, exact Annex B root-reference/transform/canonicalization checks, and TLSO certificate KeyInfo, KeyUsage, extended-key-usage, SubjectKeyIdentifier, BasicConstraints, subject and issuer findings. Parsed embedded certificates include subject, issuer, serial number, validity period, assessment-time validity, and SHA-256 fingerprint in JSON and Markdown evidence.

The verifier is document-driven rather than fixture-specific: it derives the
root local name, namespace, `Id`/`ID`/`id` attribute, and Reference URIs from
each parsed XML document. It invokes `xmlsec1` with the embedded signing
certificate explicitly and permits only empty or same-document references.
This supports ETSI TS 119 612 `TrustServiceStatusList` roots, the ETSI TS
119 602 V1.1.1 `ListOfTrustedEntities` root, and explicitly reported WE BUILD
compatibility `TrustedEntitiesList` roots without hard-coded URLs or IDs.
Cryptographic validity remains separate from certificate trust: an embedded
certificate is not treated as trusted merely because its signature verifies.
API callers can supply `context.ts119612Signer` intermediates, trust anchors
and timestamped revocation evidence, plus separately trusted signer
fingerprints. Certificate path, revocation and signer trust remain distinct
findings. The non-specific ETSI TS 119 312 usable-key policy is explicitly
`not_checked` until an applicable policy snapshot is selected, and a valid
path alone does not prove that a non-self-signed issuer is listed in the TL or
the same community.

### TS 119 612 XSD selection

The tool never downloads schemas during assessment and always invokes
`xmllint` with `--nonet`.

| Artifact evidence | Schema behavior |
| --- | --- |
| Canonical `http://uri.etsi.org/02231/v2#` plus `TSLVersionIdentifier=6` | Automatically verifies and uses the pinned V2.4.1 base schema and offline catalog |
| Canonical namespace with another/missing format version | `inconclusive`; the V2.4.1 schema is not applied |
| Observed `http://uri.etsi.org/19612/v2.4.1#` compatibility namespace | `inconclusive`; no authoritative profile schema is assumed |
| CLI `--xsd <path>` | Explicit override; takes precedence and must match the artifact namespace |

Schema findings identify the selected source, immutable schema/catalog hashes,
bundle-integrity result and line/column diagnostics. Diagnostic sources are
reported as `artifact.xml` or the applicable bundled schema path without
leaking temporary paths. If `xmllint` is unavailable, automatic validation is
`unsupported` with an actionable message.

### Pinned ETSI TS 119 612 schemas

The official ETSI TS 119 612 V2.4.1 base, service-information extension and
additional-types schemas are pinned under
`schemas/etsi-ts-119-612/v2.4.1/`. The manifest records the official ETSI
electronic-attachment hash and member hashes, the immutable Forge tag/commit,
the exact XAdES and W3C dependencies, byte lengths, SHA-256 hashes and source
licences. The Forge files use LF line endings and are recorded as
content-equivalent to the official CRLF attachment members after newline
normalization.

`src/standards/ts119612Schemas.ts` verifies every bundled file and resolves
only allowlisted local schema references. The offline catalog maps the exact
published ETSI imports plus their required W3C schema/DTD dependencies. Unknown
remote, absolute and traversal references are rejected. Canonical TLv6
artifacts use this verified bundle automatically; `--xsd` remains an
explicit CLI-only override.

### Pinned ETSI TS 119 602 schemas

The official ETSI TS 119 602 V1.1.1 JSON and XML binding schemas are pinned under `schemas/etsi-ts-119-602/v1.1.1/`. `manifest.json` records the ETSI Forge tag and immutable commit, source paths, byte lengths, SHA-256 hashes, and BSD-3-Clause license. It also records the pinned W3C XML namespace, XMLDSig, and DTD dependencies and their W3C license.

`src/standards/ts119602Schemas.ts` verifies bundle integrity and resolves only allowlisted local references. The accompanying `catalog.xml` maps the HTTP/HTTPS W3C imports to local files. The resolver explicitly handles the published TIE schema reference `1960201-jsonSchema.json`, whose spelling differs from the published base filename, without modifying either upstream file. Unknown remote, absolute, and traversal references are rejected.

TS 119 602 JSON and scheme-explicit XML assessments use these pinned schemas automatically. XML validation verifies every bundled file against the manifest before invoking `xmllint` with `--nonet` and the pinned catalog through `XML_CATALOG_FILES`. Its separate `ts119602.binding.xml_schema` finding records source commit/hash, bundle integrity, and structured line/column diagnostics. If `xmllint` is unavailable, the finding is `unsupported`; it never pretends validation passed. Schema success alone does not imply normative conformance because the ETSI specification prevails over conflicting electronic schemas.

## Report schema v5

Reports now include `schemaVersion: 5`. Each assessed artifact has a stable report-local `id`, `source` (with the legacy `location` retained), detected format/kind, `standardApplicability`, and isolated `referenceProfiles` assessments for EUDI RI and WE BUILD TS 119 612 inputs. Markdown renders the same profile findings stored in JSON; profile observations are not inserted into ETSI conformance scoring.

## WE BUILD profile checks

When a JSON LoTL identifies itself through the canonical WE BUILD WP4 LoTL type URI or WE BUILD WP4 scheme metadata, the report adds a `weBuildProfile` summary. It classifies implemented pointer list types, reports pointer MIME/format consistency, duplicate locations, missing identities/qualifiers, and parses available pointer certificates as evidence.

TS 119 612 XML artifacts additionally receive `results[].referenceProfiles.weBuildTs119612`. Exact WE BUILD publication paths or embedded WP4 evidence select the profile. Checks record the canonical versus observed compatibility namespace, distribution-index/member-TL shape, unique HTTP(S) distribution references, EUDI role mappings, and X.509 trust-anchor evidence. The observed `19612/v2.4.1` namespace remains warning-only compatibility evidence.

`results[].referenceProfiles.eudiRiTs119612` similarly recognizes the exact EUDI RI Trusted List Provider host or embedded RI evidence, compares `/LOTL/` and `/TL/` endpoints with the detected artifact role, classifies implemented wallet, PID, QEAA, Pub-EAA, Access CA, registration and registrar service types, and records whether role-bearing services contain X.509 identities. Every recognized EUDI RI artifact carries an explicit warning that it is a testing/reference input, not an implicit production trust source.

## EUDI RPAC/WRPAC chain assessment library

`src/eudi/certificateChain.ts` exposes a core assessment function for PEM bundles, base64/DER certificate arrays, and JOSE/JWT `x5c` arrays. It reports end-entity, intermediate, and separately supplied trust-anchor evidence; structural chain validity and TL/LoTE-anchor trust are separate results. An RPAC/WRPAC leaf is never treated as a trust anchor. Revocation is intentionally reported as `not_checked` until an explicit CRL/OCSP policy is implemented.

## EUDI RI fixture readiness

Every audit report includes `fixtureReadiness`, answering whether the audited bundle has the implemented prerequisites for a wallet trust fixture and listing the evidence/caveats. It checks fetched artifact types, XML/JSON assessment coverage, WRPAC-provider role presence, parseable pointer certificate material, signing evidence, NextUpdate warnings, MIME consistency, and an optional RPAC chain result.

Pass a local certificate chain with `--rpac-chain <path>`. The file may be a PEM bundle, one base64/DER value, a JSON string array, or a JSON object with `x5c`. The CLI assesses it against parseable pointer certificate material without promoting the RPAC leaf to an anchor.

The live EUDI RI readiness smoke is manual only. Normal profile tests use reduced deterministic fixtures:

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

Deterministic local TS 119 602 JSON LoTE evidence checks run whenever a JSON LoTE is detected. The former `--include-json-lote-checks`, `includeJsonLoteChecks`, and `AUDIT_INCLUDE_JSON_LOTE_CHECKS` controls are retained as deprecated compatibility inputs but no longer disable those checks. The report keeps TS 119 602 findings in `results[].ts119602`, separately from `results[].ts119612`; report schema v5 also has a separate `summary.ts119602`, `results[].ts119602Classification`, and isolated TS 119 612 reference-profile results.

JSON LoTE assessment now validates the official object/array model against the pinned V1.1.1 Draft-07 schema entirely offline. URI and date-time formats are enforced, and schema failures report JSON Pointer, schema path/keyword, expected value, observed value/type, and the exact schema source commit and SHA-256. The official `TrustedEntitiesList[]` and nested service arrays are parsed directly. The legacy WE BUILD/TSL-like `TrustedEntitiesList.TrustServiceProvider[]` shape is handled only by an isolated compatibility adapter and receives explicit schema and compatibility failures while retaining extractable evidence.

Compact JAdES Baseline B is detected as JWS rather than as a JSON `signature` property. The assessor recovers the attached JSON payload, compares it with the assessed LoTE, validates protected Baseline-B headers and certificate references, verifies supported RSA/RSA-PSS/ECDSA/EdDSA signature algorithms with an embedded `x5c` signer certificate, and reports certificate validity, signer subject matching, and explicit trust independently. Detached payloads or externally referenced certificates are reported as unsupported when the required external bytes/material are not supplied.

Exact embedded `LoTEType` values dispatch Annex D-I local profile checks. Each selected profile receives separate binding, scheme-information, trusted-entity, service/history, and signature findings. The implementation checks the registered status/rules/service URIs, six-calendar-month update limit, profile history/pointer shape, contact and country-role URIs, certificate cardinality, Wallet `ServiceUniqueIdentifier`, Pub-EAA certificate/status/SKI-history rules, and registrar supply points.

Optional contextual assessment compares supplied prior instances, requires certificate-declared self-pointers to return the identical current bytes with a verified matching signer, checks distribution-point byte equality, recognizes directly returned previous archive instances, verifies JSON/XML supply-point responses, and applies explicit signer fingerprints without trusting embedded certificates by default. Every fetch records the normal HTTP/hash evidence and observes timeout, count, concurrency, byte, and duplicate-URL cache bounds. Public-key/SKI pointer identities, archive indexes requiring traversal, register semantics beyond machine-readable syntax, authoritative legal records, certificate-purpose policy, and production chain/revocation trust remain explicit limitations; therefore success still cannot produce a complete TS 119 602 `conformant` verdict.

The versioned requirements ledger is maintained in `src/standards/ts119602Requirements.ts`. It reserves stable `ts119602.*` check IDs for 81 coherent requirement families across clauses 6.1–6.8, Annex A bindings, Annex B/C rules, and every Annex D–I profile. Each entry records normative citations, binding/profile/scheme-mode applicability, local or contextual evidence scope, default severity, and current implementation coverage. The ledger is an engineering inventory, not proof that the listed requirements are implemented.

Report schema v5 classifies the TS 119 602 data model, Annex A binding, and Annex D-I profile independently. Scheme-explicit JSON and XML roots are distinguished from compatibility structures. A TS 119 612 document remains only an alternative-XML-binding candidate unless its embedded type selects the XML-capable Pub-EAA profile; a pointer's declared type is evidence but cannot select the profile by itself. For a selected alternative binding, the TS 119 612 assessor emits a typed fact set and the TS 119 602 assessor applies all 34 Annex A.2.2/Table A.1 mappings only after the pinned source schema and namespace/version binding pass. The TS 119 602 layer does not reparse the XML. Published gaps around the unmapped `LOTETag` and the conflicting fixed version values are reported as `inconclusive`, not silently normalized.

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

The same route automatically validates the artifact with the integrity-checked
V1.1.1 XSD and offline catalog. Schema validity remains a distinct finding
from semantic, profile, signature, certificate, and trust results.

## Known limitations

- XSD validation depends on `xmllint`. TS 119 602 scheme-explicit XML and
  canonical TS 119 612 TLv6 XML use their pinned bundles automatically. API
  requests receive the same automatic validation but do not accept the local
  filesystem `--xsd` override.
- XMLDSig verification depends on the installed `xmlsec1` build and crypto backend. Unsupported algorithms/transforms, a missing executable, timeouts, and prohibited external references are reported explicitly; success is never faked.
- Only empty and same-document XMLDSig Reference URIs are accepted. Detached or external-reference signatures are deliberately not fetched or verified.
- The XML signature assessor evaluates the first `ds:Signature`; XML XSD validation and contextual signer-chain trust remain separate from the implemented XAdES Baseline B and Annex H.4 findings.
- Contextual pointer authentication currently supports X.509 certificate identities. Public-key/SKI-only pointer authentication remains unimplemented.
- Archive checks recognize a previous LoTE returned directly by the configured archive URI; HTML indexes and multi-step archive protocols remain `inconclusive`.
- Supply-point checks establish bounded reachability and machine-processable JSON/XML syntax, not the authoritative semantics of register records.
- Full legal ETSI conformance requires normative interpretation beyond structural checks, schema checks, and cryptographic checks.
- JSON LoTE artifacts should be assessed under ETSI TS 119 602 / WE BUILD profile rules, not ETSI TS 119 612.
- The Stoplight docs page uses CDN assets by default; OpenAPI specs are served locally.

## Development

```bash
npm test
npm run build
```
