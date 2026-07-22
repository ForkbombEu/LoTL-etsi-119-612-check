# ETSI TS 119 612 and TS 119 602 implementation roadmap

Last reconciled: 2026-07-22, through TS612-11 and TS602-14.

This roadmap reflects the executable implementation in `src/`, the
deterministic fixtures and tests in `test/`, and the current report/API
contracts. It covers both ETSI TS 119 612 XML Trusted Lists/LoTLs and ETSI TS
119 602 Lists of Trusted Entities.

The tool remains an evidence-oriented assessment utility. A completed task
means that the stated implementation slice is merged and tested; it does not
mean that the applicable ETSI standard, EUDI profile, legal policy, or trust
framework is completely validated.

## Status vocabulary

- **Complete** — the bounded task scope is implemented and tested.
- **Partial** — useful checks exist, but normative coverage is incomplete.
- **Next** — the next recommended task in that standard's dependency chain.
- **Planned** — sequenced behind explicit dependencies.
- **Contextual** — conclusive evaluation requires supplied or fetched evidence
  outside the assessed artifact.

Normal tests must remain offline. Optional live checks must be explicit,
bounded, and write only under ignored artifact directories.

## Current product baseline

| Area | Current state | Important limit |
| --- | --- | --- |
| Input | Local files, URLs, JSON objects/strings, raw XML/JSON/JWS API content, certificates/chains | Network fetches are bounded and must be explicit |
| Classification | XML/JSON/JWS/HTML/unknown detection; TS 119 612 and TS 119 602 applicability are separate | Profile declarations cannot override conflicting embedded evidence |
| Reports | Stable JSON report schema v5 plus Markdown rendering of standard and isolated reference-profile findings | No Markdown-only findings |
| API | POST assessment routes, OpenAPI, Stoplight Elements UI | Core functions are reused; the API does not shell out to the CLI |
| XML tooling | `xmlsec1` and `xmllint` declared as Mise bootstrap packages | Missing executables produce explicit `not_checked`/`unsupported` results |
| Certificates | Parse subject, issuer, serial, validity, fingerprints, public-key hashes, SKI, basic constraints, key usage and self-signature evidence; compare TS 119 612 service identities; assess RPAC/WRPAC chains against supplied anchors | Embedded certificates are evidence, not automatically trusted anchors; service checks do not establish revocation or chain trust |
| Fixtures | Deterministic positive/negative XML, JSON, JWS, chain and readiness fixtures | Live reference services are not normal test dependencies |
| Test baseline | 43 test files and 232 tests passing at this reconciliation | Counts will change as tasks are added |

## Boundary between the standards

- A `TrustServiceStatusList` using a supported TS 119 612 namespace is assessed
  under TS 119 612.
- A TS 119 602 `ListOfTrustedEntities` XML document is assessed using the
  scheme-explicit XML binding.
- An official object/array JSON LoTE is assessed using the TS 119 602
  scheme-explicit JSON binding.
- JSON LoTE/LoTL artifacts are `not_applicable` to TS 119 612.
- A TS 119 612 XML artifact is only a candidate for the TS 119 602 Annex A.2.2
  alternative binding when embedded evidence selects the Pub-EAA profile.
- The alternative binding must pass the applicable TS 119 612 validation and
  an explicit Annex A Table A.1 mapping before TS 119 602 profile conclusions
  are possible.
- Legacy WE BUILD JSON/XML shapes remain compatibility inputs and must not be
  silently described as normative ETSI bindings.

## ETSI TS 119 612

### Implemented baseline

The existing TS 119 612 assessor provides useful evidence and is inventoried
by a 69-family requirements ledger. Only 15 families are implemented completely;
45 are partial and 9 are not implemented, so it must not be treated as a
complete conformance validator.

| Baseline task | Implemented scope | Status |
| --- | --- | --- |
| TS612-B01 | Detect `TrustServiceStatusList`, distinguish TL from LoTL using `TSLType`, mark foreign roots/namespaces not applicable, and retain the observed EUDI RI namespace variant as warning evidence | Complete |
| TS612-B02 | Parse core scheme metadata, dates, distribution points, TSP/service counts, and mandatory-field presence | Complete task scope; semantic coverage partial |
| TS612-B03 | Automatic integrity-checked canonical TLv6 validation through `xmllint --nonet`, explicit override support, offline catalog resolution and source-identified diagnostics | Complete |
| TS612-B04 | XMLDSig/XAdES evidence, local-reference policy, `xmlsec1` cryptographic verification, embedded certificate parsing, validity evidence, and first-list/signing-certificate equality for LoTL/LoTE types | Complete task scope; trust/profile coverage partial |
| TS612-B05 | Separate `ts119612` result/report summary, CLI/API/OpenAPI exposure, Markdown rendering, and focused malformed/namespace/date/XSD/signature fixtures | Complete |
| TS612-B06 | Exact direct `SchemeInformation` order/cardinality and locally decidable V2.4.1 syntax/semantics, including calendar-month and closed-list next-update handling | Complete task scope; contextual coverage remains explicit |
| TS612-B07 | Exact TSP/current-service nesting, the 52 registered service-type URIs, multilingual/contact/definition fields, PKI/non-PKI identity shape, EU status families, status-start ordering, supply points and base extension criticality | Complete task scope; history, equivalence and target-content coverage remain explicit |
| TS612-B08 | Service-history structure/order, registered statuses and modern transitions, predefined service-extension families, qualifier vocabulary, certificate/SKI/RSA-key identity equivalence, duplicate-key detection and deterministic certificate role evidence | Complete task scope; retention completeness, custom registries, legacy migration, takeover authority, certificate chain and revocation remain explicit |
| TS612-B09 | XAdES-B-B and exact Annex B root-reference/transform/canonicalization rules, TLSO certificate restrictions, supplied path/revocation evidence and explicit signer-trust separation | Complete task scope; TS 119 312 policy selection and issuer-list/community authentication remain explicit |
| TS612-B10 | Exact `OtherTSLPointer` tuples, required qualifiers and MIME value, certificate/subject/SKI/RSA-key equivalence, signing-certificate metadata, Annex A rollover evidence and canonical target-profile dispatch | Complete task scope; target dereferencing/authentication and cross-list traversal remain contextual |
| TS612-B11 | Supplied prior-list sequence and retained-state comparison, distribution byte equality, pointer signer-certificate authentication, duplicate-fetch caching, cycle detection and bounded cross-list traversal | Complete task scope; dereferencing remains opt-in and public-key/SKI-only authentication remains unsupported |
| TS612-B12 | Isolated EUDI RI and WE BUILD TS 119 612 reference-profile recognition, endpoint/artifact shape, role classification, role trust-anchor evidence and distribution observations in JSON, Markdown and OpenAPI | Complete task scope; observed reference behavior is non-normative and never implies production trust |
| TS612-B13 | Ledger-linked deterministic positive/negative coverage for every implemented family, lossless standard-finding Markdown rendering, CLI report-file parity, API re-render parity and an executable OpenAPI report example | Complete task scope; partial and not-implemented families remain explicit for TS612-12 |

#### What TS 119 612 does not yet prove

- The implemented field-presence checks are not a complete clause/cardinality,
  vocabulary, or semantic assessment.
- The official V2.4.1 XSD/catalog bundle is selected automatically only when
  canonical namespace and format-version evidence agree. Other versions and
  the observed EUDI RI namespace remain `inconclusive` unless a matching
  explicit CLI override is supplied.
- V2.4.1 is the only selected normative version. The observed EUDI RI
  namespace variant remains a warning-only compatibility input whose normative
  status is not established.
- Date-time lexical rules, exact calendar update periods, local sequence shape,
  and closed-list status evidence are checked. Sequence progression and
  historical retention use explicitly supplied prior-list evidence and remain
  `not_checked` when it is absent.
- Current and historical service information has local structure, registered
  vocabulary, identity-equivalence, status-transition, predefined-extension and
  certificate-purpose checks. Complete history retention, custom registrations,
  Annex J migration, referenced takeover/definition content, chain validation
  and revocation remain contextual or partial.
- XML signature profile, path, revocation and trust findings remain separate.
  Path and revocation checks require explicit inputs; the non-specific TS
  119 312 usable-key policy and non-self-signed issuer listing/community
  authorization remain `not_checked` or `inconclusive`.
- Local `OtherTSLPointer` structure, qualifiers, signing-certificate evidence,
  rollover evidence and canonical target dispatch are checked. Opt-in bounded
  context authenticates X.509-declared pointer targets and distribution bytes;
  public-key/SKI-only authentication and external legal authority remain open.
- EUDI RI and WE BUILD XML reference profiles are reported separately from the
  TS 119 612 assessment. Recognition is based on exact source hosts/paths or
  embedded profile evidence and never establishes ETSI conformance or trust.
- Coverage gating prevents an incomplete requirements ledger from producing a
  complete conformance verdict.

### TS 119 612 sequential task plan

Each row is intended to be one focused implementation prompt and one commit.

| Task | Scope | Depends on | Status |
| --- | --- | --- | --- |
| TS612-01 | Establish the exact supported TS 119 612 version/profile source set; create a clause/table requirements ledger with stable `ts119612.*` IDs, applicability, severity, citations and implementation status; gate verdicts on coverage so incomplete assessment cannot report full conformance | Baseline | Complete |
| TS612-02 | Pin the applicable official base/extension XSDs, XMLDSig dependencies, licenses, immutable provenance, hashes and an offline catalog; add bundle integrity verification | TS612-01 | Complete |
| TS612-03 | Route every supported TS 119 612 namespace/version to the correct pinned schema automatically; retain `--xsd` only as an explicit override; report source-identified line diagnostics and document namespace/profile ambiguity | TS612-02 | Complete |
| TS612-04 | Implement scheme-information structure and semantics: exact order/cardinality, version, sequence, type, operator name/address, scheme name/information URI, status approach, community rules, territory, policy/legal notice, issue/next-update, distribution points and extensions | TS612-01, TS612-03 | Complete |
| TS612-05 | Implement TSP and service-information structure: exact nesting/cardinality, multilingual names/addresses/URIs, service types/names, digital identities, status/start time, supply points, definitions and extensions | TS612-04 | Complete |
| TS612-06 | Implement service history, qualifiers and certificate semantics: history ordering/retention, status transitions, qualifier vocabularies, identity equivalence, certificate roles/purpose and deterministic certificate evidence | TS612-05 | Complete |
| TS612-07 | Implement the exact applicable XML signature/XAdES profile: reference/transform/property rules, signer metadata, certificate path/revocation inputs and explicit signer-trust separation | TS612-03, TS612-06 | Complete; TS 119 312 policy selection and issuer-community authentication remain partial |
| TS612-08 | Implement LoTL `OtherTSLPointer` semantics: pointer structure, MIME/type/community qualifiers, service identities, signing-certificate rules, rollover and supported namespace/profile dispatch | TS612-04, TS612-07 | Complete |
| TS612-09 | Add contextual validation for sequence progression, distribution equality, archive/history evidence, pointer dereferencing/authentication and bounded cross-list traversal | TS612-08 | Complete |
| TS612-10 | Add explicit EUDI RI and WE BUILD TS 119 612 profile checks without treating reference-service behavior as normative ETSI behavior | TS612-05 through TS612-09 | Complete |
| TS612-11 | Add deterministic positive and focused negative fixtures for every implemented requirement family; synchronize CLI, API, OpenAPI, JSON/Markdown and report compatibility tests | TS612-10 | Complete |
| TS612-12 | Perform a coverage audit against the ledger, leave unsupported/contextual rules explicit, document manual live smoke procedures, and enable a complete verdict only if every applicable implemented requirement is conclusive | TS612-11 | **Next cross-standard task** |

#### TS 119 612 implementation rules

- Do not infer a normative namespace/version relationship solely from an EUDI
  RI fixture. Record observed variants separately from standard citations.
- XSD validity, semantic validity, profile validity, signature validity,
  certificate validity, signer trust and pointer trust are separate findings.
- Use exact calendar arithmetic where the standard expresses months; do not
  replace it with a fixed 183-day approximation without normative support.
- Do not use descendant-name searches as proof of exact mandatory nesting.
- A signing certificate embedded in `ds:KeyInfo` is not trusted merely because
  the signature verifies.
- Live LoTL traversal must enforce timeout, count, concurrency, byte and cycle
  bounds and must remain disabled in normal tests.

## ETSI TS 119 602 V1.1.1

### Implemented task sequence

These tasks are complete for their bounded scopes. The requirements ledger
currently contains 81 families: 20 implemented, 61 partial and 0 not
implemented. Therefore TS 119 602 as a whole is not complete.

| Task | Implemented scope | Status |
| --- | --- | --- |
| TS602-01 | Isolate TS 119 602/TS 119 612 results and summaries; add `unsupported`/`inconclusive`; remove opt-in and signature-object shortcuts | Complete |
| TS602-02 | Add the 81-family clause/table/profile requirements ledger with citations and stable check IDs | Complete |
| TS602-03 | Classify data model, three Annex A bindings and selected Annex D-I profile independently | Complete |
| TS602-04 | Pin V1.1.1 JSON/XML schemas, dependencies, provenance, licenses, hashes and offline resolvers | Complete |
| TS602-05 | Validate the official JSON object/array binding offline and isolate legacy WE BUILD JSON through a compatibility adapter | Complete |
| TS602-06 | Add reusable URI, strict UTC timestamp, language, country-code and multilingual syntax validators | Complete task scope; some requirement families remain partial |
| TS602-07 | Add clause 6.2/6.3 metadata, implicit/explicit presence, pointer, date, distribution and critical-extension checks | Complete task scope; contextual semantics remain partial |
| TS602-08 | Add clauses 6.4-6.7 entity, service, identity, status and history checks | Complete task scope; strict nesting/identity semantics remain partial |
| TS602-09 | Add XAdES Baseline B and Annex H.4 XML signature constraints with signer evidence/trust separation | Complete |
| TS602-10 | Add compact JAdES Baseline B payload and cryptographic validation with certificate evidence/trust separation | Complete |
| TS602-11 | Dispatch Annex D-I profiles and implement locally decidable profile tables with positive/focused negative coverage | Complete task scope; contextual/profile semantics remain partial |
| TS602-12 | Add supplied prior-list evidence and bounded distribution, pointer, archive and supply-point contextual checks across product surfaces | Complete task scope; some identity/register/archive semantics remain partial |
| TS602-13 | Validate scheme-explicit XML with the integrity-checked pinned XSD/catalog and source-identified diagnostics | Complete |
| TS602-14 | Map all 34 Annex A.2.2/Table A.1 components from typed, schema-gated TS 119 612 facts and apply base/Annex H checks without reparsing the XML | Complete; published tag/version conflicts remain explicit |

### Remaining TS 119 602 gaps

#### Binding and schema

- Annex A.2.2/Table A.1 mapping is implemented, but the published binding does
  not map `LOTETag` and maps fixed version fields whose TS 119 612 V2.4.1 and
  TS 119 602 Annex H required values conflict. Both remain explicit
  `inconclusive` evidence rather than compatibility normalization.
- Positive and negative fixtures do not yet cover every JSON/XML extension
  schema type.
- Schema success remains evidence only; the normative document prevails over
  known electronic-schema conflicts.

#### Core data model and profiles

- Complete Annex B multilingual/transliteration and character rules.
- Require `TEInformationURI` and exact
  `TrustedEntityServices/TrustedEntityService` nesting.
- Complete `TEName`, `TETradeName`, address, URI and `ServiceName` semantics.
- Validate legal/natural-person registration identifiers and associated-body
  requirements where Annex D-H requires them.
- Complete profile-specific cross-field consistency and certificate-purpose
  policies.
- Compare `PublicKeyValue` and `X509SKI` with accompanying certificates and
  support those identities for pointer authentication.

#### Context and trust

- Validate archive indexes/protocols beyond a directly returned prior list.
- Validate scheme-information pages and authoritative legal/registration
  records only when explicit evidence and policy are supplied.
- Validate register record semantics beyond JSON/XML reachability.
- Establish history retention completeness and final closed-LoTE semantics.
- Add explicit certificate-chain/revocation policy for signers and pointer
  identities; embedded certificates remain untrusted by default.

### TS 119 602 remaining sequential task plan

| Task | Scope | Depends on | Status |
| --- | --- | --- | --- |
| TS602-14 | Implement Annex A.2.2/Table A.1 component mapping for the TS 119 612 alternative XML binding, consuming validated TS 119 612 facts rather than reparsing with ad hoc XPath | TS602-13, TS612-06 | Complete |
| TS602-15 | Close core structure and syntax gaps: exact XML/JSON nesting/cardinality, `TEInformationURI`, multilingual/transliteration rules, names, addresses, URIs and service-name semantics | TS602-13 | Next TS 119 602 task; planned after TS612-07 in the cross-standard order |
| TS602-16 | Close Annex D-I local semantic gaps: registration identifiers, associated bodies, certificate-purpose rules and remaining profile cross-field consistency | TS602-15 | Planned |
| TS602-17 | Implement certificate/public-key/SKI equivalence and use all supported pointer identity forms with explicit chain/revocation trust inputs | TS602-16 | Planned |
| TS602-18 | Complete contextual rules for scheme pages, authoritative registration evidence, archive traversal, register records, history retention and final closed lists | TS602-17 | Planned |
| TS602-19 | Add positive and negative fixtures for every base/extension schema and every newly completed requirement family; update interpretation-registry regression tests | TS602-18 | Planned |
| TS602-20 | Synchronize CLI/API/OpenAPI/report contracts, add optional bounded live smoke procedures, audit all 81 ledger families and enable a complete verdict only when every applicable result is conclusive | TS602-14, TS602-19, TS612-12 | Planned |

### Published TS 119 602 conflicts that must remain explicit

The implementation registry in
`src/standards/ts119602Interpretations.ts` must continue to cite and preserve
these issues rather than silently normalize them:

1. Clause 6.1.2 refers to registered URIs in Annex H while the registry is in
   Annex C in V1.1.1.
2. Clause 6.1.4 refers to multilingual rules in Annex G while they appear in
   Annex B.
3. The published WRPRC status-determination URI contains an apparent spelling
   error.
4. Clause 6.3.15 closed-LoTE null semantics conflict with the published schema
   shape.
5. Clause 6.3.5.1 postal-address text and the XML schema disagree about
   `Locality` and `Country`/`CountryName`.
6. Clause 6.8 requires a signature while the XML schema makes `ds:Signature`
   optional.
7. The JSON Schema's `additionalProperties` placement does not by itself close
   every intended object.
8. Table A.1 maps `LoTEVersionIdentifier` to `TSLVersionIdentifier`, while
   Annex H requires value `1` and TS 119 612 V2.4.1 requires value `6`.
9. Clause 6.2 requires `LOTETag`, but Table A.1 has no corresponding mapping
   and the TS 119 612 source uses `TSLTag`.

Unresolved conflicts must be `inconclusive` or linked to an explicit,
versioned interpretation; they must never be silently corrected.

## Cross-standard recommended order

The recommended implementation sequence is:

1. **TS612-06** — complete reliable local TS 119 612 facts. Complete.
2. **TS602-14** — implement the alternative-binding mapping using those facts.
   Complete.
3. **TS612-07 through TS612-10** and **TS602-15 through TS602-18** — complete
   signature, trust, semantic and contextual families in their respective
   standards. TS612-10 is complete.
4. **TS612-11/12** and **TS602-19/20** — close fixture/product-surface coverage
   and perform ledger-driven completion audits. TS612-11 is complete;
   **TS612-12 is next.**

Tasks that do not share files may be developed independently, but the stated
dependencies must still be satisfied before a conformance claim is enabled.

## Completion gates

Neither standard may report a complete conformance conclusion unless:

1. artifact type, standard version, binding and applicable profile are
   selected from authoritative artifact evidence;
2. the correct integrity-checked schema passes or the report explicitly
   explains why schema validation is not applicable;
3. every applicable ledger requirement has a JSON finding with stable ID,
   category, status, severity, message, evidence and applicability;
4. semantic, schema, signature, certificate, chain, trust and contextual
   results remain distinct;
5. every mandatory result is free of `fail`, `not_checked`, `unsupported` and
   `inconclusive`;
6. contextual requirements use supplied/bounded fetched evidence and do not
   pass merely because evidence is absent;
7. JSON and Markdown contain the same findings, and CLI/API/OpenAPI behavior is
   synchronized;
8. deterministic positive and negative fixtures cover every implemented
   normative requirement family;
9. known source conflicts are linked to a versioned interpretation rather
   than silently normalized; and
10. the report states the limits of the implemented checks and does not claim
    legal certification or production trust.
