import type { ArtifactKind, CheckSeverity } from "../types.js";

export const TS119612_SOURCE = Object.freeze({
  document: "ETSI TS 119 612",
  version: "V2.4.1",
  publicationDate: "2025-08",
  title: "Electronic Signatures and Trust Infrastructures (ESI); Trusted Lists",
  url: "https://www.etsi.org/deliver/etsi_TS/119600_119699/119612/02.04.01_60/ts_119612v020401p.pdf",
  canonicalNamespace: "http://uri.etsi.org/02231/v2#",
  tslVersionIdentifier: 6,
  normativeSections: ["4", "5", "6", "Annex B", "Annex C", "Annex D", "Annex E", "Annex G", "Annex J"],
  schemaPrecedence: "document_text_prevails",
  schemaPrecedenceCitation: "Annex C",
} as const);

export const TS119612_COMPATIBILITY_INPUTS = Object.freeze([
  {
    namespace: "http://uri.etsi.org/19612/v2.4.1#",
    status: "observed_eudi_ri_variant",
    normativeStatus: "not_established",
    treatment: "accepted_with_warning_not_eligible_for_complete_conformance",
  },
] as const);

export type Ts119612ArtifactKind = Extract<ArtifactKind, "ts119612_xml_tsl" | "ts119612_xml_lotl">;
export type Ts119612RequirementCategory =
  | "binding"
  | "schema"
  | "syntax"
  | "structure"
  | "semantic"
  | "signature"
  | "operations"
  | "contextual";
export type Ts119612RequirementLevel = "shall" | "should" | "conditional" | "mixed";
export type Ts119612ImplementationStatus = "implemented" | "partial" | "not_implemented";
export type Ts119612EvidenceScope = "local" | "contextual" | "mixed";

export interface Ts119612Citation {
  location: string;
  title?: string;
}

export interface Ts119612Requirement {
  checkId: `ts119612.${string}`;
  title: string;
  description: string;
  category: Ts119612RequirementCategory;
  requirementLevel: Ts119612RequirementLevel;
  defaultSeverity: CheckSeverity;
  applicability: {
    artifactKinds: readonly Ts119612ArtifactKind[];
    evidenceScope: Ts119612EvidenceScope;
  };
  citations: readonly Ts119612Citation[];
  implementation: {
    status: Ts119612ImplementationStatus;
    existingCheckIds: readonly string[];
  };
}

const BOTH_ARTIFACT_KINDS = ["ts119612_xml_tsl", "ts119612_xml_lotl"] as const;
const TL_ONLY = ["ts119612_xml_tsl"] as const;
const LOTL_ONLY = ["ts119612_xml_lotl"] as const;

export const TS119612_REQUIREMENTS: readonly Ts119612Requirement[] = Object.freeze([
  requirement("ts119612.binding.supported", "Normative artifact selection", "Select ETSI TS 119 612 V2.4.1 only from the TrustServiceStatusList root, canonical namespace and format-version evidence; keep observed variants distinct.", "binding", "shall", "critical", "local", [cite("4"), cite("5.1.1"), cite("Annex D.1")], "partial", ["parse.root_name", "parse.root_namespace", "structure.tsl_version_identifier.value"]),
  requirement("ts119612.format.xml", "XML trusted-list format", "Require the normative XML representation and preserve equivalence as contextual evidence if other representations are published.", "binding", "shall", "critical", "mixed", [cite("5.1.1")], "partial", ["parse.xml"]),
  requirement("ts119612.syntax.uri", "URI syntax", "Validate every URI-valued component using RFC 3986 and component-specific schemes.", "syntax", "shall", "error", "local", [cite("5.1.2")], "partial", ["ts119612.scheme.type", "ts119612.scheme.operator_address", "ts119612.scheme.information_uri", "ts119612.scheme.status_determination", "ts119612.scheme.community_rules", "ts119612.scheme.policy_or_legal_notice", "ts119612.scheme.distribution_points"]),
  requirement("ts119612.syntax.date_time", "Date-time syntax", "Validate the specified UTC date-time lexical form independently from date ordering.", "syntax", "shall", "error", "local", [cite("5.1.3")], "partial", ["dates.issue_valid", "dates.next_update_valid"]),
  requirement("ts119612.syntax.language", "Language and multilingual values", "Validate multilingual strings/pointers, language tags, required English coverage and transliteration rules.", "syntax", "mixed", "error", "local", [cite("5.1.4"), cite("Annex E")], "partial", ["ts119612.scheme.operator_name", "ts119612.scheme.operator_address", "ts119612.scheme.name", "ts119612.scheme.information_uri", "ts119612.scheme.community_rules", "ts119612.scheme.policy_or_legal_notice"]),
  requirement("ts119612.syntax.country_code", "Country-code values", "Validate upper-case ISO 3166-1 values and the defined UK, EL, EU, regional and multi-state alternatives.", "syntax", "shall", "error", "local", [cite("5.1.5")], "partial", ["ts119612.scheme.operator_address", "ts119612.scheme.territory"]),
  requirement("ts119612.structure.tsl_tag", "TSL tag", "Validate presence and exact registered TSLTag representation on the document root.", "structure", "shall", "critical", "local", [cite("5.2.1"), cite("Annex D.1")], "not_implemented"),
  requirement("ts119612.scheme.version", "TSL version identifier", "Require the integer format-version value 6 for V2.4.1.", "semantic", "shall", "critical", "local", [cite("5.3.1")], "implemented", ["structure.tsl_version_identifier", "structure.tsl_version_identifier.value"]),
  requirement("ts119612.scheme.sequence.local", "TSL sequence number", "Validate mandatory integer shape and locally decidable range constraints.", "semantic", "shall", "error", "local", [cite("5.3.2")], "implemented", ["structure.tsl_sequence_number", "ts119612.scheme.sequence.local"]),
  requirement("ts119612.scheme.sequence.history", "TSL sequence progression", "Validate first-release value, monotonic increment and the prohibition on recycling across supplied prior instances.", "contextual", "shall", "error", "contextual", [cite("5.3.2")], "not_implemented"),
  requirement("ts119612.scheme.type", "TSL type", "Validate the mandatory registered type URI and the structure selected by that type.", "semantic", "shall", "critical", "local", [cite("5.3.3"), cite("Annex D")], "partial", ["structure.tsl_type", "ts119612.scheme.type"]),
  requirement("ts119612.scheme.operator_name", "Scheme operator name", "Validate mandatory multilingual operator-name structure and applicable EU/non-EU semantics.", "semantic", "shall", "error", "local", [cite("5.3.4")], "partial", ["structure.scheme_operator_name", "ts119612.scheme.operator_name"]),
  requirement("ts119612.scheme.operator_address", "Scheme operator address", "Validate postal/electronic address cardinality, languages, country, email and web URI rules.", "semantic", "shall", "error", "local", [cite("5.3.5"), cite("5.3.5.1"), cite("5.3.5.2")], "partial", ["structure.scheme_operator_address", "ts119612.scheme.operator_address"]),
  requirement("ts119612.scheme.name", "Scheme name", "Validate multilingual scheme-name structure and territory/name conventions.", "semantic", "shall", "error", "local", [cite("5.3.6")], "partial", ["structure.scheme_name", "ts119612.scheme.name"]),
  requirement("ts119612.scheme.information_uri", "Scheme information URI", "Validate mandatory multilingual pointers and the required policy/usage information at supplied targets.", "semantic", "shall", "error", "mixed", [cite("5.3.7")], "partial", ["structure.scheme_information_uri", "ts119612.scheme.information_uri"]),
  requirement("ts119612.scheme.status_determination", "Status determination approach", "Validate registered EU or scheme-defined status-determination values.", "semantic", "shall", "error", "local", [cite("5.3.8"), cite("Annex D.5.2")], "partial", ["structure.status_determination_approach", "structure.status_determination_approach.value", "ts119612.scheme.status_determination"]),
  requirement("ts119612.scheme.community_rules", "Scheme type/community/rules", "Validate mandatory ordered policy pointers and EUcommon/national rule semantics where applicable.", "semantic", "shall", "error", "mixed", [cite("5.3.9"), cite("Annex D")], "partial", ["structure.scheme_type_community_rules", "ts119612.scheme.community_rules"]),
  requirement("ts119612.scheme.territory", "Scheme territory", "Validate the mandatory country/territory value and its consistency with scheme and signer metadata.", "semantic", "shall", "error", "local", [cite("5.3.10")], "partial", ["structure.scheme_territory", "ts119612.scheme.territory"]),
  requirement("ts119612.scheme.policy_or_legal_notice", "TSL policy/legal notice", "Validate multilingual policy text/pointer alternatives and applicable EU legal-notice content.", "semantic", "shall", "error", "mixed", [cite("5.3.11")], "partial", ["ts119612.scheme.policy_or_legal_notice"]),
  requirement("ts119612.scheme.history_period", "Historical information period", "Validate mandatory integer history period and its consequences for retained service history.", "semantic", "shall", "error", "mixed", [cite("5.3.12")], "partial", ["ts119612.scheme.history_period"]),
  requirement("ts119612.scheme.pointers.structure", "Pointers to other TSLs", "Validate pointer location, service digital identities, qualifiers, MIME type and cardinalities.", "structure", "conditional", "error", "local", [cite("5.3.13")], "not_implemented", [], LOTL_ONLY),
  requirement("ts119612.scheme.pointers.authentication", "Pointed-list authentication", "Authenticate a pointed list using at least one declared service identity before its contents are used.", "contextual", "shall", "critical", "contextual", [cite("5.3.13"), cite("Annex A")], "not_implemented", [], LOTL_ONLY),
  requirement("ts119612.scheme.issue_time", "List issue date and time", "Validate mandatory lexical form and consistency with signing/status-change evidence.", "semantic", "shall", "error", "mixed", [cite("5.3.14"), cite("5.5.5")], "partial", ["structure.list_issue_date_time", "dates.issue_valid", "ts119612.scheme.issue_time"]),
  requirement("ts119612.scheme.next_update", "Next update", "Validate mandatory date, ordering, expiry and the exact applicable maximum update interval.", "semantic", "shall", "error", "mixed", [cite("5.3.15")], "implemented", ["structure.next_update", "dates.next_update_valid", "dates.next_after_issue", "dates.update_period_days", "dates.next_update_expired", "ts119612.scheme.next_update"]),
  requirement("ts119612.scheme.distribution_points", "Distribution points", "Validate optional distribution-point URI structure and stable publication semantics.", "structure", "conditional", "error", "mixed", [cite("5.3.16")], "partial", ["structure.distribution_points", "ts119612.scheme.distribution_points"]),
  requirement("ts119612.scheme.distribution_consistency", "Distribution consistency", "Dereference supplied distribution points and compare the returned binary TL with the assessed instance.", "contextual", "shall", "error", "contextual", [cite("5.3.16"), cite("6.1")], "not_implemented"),
  requirement("ts119612.scheme.extensions", "Scheme extensions", "Validate extension structure/criticality and reject unrecognized critical extensions.", "semantic", "conditional", "critical", "local", [cite("5.3.17"), cite("Annex B.0")], "implemented", ["ts119612.scheme.extensions"]),
  requirement("ts119612.providers.list", "Trust service provider list", "Validate conditional presence/absence and exact provider-list nesting selected by TSL type and supplied approval-history evidence.", "structure", "conditional", "critical", "mixed", [cite("5.3.18")], "partial", ["ts119612.providers.list", "structure.trust_service_provider_list", "services.tsp_count"], TL_ONLY),
  requirement("ts119612.tsp.name", "TSP name", "Validate mandatory multilingual legal-name structure.", "semantic", "shall", "error", "local", [cite("5.4.1")], "partial", ["services.tsp.1.name", "ts119612.tsp.1.name"], TL_ONLY),
  requirement("ts119612.tsp.trade_name", "TSP trade name", "Validate the mandatory multilingual official-identifier structure and optional alternative trade-name values.", "semantic", "shall", "error", "mixed", [cite("5.4.2")], "partial", ["ts119612.tsp.1.trade_name"], TL_ONLY),
  requirement("ts119612.tsp.address", "TSP address", "Validate mandatory postal/electronic address structures and contact semantics.", "semantic", "shall", "error", "local", [cite("5.4.3"), cite("5.4.3.1"), cite("5.4.3.2")], "partial", ["services.tsp.1.address", "ts119612.tsp.1.address"], TL_ONLY),
  requirement("ts119612.tsp.information_uri", "TSP information URI", "Validate mandatory multilingual information pointers and supplied target content.", "semantic", "shall", "error", "mixed", [cite("5.4.4")], "partial", ["ts119612.tsp.1.information_uri"], TL_ONLY),
  requirement("ts119612.tsp.extensions", "TSP information extensions", "Validate extension structure, criticality and recognized semantics.", "semantic", "conditional", "critical", "local", [cite("5.4.5"), cite("Annex B.0")], "partial", ["ts119612.tsp.1.extensions"], TL_ONLY),
  requirement("ts119612.tsp.services", "TSP services list", "Validate mandatory non-empty TSPServices/TSPService nesting and cardinality.", "structure", "shall", "critical", "local", [cite("5.4.6")], "implemented", ["services.tsp.1.service_count", "ts119612.tsp.1.services", "ts119612.service.1.1.container"], TL_ONLY),
  requirement("ts119612.service.type", "Service type identifier", "Validate mandatory registered service-type values and conditional identity/extension rules.", "semantic", "shall", "critical", "local", [cite("5.5.1"), cite("5.5.1.1"), cite("5.5.1.2"), cite("5.5.1.3"), cite("Annex D")], "partial", ["services.tsp.1.service.1.type_identifier", "ts119612.service.1.1.type"], TL_ONLY),
  requirement("ts119612.service.name", "Service name", "Validate mandatory multilingual service-name structure.", "semantic", "shall", "error", "local", [cite("5.5.2")], "implemented", ["services.tsp.1.service.1.service_name", "ts119612.service.1.1.name"], TL_ONLY),
  requirement("ts119612.service.digital_identity", "Service digital identity", "Validate mandatory identity alternatives, equivalence, PKI/non-PKI rules and certificate evidence.", "semantic", "shall", "critical", "local", [cite("5.5.3")], "partial", ["services.tsp.1.service.1.digital_identity", "ts119612.service.1.1.digital_identity", "certificates.service.1.parse", "certificates.service.1.validity"], TL_ONLY),
  requirement("ts119612.service.status", "Service current status", "Validate mandatory registered status and its consistency with type, history and applicable legal context.", "semantic", "shall", "critical", "local", [cite("5.5.4"), cite("Annex D")], "partial", ["services.tsp.1.service.1.status", "ts119612.service.1.1.status"], TL_ONLY),
  requirement("ts119612.service.status_start", "Current status starting time", "Validate mandatory UTC time and consistency with issuance and status-change evidence.", "semantic", "shall", "error", "local", [cite("5.5.5")], "partial", ["services.tsp.1.service.1.status_starting_time", "ts119612.service.1.1.status_start"], TL_ONLY),
  requirement("ts119612.service.scheme_definition", "Scheme service definition URI", "Validate optional multilingual scheme-level service-definition pointers and supplied target content.", "semantic", "conditional", "error", "mixed", [cite("5.5.6")], "partial", ["ts119612.service.1.1.scheme_definition", "ts119612.service.1.1.unspecified_definition"], TL_ONLY),
  requirement("ts119612.service.supply_points", "Service supply points", "Validate optional supply-point URI structure and content required by the service type.", "semantic", "conditional", "error", "mixed", [cite("5.5.7")], "partial", ["ts119612.service.1.1.supply_points"], TL_ONLY),
  requirement("ts119612.service.tsp_definition", "TSP service definition URI", "Validate multilingual provider-level service-definition pointers, NationalRootCA-QC presence and supplied target content.", "semantic", "conditional", "error", "mixed", [cite("5.5.8")], "partial", ["ts119612.service.1.1.tsp_definition"], TL_ONLY),
  requirement("ts119612.service.extensions", "Service information extensions", "Validate extension structure, criticality and cross-field semantics.", "semantic", "conditional", "critical", "local", [cite("5.5.9"), cite("Annex B.0")], "partial", ["ts119612.service.1.1.extensions"], TL_ONLY),
  requirement("ts119612.service.extension.expired_certs", "Expired certificate revocation extension", "Validate expiredCertsRevocationInfo structure and applicability.", "semantic", "conditional", "error", "local", [cite("5.5.9.1")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.service.extension.qualifications", "Qualifications extension", "Validate QualificationElement, CriteriaList and Qualifier rules.", "semantic", "conditional", "error", "local", [cite("5.5.9.2")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.service.extension.taken_over_by", "TakenOverBy extension", "Validate takeover identity, service and status relationships.", "semantic", "conditional", "error", "local", [cite("5.5.9.3")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.service.extension.additional_information", "Additional service information extension", "Validate registered additional-service identifiers and service-type dependencies.", "semantic", "conditional", "error", "local", [cite("5.5.9.4"), cite("Annex D")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.service.history", "Service history list", "Validate optional history presence, descending order and retention completeness.", "semantic", "conditional", "error", "mixed", [cite("5.5.10"), cite("5.3.12")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.history.type", "Historical service type", "Validate mandatory service type within each history instance.", "semantic", "shall", "error", "local", [cite("5.6.1")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.history.name", "Historical service name", "Validate mandatory multilingual service name within each history instance.", "semantic", "shall", "error", "local", [cite("5.6.2")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.history.digital_identity", "Historical service identity", "Validate mandatory historical identity and continuity/equivalence rules.", "semantic", "shall", "critical", "local", [cite("5.6.3")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.history.status", "Historical service status", "Validate mandatory registered previous status and transition semantics.", "semantic", "shall", "error", "local", [cite("5.6.4"), cite("Annex D")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.history.status_start", "Historical status starting time", "Validate mandatory UTC time and ordering across history instances.", "semantic", "shall", "error", "local", [cite("5.6.5")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.history.extensions", "Historical service extensions", "Validate optional history extension structure and semantics.", "semantic", "conditional", "error", "local", [cite("5.6.6")], "not_implemented", [], TL_ONLY),
  requirement("ts119612.signature.required", "Digitally signed trusted list", "Require an enveloped XAdES-B-B signature by the scheme operator.", "signature", "shall", "critical", "local", [cite("5.7.1"), cite("Annex B.1")], "partial", ["signature.present", "signature.xades_properties_detected", "signature.xades_baseline_b.structure"]),
  requirement("ts119612.signature.algorithm", "Signature algorithm", "Validate the signature algorithm and certified key against the applicable ETSI TS 119 312 usable-key requirements.", "signature", "shall", "critical", "local", [cite("5.7.1"), cite("5.7.2")], "partial", ["signature.cryptographic_verification_result"]),
  requirement("ts119612.signature.document_coverage", "Signature value and document coverage", "Validate the signature value, enveloped reference, exact transforms/canonicalization and coverage of every TL field except the signature value.", "signature", "shall", "critical", "local", [cite("5.7.3"), cite("Annex B.1")], "partial", ["signature.reference_uris", "signature.expected_root_reference", "signature.cryptographic_verification_result"]),
  requirement("ts119612.signature.certificate_profile", "Scheme-operator signing certificate", "Validate KeyInfo cardinality, issuer, subject matching, key usage, extended key usage, SKI and basic constraints.", "signature", "shall", "critical", "local", [cite("5.7.1")], "partial", ["signature.signing_certificate_parsed", "signature.first_list_certificate_exact_match"]),
  requirement("ts119612.signature.signer_trust", "Scheme-operator signer trust", "Authenticate the signing certificate using explicit LOTL, community or directly configured trust evidence without trusting KeyInfo by itself.", "contextual", "shall", "critical", "contextual", [cite("5.7.1"), cite("Annex A")], "not_implemented"),
  requirement("ts119612.operations.publication", "TL publication", "Validate stable direct HTTP publication, .xml/.xtsl path rules, cache behavior and companion SHA-256 digest publication.", "operations", "mixed", "error", "contextual", [cite("6.1")], "not_implemented"),
  requirement("ts119612.operations.transport", "HTTP transport and media type", "Validate application/vnd.etsi.tsl+xml transport and registered file extensions.", "operations", "shall", "error", "contextual", [cite("6.2"), cite("6.2.1"), cite("6.2.2")], "not_implemented"),
  requirement("ts119612.operations.token_distribution_points", "TL distribution points in tokens", "Validate non-critical token extensions and continued resolution to the latest applicable TL or LoTL.", "operations", "mixed", "error", "contextual", [cite("6.3")], "not_implemented"),
  requirement("ts119612.operations.availability", "TL availability", "Assess 24x7 and annual 99.9 percent availability only from explicit monitoring evidence.", "operations", "shall", "error", "contextual", [cite("6.4")], "not_implemented"),
  requirement("ts119612.operations.practices", "TLSO practices", "Assess documented measures, change management and security procedures only from supplied policy/audit evidence.", "operations", "shall", "error", "contextual", [cite("6.5")], "not_implemented"),
  requirement("ts119612.binding.xml_schema", "Official XML schema", "Validate the integrity-checked V2.4.1 Annex C schema set offline while retaining document-over-schema precedence.", "schema", "shall", "critical", "local", [cite("Annex B.0"), cite("Annex C")], "implemented", ["schema.xsd"]),
  requirement("ts119612.registry.uris", "Registered URI vocabulary", "Validate applicable registered values and relationships from normative Annex D.", "semantic", "shall", "error", "local", [cite("Annex D")], "partial", ["structure.status_determination_approach.value"]),
  requirement("ts119612.multilingual.annex_e", "Annex E multilingual implementation", "Validate language/country tables, required transliteration and character restrictions.", "syntax", "shall", "error", "local", [cite("Annex E")], "not_implemented"),
  requirement("ts119612.management.annex_g", "Management and policy considerations", "Assess administrative changes, service identification and status/identity changes, amendment timing, ongoing authenticity, user references and TL size using supplied local and operational evidence.", "operations", "mixed", "error", "mixed", [cite("Annex G")], "not_implemented"),
  requirement("ts119612.migration.annex_j", "EU trusted-list migration", "Apply Annex J migration rules only when the assessed historical/current EU context makes them applicable.", "semantic", "conditional", "error", "mixed", [cite("Annex J")], "not_implemented"),
]);

export interface Ts119612RequirementFilter {
  artifactKind?: Ts119612ArtifactKind;
  evidenceScope?: Ts119612EvidenceScope;
  implementationStatus?: Ts119612ImplementationStatus;
}

export function findTs119612Requirement(checkId: string): Ts119612Requirement | undefined {
  return TS119612_REQUIREMENTS.find((entry) => entry.checkId === checkId);
}

export function filterTs119612Requirements(filter: Ts119612RequirementFilter): Ts119612Requirement[] {
  return TS119612_REQUIREMENTS.filter((entry) =>
    (!filter.artifactKind || entry.applicability.artifactKinds.includes(filter.artifactKind))
    && (!filter.evidenceScope || entry.applicability.evidenceScope === filter.evidenceScope)
    && (!filter.implementationStatus || entry.implementation.status === filter.implementationStatus),
  );
}

export function summarizeTs119612Requirements(): {
  standard: typeof TS119612_SOURCE;
  compatibilityInputs: typeof TS119612_COMPATIBILITY_INPUTS;
  total: number;
  implemented: number;
  partial: number;
  notImplemented: number;
  complete: boolean;
} {
  const implemented = countStatus("implemented");
  const partial = countStatus("partial");
  const notImplemented = countStatus("not_implemented");
  return {
    standard: TS119612_SOURCE,
    compatibilityInputs: TS119612_COMPATIBILITY_INPUTS,
    total: TS119612_REQUIREMENTS.length,
    implemented,
    partial,
    notImplemented,
    complete: implemented === TS119612_REQUIREMENTS.length,
  };
}

function requirement(
  checkId: `ts119612.${string}`,
  title: string,
  description: string,
  category: Ts119612RequirementCategory,
  requirementLevel: Ts119612RequirementLevel,
  defaultSeverity: CheckSeverity,
  evidenceScope: Ts119612EvidenceScope,
  citations: readonly Ts119612Citation[],
  implementationStatus: Ts119612ImplementationStatus = "not_implemented",
  existingCheckIds: readonly string[] = [],
  artifactKinds: readonly Ts119612ArtifactKind[] = BOTH_ARTIFACT_KINDS,
): Ts119612Requirement {
  return {
    checkId,
    title,
    description,
    category,
    requirementLevel,
    defaultSeverity,
    applicability: { artifactKinds, evidenceScope },
    citations,
    implementation: { status: implementationStatus, existingCheckIds },
  };
}

function cite(location: string, title?: string): Ts119612Citation {
  return { location, title };
}

function countStatus(status: Ts119612ImplementationStatus): number {
  return TS119612_REQUIREMENTS.filter((entry) => entry.implementation.status === status).length;
}
