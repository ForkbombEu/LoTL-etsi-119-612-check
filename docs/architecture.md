# Architecture

## Current implementation

`we-build-tl-audit` is an evidence-oriented TypeScript/Node.js audit utility. Its primary input is a WE BUILD WP4 JSON LoTL/LoTE document whose `PointersToOtherLoTE` entries identify referenced artifacts. It produces a stable JSON report and a Markdown rendering of the same findings; it does not make a legal or complete normative conformance determination.

```text
CLI (--input path-or-url)                 HTTP API (JSON body or URL)
            |                                        |
            +------------> src/audit.ts <-------------+
                               |
                  input loading / JSON LoTL parsing
                    |                   |
             src/input.ts          src/lotl.ts
                                        |
                              PointerInfo[] (location + declarations)
                                        |
                              bounded concurrent assessment
                                        |
                               src/fetcher.ts
                                        |
                               src/detect.ts
                    +-------------------+-------------------+
                    |                   |                   |
            TS 119 612 XML         JSON LoTE            other content
          src/xml/ts119612Checks.ts src/json/loteChecks.ts  not applicable
                    |                   |
                    +-------------------+-------------------+
                                        |
                 src/report/jsonReport.ts + markdownReport.ts
                                        |
                 JSON report, Markdown report, optional fetched files
```

### Architecture boundaries

| Boundary | Current modules | Responsibility |
|---|---|---|
| Input loading | `src/input.ts` | Reads a local input file or an HTTP(S) URL, with a timeout for URL input; returns bytes, UTF-8 text, source kind, and SHA-256. |
| LoTL parsing and pointer extraction | `src/lotl.ts` | Parses JSON, reads `LoTE.ListAndSchemeInformation`, normalizes `PointersToOtherLoTE`, and extracts each location plus declared MIME/type, operator, territory, and pointer certificate fingerprints. |
| Audit orchestration | `src/audit.ts` | Coordinates parsing, bounded concurrent pointer work, assessment dispatch, report building, and CLI output persistence. The API reuses its in-memory and single-artifact entry points. |
| Fetcher | `src/fetcher.ts` | Fetches a referenced artifact with a timeout and records HTTP status, final URL, content type, duration, byte count, hash, and errors. It also writes optional fetched evidence files for CLI runs. |
| Artifact detection | `src/detect.ts` | Classifies bytes as XML, JSON, HTML, text, empty, or unknown and recognizes TS 119 612 XML TSL, JSON LoTE, HTML-error, and generic/LoTL-like variants. |
| XML parsing and TS 119 612 evidence checks | `src/xml/` | Parses XML, uses local-name XPath helpers, evaluates structural and date checks, performs best-effort XMLDSig/XAdES and certificate evidence checks, and can invoke local `xmllint` for an explicitly supplied XSD. |
| TS 119 612 alternative-binding facts | `src/xml/ts119612Facts.ts`, `src/standards/ts119602AlternativeXml.ts` | Emits typed source-standard facts, gates on TS 119 612 schema/binding evidence, maps all Annex A.2.2/Table A.1 components, and applies TS 119 602 checks without reparsing the XML. |
| TS 119 612 signature profile | `src/xml/signature.ts`, `src/xml/xades.ts`, `src/xml/ts119612Signature.ts` | Separates XMLDSig verification, XAdES-B-B/Annex B structure, TLSO certificate restrictions, supplied path/revocation evidence, and signer trust. |
| JSON LoTE checks | `src/json/loteChecks.ts` | Marks TS 119 612 as not applicable for JSON LoTE and optionally performs basic JSON LoTE metadata checks. |
| Certificate helpers | `src/certs.ts` | Computes SHA-256 values and parses available Base64 X.509 material into reportable certificate summaries. |
| Report rendering | `src/report/jsonReport.ts`, `src/report/markdownReport.ts`, `src/types.ts` | Defines the report contract, aggregates summary counts, and renders Markdown only from JSON report findings. |
| CLI entry point | `src/cli.ts` | Parses Commander options and calls `runAudit`; it writes `report.json`, `report.md`, and optional evidence under the selected output directory. |
| HTTP API and API contract | `src/api/`, `openapi/we-build-tl-audit.openapi.yaml` | Provides POST assessment/parse/render routes, runtime configuration, request schemas, OpenAPI serving, and interactive documentation. |

### Current behavior and limits

- The CLI accepts one JSON LoTL source through `--input`; it can be a local file or URL.
- Pointer fetches are bounded by configurable timeout and concurrency. Tests mock network activity rather than depending on live services.
- XML `TrustServiceStatusList` content is assessed with implemented TS 119 612-style structural, signature, certificate, date, and optional XSD evidence checks.
- A JSON LoTE is not reported as a TS 119 612 failure. It is reported as `not_applicable` for that XML standard, with optional JSON metadata checks.
- The tool currently does not model EUDI trust roles, validate an RPAC/WRPAC chain to an Access CA, assess registration material, or determine FCAF fixture readiness.
- XMLDSig/XAdES and XSD results remain best-effort evidence checks; they are not a general PKI trust decision or legal conformance claim.

## Target staged EUDI trust-infrastructure architecture

The planned extension retains the existing report-first pipeline while making artifact type and EUDI role explicit. The trust relationship to model for a verifier/Relying Party is:

```text
LoTL / common trust infrastructure
  -> Trusted List or LoTE for Access Certificate Authorities
      -> Access CA trust anchor
          -> Relying Party Instance access certificate (RPAC / WRPAC)
              -> signed OpenID4VP or ISO mdoc request
```

The trusted list normally identifies the Access CA trust anchor, not the verifier's RPAC/WRPAC end-entity certificate. Registration certificates and registrar data remain a separate evidence stream for registered attributes, intended use, entitlement, and policy material.

```text
Explicit source selection (local, URL, named reference source)
                         |
              LoTL / TL / LoTE input adapters
                         |
        artifact classification + standard/profile applicability
              |                  |                   |
      TS 119 612 XML         JSON LoTE/LoTL      unsupported/error
              |                  |                   |
     format/profile checks  JSON profile checks  explicit limitation
                         |
       normalized trust-list evidence and roles
                         |
  Access CA anchor discovery <--- RPAC/WRPAC/x5c chain assessment
                         |
      registration/entitlement evidence (separate from access chain)
                         |
       FCAF `trusted_authorities` fixture-readiness mapping
                         |
       stable JSON report and matching Markdown/API output
```

Future stages should add only explicit checks and preserve the distinction between parsed facts, inferred relationships, and checks that are not implemented. Named EUDI RI and WE BUILD sources are reference inputs for optional/manual assessment; they must not become implicit production trust roots. Live fetches remain opt-in for tests and bounded in normal operation.

## Validation coverage

The current Vitest suite covers LoTL parsing, detection, XML structural checks, report output, and API/OpenAPI routes using deterministic fixtures and mocked fetches. It does not yet cover Access CA/RPAC relationships, registration certificates, or FCAF mappings because those capabilities are not implemented.
