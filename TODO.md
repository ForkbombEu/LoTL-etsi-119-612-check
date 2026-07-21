# ETSI TS 119 602 V1.1.1 conformance gap report

Assessment date: 2026-07-20

Code baseline: commit `57d6dc3`

Target: ETSI TS 119 602 V1.1.1 (2025-11)

## Executive conclusion

The current implementation is an evidence-oriented LoTE inspector. It is not
yet a complete ETSI TS 119 602 conformance checker and must not produce a
"conformant" TS 119 602 verdict.

The implementation currently covers artifact recognition, independent
binding/profile classification, official offline JSON Schema validation,
some top-level semantic evidence, basic dates, entity/service counting, X.509
parsing, and generic XMLDSig cryptographic verification. The missing work is
concentrated in the layers that determine normative conformance:

1. official XML Schema validation and TS 119 612 alternative-binding mapping;
2. clauses 6.1 through 6.8 semantic validation;
3. JAdES Baseline B and XAdES Baseline B profile validation;
4. the six normative EU profiles in Annexes D through I;
5. cross-document, historical, and dereferencing checks.

An exact percentage would be misleading until every normative requirement is
entered in a requirements ledger. As a non-normative engineering estimate:

| Area | Current maturity | Approximate distance |
| --- | --- | --- |
| Scheme-explicit TS 119 602 XML evidence | Early partial | The root and some mandatory fields are covered, but most syntax, semantics, profile, and XAdES rules are missing. |
| Official TS 119 602 JSON binding | Structural validation | The official object/array model is parsed and validated offline; core semantics, profile rules, and compact JAdES remain incomplete. |
| TS 119 612 alternative XML binding | Classified, mapping missing | Annex A.2.2 applicability is guarded, but Table A.1 component mapping is not implemented. |
| Annex D-I profile conformance | Classification only | List-type names are recognized, but the normative profile tables are not validated. |
| Complete TS 119 602 verdict | Not implemented | No artifact can currently receive an evidence-backed complete TS 119 602 conformance verdict. |

The JSON structural layer is now implemented, but the semantic, signature,
profile, trust, and contextual layers remain the majority of the work. This
is a planning observation, not a conformance score.

## Normative source set

The implementation should pin and cite these sources:

- [ETSI TS 119 602 V1.1.1
  (2025-11)](https://www.etsi.org/deliver/etsi_ts/119600_119699/119602/01.01.01_60/ts_119602v010101p.pdf)
  — authoritative data model, bindings, URI registry, and profiles.
- [ETSI TS 119 602 binding repository, tag
  v1.1.1](https://forge.etsi.org/rep/esi/x19_60201_lists_of_trusted_entities/-/tree/v1.1.1)
  — `1960201_json_schema.json`, `1960201_xsd_schema.xsd`, and the
  service/entity extension schemas.
- [ETSI TS 119 612 V2.4.1
  (2025-08)](https://www.etsi.org/deliver/etsi_ts/119600_119699/119612/02.04.01_60/ts_119612v020401p.pdf)
  — alternative XML binding referenced by TS 119 602 Annex A.2.2.
- [ETSI TS 119 182-1 V1.2.1
  (2024-07)](https://www.etsi.org/deliver/etsi_ts/119100_119199/11918201/01.02.01_60/ts_11918201v010201p.pdf)
  — JAdES Baseline B requirements used by the JSON profiles.
- [ETSI EN 319 132-1 V1.3.1
  (2024-07)](https://www.etsi.org/deliver/etsi_en/319100_319199/31913201/01.03.01_60/en_31913201v010301p.pdf)
  — XAdES Baseline B requirements used by the XML profile.
- The normative RFCs and ISO references cited by TS 119 602, including
  RFC 3986, RFC 4514, RFC 5646, ISO 8601, ISO 3166-1, and X.509.

The PDF states that it prevails over conflicting electronic schemas. The
validator therefore needs separate schema and semantic results instead of
assuming that schema success proves complete conformance.

## What is implemented today

### Input and artifact evidence

- Bounded URL fetching with HTTP status, content type, byte length, and hash.
- XML/JSON/HTML/unknown format detection.
- Recognition of the official scheme-explicit XML root:
  `/ListOfTrustedEntities`.
- Namespace-aware entity selection at:
  `/ListOfTrustedEntities/TrustedEntitiesList/TrustedEntity`.
- Continued extraction of the non-standard WE BUILD compatibility path:
  `/TrustedEntitiesList/TrustedEntitiesList/TrustedEntity`, with a warning.
- Recognition of JSON documents containing a `LoTE` property.

### Current XML LoTE evidence

- XML parsing and parser diagnostics.
- Presence checks for `ListAndSchemeInformation` and selected scheme fields.
- Basic parsing and ordering of `ListIssueDateTime` and `NextUpdate`.
- Trusted entity and service counts.
- Presence checks for `TrustedEntityInformation`, `TEName`, `TEAddress`,
  `ServiceTypeIdentifier`, `ServiceName`, and `ServiceDigitalIdentity`.
- X.509 certificate parsing and metadata extraction.
- Generic XMLDSig cryptographic verification through `xmlsec1`.
- Detection, but not validation, of XAdES-related elements.

### Current JSON LoTE evidence

- Offline validation against the pinned official V1.1.1 Draft-07 schema with
  URI and date-time format checks.
- Error evidence containing JSON Pointer, schema path/keyword, expected value,
  observed value/type, and pinned schema identity.
- Parsing and counting of the official `TrustedEntitiesList[]`,
  `TrustedEntityInformation`, and `TrustedEntityServices[]` structure.
- Explicit non-conformance plus evidence extraction for the isolated legacy
  `TrustedEntitiesList.TrustServiceProvider[]` compatibility adapter.
- Presence checks for a subset of list and scheme fields.
- Basic date parsing and ordering.
- Pointer and pointer-identity counting.
- WE BUILD pointer qualifier, MIME, duplicate URL, certificate, and list-role
  evidence.

These are useful facts, but they cover only a subset of the normative
requirements and do not yet compose into a TS 119 602 verdict.

## P0 correctness problems

These issues can currently produce a misleading assessment and should be
fixed before adding lower-priority checks.

### P0.1 Separate TS 119 602 results from TS 119 612 results

Current TS 119 602 checks are stored inside `result.ts119612`, while that
object says `applicable: false` and `conformanceLevel: not_applicable`.
`standardApplicability.ts119602` may simultaneously say `applicable`.

Required change:

- add a first-class `ts119602` assessment object;
- retain `ts119612` independently for the alternative binding;
- support `pass`, `fail`, `warn`, `not_applicable`, `not_checked`,
  `unsupported`, and `inconclusive`;
- calculate a TS 119 602 verdict only from TS 119 602 checks;
- never label an artifact conformant when a mandatory applicable check is
  missing, unsupported, or inconclusive.

### P0.2 Recognize every normative binding

TS 119 602 Annex A defines:

1. scheme-explicit JSON;
2. scheme-explicit XML;
3. an alternative XML binding using ETSI TS 119 612.

The current classifier marks all `TrustServiceStatusList` artifacts as
TS 119 602 `not_applicable`. That conflicts with Annex A.2.2. The tool must
classify the binding separately from the data model and profile:

```text
TS 119 602 data model
  -> scheme-explicit JSON binding
  -> scheme-explicit XML binding
  -> TS 119 612 alternative XML binding
```

The alternative binding must apply Table A.1 component mappings and then the
relevant TS 119 602 profile rules. A normal TS 119 612 trusted list must not be
silently reclassified as a TS 119 602 profile without matching profile
evidence.

### P0.3 Replace the current JSON model with the official binding — complete

The official JSON Schema defines:

```text
LoTE
  ListAndSchemeInformation
  TrustedEntitiesList[]                 optional, minItems 1 when present
    TrustedEntityInformation
    TrustedEntityServices[]
      ServiceInformation
      ServiceHistory[]                  optional
```

The normative parser now reads this official object/array structure. The old
shape:

```text
LoTE.TrustedEntitiesList.TrustServiceProvider[]
```

is isolated in `legacyLoteAdapter.ts`, fails schema/binding conformance, and is
retained only for compatibility evidence. `json-lote.json` is now a
schema-valid official positive fixture; `json-lote-legacy.json` is the named
negative compatibility fixture.

Implemented in TS602-05:

- parse the official array/object structure;
- validate exact types, cardinalities, required properties, and
  `additionalProperties`;
- keep legacy or WE BUILD compatibility parsing in a separate adapter that
  emits an explicit non-conformance warning;
- replace positive fixtures with schema-valid TS 119 602 fixtures.

### P0.4 Remove the JSON `signature` object shortcut

Annexes D, E, F, G, and I require a compact JAdES Baseline B signature.
Annex H requires compact JAdES Baseline B when JSON is used. A compact JAdES
object encapsulates or references the JSON payload; it is not established by
finding a `signature`, `LoTE.signature`, or `LoTE.Signature` object.

The current `json_lote.signature_object_present` check is therefore not a
normative signature check and can produce a false pass.

Required change:

- accept and classify compact JAdES serialization;
- extract and compare the signed payload with the assessed LoTE;
- validate JAdES Baseline B according to ETSI TS 119 182-1;
- report cryptographic validity separately from signer trust;
- report raw unsigned JSON as a failed signature requirement for Annex D-I
  profiles, not as merely missing optional evidence.

### P0.5 Do not make TS 119 602 checks opt-in

`includeJsonLoteChecks` currently allows a TS 119 602 JSON artifact to be
classified as applicable without actually running the checks. Core checks
must run by default for an applicable artifact. Optional flags may enable
network dereferencing or expensive validation, but must not disable the
normative local checks.

### P0.6 Correct mandatory/optional severity

Most missing JSON fields currently produce `warn`. Missing mandatory schema
or profile components must produce `fail`. Optional fields must be
`not_applicable` or pass when absent, depending on the requirement.

For XML, `ServiceTypeIdentifier` is optional in the base data model. The
Annex D-I tables restrict its allowed values but do not uniformly say that it
shall be present. Checks must follow the exact selected-profile wording
rather than applying one presence rule to every LoTE.

### P0.7 Correct the six-month calculation

The implementation applies `<= 183` rounded days to every XML/JSON LoTE.
The base data model only says profiles should specify a maximum; Annexes D-I
specify six calendar months. Six months is not always 183 days.

Required change:

- apply the rule only to profiles that define it;
- use calendar-month arithmetic from `ListIssueDateTime`;
- do not round fractional days;
- support the closed-LoTE `NextUpdate = null` rule from clause 6.3.15;
- distinguish expired-at-assessment from invalid issue/update ordering.

## Normative requirement coverage matrix

| Requirement | Normative expectation | Current state | Remaining work |
| --- | --- | --- | --- |
| 6.1.1 bindings | JSON and XML bindings; Annex A.2.2 alternative XML | Partial/incorrect | Implement all three binding routes and binding-specific applicability. |
| 6.1.2 URI syntax | URI fields follow RFC 3986 | Missing | Validate every URI and scheme-specific `mailto`, `tel`, HTTP, and registered URI rule. |
| 6.1.3 date-time | Exact ISO 8601 UTC form with seconds and `Z`, no decimal fraction | Partial | JavaScript `Date` accepts offsets and fractions that the standard forbids; add lexical validation. |
| 6.1.4 and Annex B language | At least English `en`; language tags, casing, transliteration, Unicode restrictions | Missing | Validate multilingual strings/pointers and prohibited characters; dereferenced content is a separate optional network check. |
| 6.1.5 country codes | Upper-case ISO 3166-1 plus defined exceptions/extensions | Missing | Add a pinned country-code policy and EU/UK/EL exceptions. |
| 6.2 LoTE tag | Binding-specific LoTE tag representation | XML presence missing | Validate the XML `LOTETag` attribute and document JSON binding behavior explicitly. |
| 6.3/Table 1 | Correct implicit vs explicit scheme presence matrix | Partial | Explicit XML presence checks cover some fields; implicit scheme mode, prohibited fields, cardinality, and JSON schema rules are absent. |
| 6.3.1 version | Integer; profile/binding-specific value | Presence only | Validate type and Annex D-I value `1`; do not accept numeric strings unless the binding allows them. |
| 6.3.2 sequence | Integer, starts at 1, monotonically increases, never resets | Presence only | Validate local type/range and compare with prior list instances when supplied or fetched. |
| 6.3.3 LoTE type | URI and profile discriminator | Classification only | Require exact registered values and reject binding/profile mismatches. |
| 6.3.4-6.3.11 scheme data | Required structure, multilingual values, addresses, URI semantics, scheme-name format, policy choice | Presence only | Validate nested structure, `CC:name`, email/web contact requirements, language coverage, and policy/legal-notice alternatives. |
| 6.3.12 history period | Integer with semantics including `65535` | Missing | Validate value and its consequences for statuses and histories. |
| 6.3.13 pointers | Location, one-or-more identities, qualifiers, and successful target authentication | Partial | Validate full shape and qualifier fields; verify that at least one pointer identity authenticates the fetched target. |
| 6.3.14-6.3.15 dates | Strict UTC, ordering, expiry, closed-list behavior | Partial | Add exact lexical, profile, null, and assessment-time rules. |
| 6.3.16 distribution points | Non-empty URIs; all locations yield the current identical list | Presence/extraction only | Validate cardinality and optionally fetch/hash all locations with bounded network policy. |
| 6.3.17 extensions | Criticality is present; unknown critical extension causes rejection | Missing | Add an extension registry and fail closed for unknown critical extensions. |
| 6.4 entity list | Absent only when no entity is/was approved; otherwise one-or-more entities | Partial | XSD/JSON schema plus semantic presence logic; distinguish empty scheme from malformed empty container. |
| 6.4.1-6.5 entity information | Information, services, name, address, and information URI are mandatory | Partial | Current XML checks omit mandatory `TEInformationURI`, exact wrappers/cardinality, trade-name semantics, and associated-body extensions. |
| 6.6 service information | Name and digital identity mandatory; conditional and profile-specific fields | Partial | Validate exact nesting, identity alternatives, statuses, supply points, definitions, and extensions. |
| 6.6.3 digital identity | Certificate/SKI/PublicKey/subject/other identifier rules and equivalence | Certificate parsing only | Validate Base64 strictly, DN syntax, key/SKI equality, PKI minimums, and profile-specific certificate semantics. |
| 6.6.4-6.6.5 status | Status and start time depend on history/profile; dates must be consistent | Missing | Implement status URI sets, absence rules, list-issue consistency, and profile-specific behavior. |
| 6.7 service history | Mandatory fields, descending time order, identity retention semantics | Missing | Parse and validate every history instance, status transition, ordering, and retained key identity. |
| 6.8 signatures | AdES Baseline B; signer subject country/organization matches scheme | Partial XML only | Implement full XAdES/JAdES Baseline B and signer subject matching. |
| Annex A schemas | Official base and extension schemas | JSON implemented; XML pending | The v1.1.1 bundle is pinned and the JSON binding validates offline with source-identified diagnostics; integrate XML binding validation while preserving semantic checks where the PDF prevails. |
| Annex B multilingual | Normative language and character rules | Missing | Add reusable validators for every multilingual component. |
| Annex C URIs | Exact registered profile URIs | Classification only | Add a versioned registry and exact comparisons with ambiguity handling. |
| Annexes D-I | Six complete EU profiles | Missing | Implement profile dispatch and every additional table requirement. |

## Schema validation backlog

### JSON

- [x] Bundle or reproducibly fetch the v1.1.1 Draft-07 schemas:
  `1960201_json_schema.json`, `_sie.json`, `_tie.json`, and RFC 7517
  dependencies.
- [x] Record source URL, tag, commit, SHA-256, and license.
- [x] Use a Draft-07 validator with URI and date-time format enforcement.
- [x] Resolve extension schemas without hidden network access.
- [x] Report each error with JSON Pointer, schema keyword, expected value, and
  observed value.
- [x] Validate `additionalProperties`, `minItems`, exact primitive types, and
  all nested required fields.
- [ ] Add positive and negative fixtures for each object and extension type.

### XML

- [x] Bundle or reproducibly fetch `1960201_xsd_schema.xsd`, `_sie.xsd`, and
  `_tie.xsd`, plus pinned XMLDSig dependencies.
- [ ] Route the `--xsd`/schema validator through `xml_lote`; it currently only
  runs for TS 119 612 XML.
- [ ] Route scheme-explicit XML validation through the pinned offline XML
  catalog; generic `xmllint` validation now prohibits network access with
  `--nonet`.
- [ ] Report XPath/line diagnostics and schema source identity.
- [ ] Validate the TS 119 612 alternative binding with the correct TS 119 612
  schema before applying Table A.1 mappings.
- [ ] Keep XML schema validity separate from semantic and profile validity.

## Signature validation backlog

### XML / XAdES

Generic XMLDSig verification is useful but insufficient. For the Annex H XML
profile, H.4 additionally requires:

- [ ] XAdES Baseline B validation under ETSI EN 319 132-1, not only detection
  of `QualifyingProperties` or `SignedProperties`;
- [ ] an enveloped signature;
- [ ] a `ds:Reference` with `URI=""` covering the entire document;
- [ ] exactly one `ds:Transforms` on that reference;
- [ ] exactly two transforms in order: enveloped-signature, then exclusive
  canonicalization;
- [ ] exclusive canonicalization for `ds:CanonicalizationMethod`;
- [ ] validation of all references, digests, signed properties, signing time,
  signing certificate reference, and Baseline-B mandatory properties;
- [ ] signer certificate subject country equals `SchemeTerritory`;
- [ ] signer certificate subject organization equals one
  `SchemeOperatorName`;
- [ ] a clear distinction between cryptographic validity, certificate
  validity, and trust in the signer.

The current verifier accepts either an empty or same-document root reference
and delegates transform handling to `xmlsec1`. That is valid generic
verification behavior but is too permissive for H.4.

### JSON / JAdES

- [ ] Detect compact JAdES rather than a JSON `signature` property.
- [ ] Parse protected headers and enforce the JAdES Baseline B serialization
  and property requirements.
- [ ] Recover and validate the exact signed LoTE payload.
- [ ] Verify the signature algorithm and cryptographic signature.
- [ ] Parse the signing certificate/chain and expose certificate evidence.
- [ ] Validate signer subject country and organization against scheme data.
- [ ] Keep embedded certificate evidence separate from trust-anchor
  validation.
- [ ] Report unsupported algorithms as `unsupported`, not `warn` or generic
  failure.

### Pointer authentication

Clause 6.3.13 requires at least one `ServiceDigitalIdentity` in a pointer to
successfully authenticate the pointed-to LoTE before use.

- [ ] Match the verified target signer key/certificate against every pointer
  identity.
- [ ] Support certificate rollover with multiple identities.
- [ ] Compare public keys/SKIs where exact certificate equality is not the
  applicable identity rule.
- [ ] Do not treat a target's self-embedded signing certificate as trusted
  merely because its signature verifies.

## Annex D-I profile backlog

Every profile needs an exact dispatcher based on `LoTEType`. The generic
WE BUILD role classifier is not a profile validator.

Common Annex D-I requirements include:

- `LoTEVersionIdentifier = 1`;
- first sequence number is 1;
- exact LoTE type, status-determination, scheme-rules, and territory values;
- profile-specific history and pointer presence/absence;
- a maximum of six calendar months to `NextUpdate`;
- exact entity information and certificate identity semantics;
- allowed service-type URI sets;
- profile-specific status/history rules;
- the required signature binding and AdES profile.

| Annex/profile | Allowed binding | Important distinguishing rules | Current support |
| --- | --- | --- | --- |
| D — PID providers | Scheme-explicit JSON | No history period, self-pointer, PID issuance/revocation service types, no service status/start time, JAdES B | LoTE type classification only |
| E — Wallet providers | Scheme-explicit JSON | No history period, self-pointer, wallet issuance/revocation types, service name is wallet solution, mandatory `ServiceUniqueIdentifier`, JAdES B | LoTE type classification only |
| F — WRPAC providers | Scheme-explicit JSON | No history period, self-pointer, WRPAC issuance/revocation types, certificate-purpose rules, JAdES B | LoTE type classification only |
| G — WRPRC providers | Scheme-explicit JSON | No history period, self-pointer, WRPRC issuance/revocation types, certificate-purpose rules, JAdES B | LoTE type classification only |
| H — Pub-EAA providers | Scheme-explicit JSON or XML | History period `65535`, no pointers, notified/withdrawn statuses, history uses SKI and forbids history certificates, JAdES B or tightly profiled XAdES B | Type classification plus partial XML structure/signature evidence |
| I — Registrars/registers | Scheme-explicit JSON | No history period, self-pointer, only Register service type, no status/start time, mandatory machine-processable service supply point, JAdES B | LoTE type classification only |

`EUgeneric`/QEAA is not one of the TS 119 602 Annex D-I LoTE profiles. It
belongs in the separate TS 119 612/WE BUILD assessment path and must not be
used as evidence that a TS 119 602 profile passed.

## Entity, service, and certificate semantics backlog

- [ ] Require `TEInformationURI` in every `TrustedEntityInformation`.
- [ ] Validate exact `TrustedEntityServices/TrustedEntityService` nesting
  rather than descendant-name searches.
- [ ] Validate `TEName`, `TETradeName`, address, and URI multilingual
  structures.
- [ ] Validate legal/natural-person registration identifier semantics where
  Annex D-H refers to ETSI EN 319 412-1.
- [ ] Validate associated-body requirements for PID and wallet profiles.
- [ ] Validate profile-specific country role URIs.
- [ ] Validate email, website, and mandatory telephone contact requirements.
- [ ] Validate service-type URIs against the selected profile only.
- [ ] Validate `ServiceName` semantics where mechanically possible.
- [ ] Require profile-appropriate X.509 certificates and reject an empty
  `X509Certificates` array.
- [ ] Compare certificate `organizationName` with `TEName` where required.
- [ ] For Pub-EAA, ensure multiple certificates represent the same public key
  and have identical subject names.
- [ ] Validate `PublicKeyValue` and `X509SKI` against any accompanying
  certificate.
- [ ] Validate service statuses and transitions.
- [ ] Validate service history in descending status-time order.
- [ ] For Pub-EAA history, require at least one SKI and forbid
  `X509Certificate`.
- [ ] Validate unknown critical scheme, TE, and service extensions.

Certificate expiry is valuable audit evidence, but the implementation must
identify whether a validity rule is normative for the selected component and
assessment instant before turning it into a conformance failure.

## Cross-document and contextual checks

Some requirements cannot be conclusively checked from one artifact. They need
additional evidence and should otherwise return `inconclusive` or
`not_checked`, not pass:

- sequence number starts at 1 and increases across releases;
- distribution points return identical current LoTE bytes;
- archive URIs expose previous instances where the profile requires them;
- a self-pointer resolves to and authenticates the current profile list;
- pointer identities authenticate the fetched target;
- scheme information pages contain the required policies and explanations;
- service supply points expose the required machine-processable register;
- legal identity and registration claims match authoritative records;
- status history retains all changes for the required period;
- final closed LoTE status semantics are correct.

Network checks must be bounded, optional where dereferencing is not necessary
for local conformance, cached as evidence, and disabled in deterministic unit
tests.

## Published-source conflicts and ambiguities

The validator must not silently invent corrections for these points:

1. Clause 6.1.2 refers to registered URIs in "Annex H", while the URI registry
   is Annex C in V1.1.1.
2. Clause 6.1.4 refers to detailed multilingual rules in "Annex G", while
   those rules are Annex B in V1.1.1.
3. Annex C.2.2 and Table G.1 publish
   `http://uri.etsi.org/19602/WRPRCrovidersList/StatusDetn/EU`, apparently
   missing the `P` in `Providers`, while the surrounding URI family uses
   `WRPRCProvidersList`.
4. Clause 6.3.15 permits `NextUpdate` to be null for a closed LoTE, while the
   published JSON and XML schema types appear to require a date-time value.
5. Clause 6.3.5.1 describes `Locality` as optional and a required `Country`
   element, while the published XML schema makes `Locality` required and uses
   `CountryName`.
6. Clause 6.8 requires every LoTE to be signed, while the base XML schema
   declares `ds:Signature` with `minOccurs="0"`; the semantic rule must
   prevail.
7. The published JSON Schema places one `additionalProperties: false` entry
   inside the `ServiceDigitalIdentity.properties` map rather than at the
   object level, so schema behavior alone may not close that object.

Required policy:

- maintain a versioned `standards-interpretation` registry;
- cite the exact clause/schema path in every exception;
- use the PDF as authoritative where Annex A says it prevails;
- report unresolved cases as `inconclusive`;
- do not normalize a published URI typo without a documented erratum or an
  explicit human-approved compatibility rule.

## Executable task breakdown

The backlog is divided into reviewable tasks below. Each task should be one
focused implementation prompt and one commit; dependencies are intentionally
explicit so normative profile work cannot outrun binding and core semantics.

| Task | Scope | Depends on | Status |
| --- | --- | --- | --- |
| TS602-01 | Separate TS 119 602/TS 119 612 result objects and summaries; add `unsupported`/`inconclusive`; make local JSON checks unconditional; remove the JSON signature-object pass shortcut. | None | Complete |
| TS602-02 | Create the clause/table/profile requirements ledger with stable check IDs, applicability, severity, and normative citations. | TS602-01 | Complete |
| TS602-03 | Classify the three Annex A bindings independently from the data model and selected profile, including guarded TS 119 612 alternative-binding applicability. | TS602-02 | Complete |
| TS602-04 | Pin the official v1.1.1 JSON/XSD schema bundle, hashes, provenance, license, and offline resolvers. | TS602-02 | Complete |
| TS602-05 | Validate the official JSON object/array model and isolate legacy WE BUILD/TSL-like JSON behind a compatibility adapter. | TS602-04 | Complete |
| TS602-06 | Add reusable clause 6.1 validators for URI, strict UTC timestamp, language, country code, and multilingual values. | TS602-02 | Next |
| TS602-07 | Implement clause 6.2/6.3 list metadata, implicit/explicit presence, pointers, dates, distribution points, and critical extensions. | TS602-03, TS602-06 | Pending |
| TS602-08 | Implement clauses 6.4-6.7 entity, service, identity, status, and history semantics. | TS602-04, TS602-06 | Pending |
| TS602-09 | Implement XAdES Baseline B and exact Annex H.4 XML signature constraints, signer evidence, and trust separation. | TS602-03, TS602-08 | Pending |
| TS602-10 | Implement compact JAdES Baseline B parsing, payload recovery, cryptographic verification, certificate evidence, and trust separation. | TS602-05, TS602-08 | Pending |
| TS602-11 | Dispatch and validate all Annex D-I profiles, with positive and focused negative fixtures per requirement family. | TS602-07 through TS602-10 | Pending |
| TS602-12 | Add contextual prior-list, distribution, pointer-authentication, archive, and supply-point checks, then synchronize CLI/API/OpenAPI/report compatibility tests. | TS602-11 | Pending |

TS602-01 establishes result isolation only; it does not claim that any TS
119 602 binding or profile is completely validated.

## Recommended implementation order

### Phase 1 — Result model and requirements ledger

- [x] Add a first-class TS 119 602 result schema.
- [x] Create one stable check ID per normative requirement or coherent
  requirement family, with clause/table/profile citations.
- [x] Add `unsupported` and `inconclusive` statuses.
- [ ] Define binding, data-model, profile, signature, and trust results
  separately.
- [x] Remove all routes that can imply TS 119 602 conformance from presence
  checks alone.

### Phase 2 — Official binding validation

- [x] Pin the official v1.1.1 JSON/XSD schema bundle and hashes.
- [x] Implement offline JSON Schema validation.
- [ ] Implement offline XML Schema validation for scheme-explicit XML.
- [ ] Implement TS 119 612 alternative-binding mapping.
- [x] Correct official JSON parsing and fixtures.
- [x] Keep WE BUILD legacy structures as explicitly non-conformant
  compatibility inputs.

### Phase 3 — Core clauses 6.1-6.7

- [ ] Implement reusable validators for URIs, UTC timestamps, language tags,
  country codes, multilingual values, and addresses.
- [ ] Implement Table 1 implicit/explicit presence rules.
- [ ] Implement list metadata, pointers, entities, services, identities,
  statuses, histories, and critical extensions.
- [ ] Add cross-field consistency checks.

### Phase 4 — Signature profiles

- [ ] Implement compact JAdES Baseline B parsing and verification.
- [ ] Implement XAdES Baseline B property validation.
- [ ] Implement the exact Annex H.4 XML signature constraints.
- [ ] Match signer subject country/organization to scheme metadata.
- [ ] Authenticate target lists using pointer identities.

### Phase 5 — Annex D-I profiles

- [ ] Implement exact profile routing by LoTE type and binding.
- [ ] Implement every scheme-information table.
- [ ] Implement every entity-information table.
- [ ] Implement every service-information table.
- [ ] Implement each profile's signature and history rules.
- [ ] Add one positive and focused negative fixture per requirement family.

### Phase 6 — Contextual validation and product surfaces

- [ ] Add optional prior-list/archive inputs for sequence/history checks.
- [ ] Add bounded distribution, pointer, and supply-point dereferencing.
- [ ] Expose the complete TS 119 602 result through CLI, API, OpenAPI, JSON,
  and Markdown using the same core model.
- [ ] Add schema/version compatibility tests for report consumers.
- [ ] Add optional live smoke tests without making normal tests network
  dependent.

## Definition of a complete check

A complete TS 119 602 check is reached only when:

1. the artifact binding is identified and valid;
2. the applicable official schema passes, with documented handling of known
   PDF/schema conflicts;
3. every applicable core semantic requirement has a result;
4. the correct Annex D-I profile is selected and every additional requirement
   has a result;
5. JAdES or XAdES Baseline B and the profile-specific signature rules pass;
6. signer and pointer identities are validated under an explicit trust model;
7. contextual requirements are checked from supplied/fetched evidence or are
   explicitly `inconclusive`;
8. no mandatory check is `fail`, `not_checked`, `unsupported`, or
   `inconclusive`;
9. the JSON report contains the same findings as Markdown and identifies the
   exact standard version, schemas, algorithms, evidence, and limitations;
10. deterministic positive and negative fixtures cover every implemented
    normative requirement family.

Until those conditions are met, the product should continue to describe its
TS 119 602 output as evidence checks, not full conformance validation.
