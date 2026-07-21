import type {
  CheckSeverity,
  Ts119602Binding as ClassifiedTs119602Binding,
  Ts119602Profile as ClassifiedTs119602Profile,
} from "../types.js";

export const TS119602_SOURCE = Object.freeze({
  document: "ETSI TS 119 602",
  version: "V1.1.1",
  publicationDate: "2025-11",
  title: "Electronic Signatures and Trust Infrastructures (ESI); Lists of trusted entities; Data model",
  url: "https://www.etsi.org/deliver/etsi_TS/119600_119699/119602/01.01.01_60/ts_119602v010101p.pdf",
  schemaPrecedence: "document_text_prevails",
  schemaPrecedenceCitation: "Annex A.1 and Annex A.2.1",
} as const);

export type Ts119602Binding = Exclude<ClassifiedTs119602Binding, "unknown">;
export type Ts119602Profile = Exclude<ClassifiedTs119602Profile, "unknown">;

export type Ts119602RequirementCategory =
  | "binding"
  | "schema"
  | "syntax"
  | "structure"
  | "semantic"
  | "signature"
  | "profile"
  | "contextual";

export type Ts119602RequirementLevel = "shall" | "should" | "conditional" | "mixed";
export type Ts119602ImplementationStatus = "implemented" | "partial" | "not_implemented";
export type Ts119602EvidenceScope = "local" | "contextual" | "mixed";
export type Ts119602SchemeMode = "implicit" | "explicit";

export interface Ts119602Citation {
  location: string;
  title?: string;
}

export interface Ts119602Requirement {
  /** Stable finding/check identifier reserved for this requirement family. */
  checkId: `ts119602.${string}`;
  title: string;
  description: string;
  category: Ts119602RequirementCategory;
  requirementLevel: Ts119602RequirementLevel;
  defaultSeverity: CheckSeverity;
  applicability: {
    bindings: readonly Ts119602Binding[];
    profiles: readonly Ts119602Profile[];
    schemeModes: readonly Ts119602SchemeMode[];
    evidenceScope: Ts119602EvidenceScope;
  };
  citations: readonly Ts119602Citation[];
  implementation: {
    status: Ts119602ImplementationStatus;
    existingCheckIds: readonly string[];
  };
}

export const TS119602_BINDINGS = Object.freeze([
  "scheme_explicit_json",
  "scheme_explicit_xml",
  "ts119612_alternative_xml",
] as const satisfies readonly Ts119602Binding[]);

export const TS119602_PROFILES = Object.freeze([
  "pid_providers",
  "wallet_providers",
  "wrpac_providers",
  "wrprc_providers",
  "pub_eaa_providers",
  "registrars_and_registers",
] as const satisfies readonly Ts119602Profile[]);

const BOTH_SCHEME_MODES = ["implicit", "explicit"] as const;
const EXPLICIT_SCHEME_MODE = ["explicit"] as const;

const CORE_REQUIREMENTS = [
  requirement("ts119602.binding.supported", "Normative binding selection", "Identify a supported Annex A JSON or XML binding before applying data-model or profile checks.", "binding", "shall", "critical", "local", [citation("6.1.1"), citation("Annex A", "Bindings")], "implemented", ["ts119602.binding.supported"]),
  requirement("ts119602.syntax.uri", "URI syntax", "Validate URI-valued components using RFC 3986 and any component-specific URI scheme rules.", "syntax", "shall", "error", "local", [citation("6.1.2")], "partial", ["ts119602.syntax.uri"]),
  requirement("ts119602.syntax.date_time", "Date-time lexical form", "Validate the exact ISO 8601 UTC form with seconds, no decimal fraction, and the Z designator.", "syntax", "shall", "error", "local", [citation("6.1.3")], "implemented", ["ts119602.syntax.date_time", "json_lote.dates.issue_valid", "json_lote.dates.next_update_valid", "xml_lote.dates.issue_valid", "xml_lote.dates.next_update_valid"]),
  requirement("ts119602.syntax.language", "Language and multilingual values", "Validate English coverage, lower-case RFC 5646 tags, multilingual strings/pointers, transliteration, and character restrictions.", "syntax", "mixed", "error", "mixed", [citation("6.1.4"), citation("Annex B", "Implementation requirements for multilingual support")], "partial", ["ts119602.syntax.language", "ts119602.language.annex_b"]),
  requirement("ts119602.syntax.country_code", "Country-code values", "Validate upper-case country codes, ISO 3166-1 values, and the defined UK, EL, EU, regional, and multi-state alternatives.", "syntax", "shall", "error", "local", [citation("6.1.5")], "partial", ["ts119602.syntax.country_code"]),
  requirement("ts119602.structure.lote_tag", "LoTE tag", "Validate the binding-specific representation and value of the LoTE tag.", "structure", "shall", "error", "local", [citation("6.2")], "partial", ["ts119602.structure.lote_tag"]),
  requirement("ts119602.structure.scheme_information_presence", "Implicit and explicit scheme-information presence", "Apply the mandatory, optional, and prohibited component matrix for the selected scheme-information mode.", "structure", "shall", "critical", "local", [citation("6.3.0"), citation("Table 1", "Implicit and explicit scheme information")], "partial", ["ts119602.structure.scheme_information_presence", "json_lote.list_and_scheme_information", "xml_lote.structure.list_and_scheme_information"]),
  requirement("ts119602.scheme.version", "LoTE version identifier", "Validate the version identifier type and the value required by the selected profile and binding.", "semantic", "shall", "error", "local", [citation("6.3.1")], "partial", ["ts119602.scheme.version", "json_lote.version_identifier", "xml_lote.structure.version_identifier"]),
  requirement("ts119602.scheme.sequence.local", "LoTE sequence number", "Validate that the sequence number is an integer in the locally valid range.", "semantic", "shall", "error", "local", [citation("6.3.2")], "partial", ["ts119602.scheme.sequence.local", "json_lote.sequence_number", "xml_lote.structure.sequence_number"]),
  requirement("ts119602.scheme.sequence.history", "LoTE sequence progression", "Validate first-release value, monotonic increase, and the prohibition on resetting across supplied prior list instances.", "contextual", "shall", "error", "contextual", [citation("6.3.2")]),
  requirement("ts119602.scheme.type", "LoTE type", "Validate the LoTE type URI and its consistency with the selected profile.", "semantic", "shall", "critical", "local", [citation("6.3.3"), citation("Annex C.2.1", "EU-specific LoTE type URIs")], "partial", ["json_lote.type", "xml_lote.structure.type"]),
  requirement("ts119602.scheme.operator_name", "Scheme operator name", "Validate the multilingual scheme-operator name structure and applicable profile semantics.", "semantic", "shall", "error", "local", [citation("6.3.4")], "partial", ["json_lote.scheme_operator_name", "xml_lote.structure.scheme_operator_name"]),
  requirement("ts119602.scheme.operator_address", "Scheme operator address", "Validate postal and electronic address structure, languages, country, email, web, and telephone rules.", "semantic", "conditional", "error", "local", [citation("6.3.5"), citation("6.3.5.1"), citation("6.3.5.2")], "partial", ["ts119602.scheme.operator_address", "xml_lote.structure.scheme_operator_address"]),
  requirement("ts119602.scheme.name", "Scheme name", "Validate the multilingual scheme name and the required territory/name form.", "semantic", "conditional", "error", "local", [citation("6.3.6")], "partial", ["ts119602.scheme.name", "xml_lote.structure.scheme_name"]),
  requirement("ts119602.scheme.information_uri", "Scheme information URI", "Validate multilingual information pointers and profile-specific information/archive targets.", "semantic", "conditional", "error", "mixed", [citation("6.3.7")], "partial", ["json_lote.scheme_information_uri", "xml_lote.structure.scheme_information_uri"]),
  requirement("ts119602.scheme.status_determination", "Status determination approach", "Validate the registered status-determination URI required by the selected profile.", "semantic", "conditional", "error", "local", [citation("6.3.8"), citation("Annex C.2.2", "Status determination URIs")], "partial", ["json_lote.status_determination_approach", "xml_lote.structure.status_determination_approach"]),
  requirement("ts119602.scheme.community_rules", "Scheme type/community/rules", "Validate the registered scheme-rules URI and its pointed-to policy semantics where evidence is supplied.", "semantic", "conditional", "error", "mixed", [citation("6.3.9"), citation("Annex C.2.3", "Scheme type/community/rules URIs")], "partial", ["xml_lote.structure.scheme_type_community_rules"]),
  requirement("ts119602.scheme.territory", "Scheme territory", "Validate the scheme-territory value and selected-profile restriction.", "semantic", "conditional", "error", "local", [citation("6.3.10")], "partial", ["json_lote.scheme_territory", "xml_lote.structure.scheme_territory"]),
  requirement("ts119602.scheme.policy_or_legal_notice", "Policy or legal notice", "Validate the multilingual policy text or pointer alternatives required for explicit scheme information.", "semantic", "conditional", "error", "mixed", [citation("6.3.11")], "partial", ["ts119602.scheme.policy_or_legal_notice", "xml_lote.structure.policy_or_legal_notice"]),
  requirement("ts119602.scheme.history_period", "Historical information period", "Validate the integer history period, special value 65535, and consequences for service status and history.", "semantic", "conditional", "error", "local", [citation("6.3.12")], "partial", ["ts119602.scheme.history_period"]),
  requirement("ts119602.scheme.pointers.structure", "Pointers to other LoTEs", "Validate pointer location, one-or-more digital identities, qualifiers, and binding cardinalities.", "structure", "conditional", "error", "local", [citation("6.3.13")], "partial", ["ts119602.scheme.pointers.structure", "json_lote.pointers.count", "json_lote.pointers.service_digital_identities"]),
  requirement("ts119602.scheme.pointers.authentication", "Pointed-to LoTE authentication", "Require at least one pointer identity to authenticate the pointed-to LoTE before use.", "contextual", "shall", "critical", "contextual", [citation("6.3.13")]),
  requirement("ts119602.scheme.issue_time", "List issue date and time", "Validate lexical form and issuance-time semantics.", "semantic", "shall", "error", "local", [citation("6.3.14")], "partial", ["ts119602.scheme.issue_time", "json_lote.list_issue_date_time", "xml_lote.structure.list_issue_date_time"]),
  requirement("ts119602.scheme.next_update", "Next update and closed LoTE", "Validate ordering, expiry, profile update interval, and null semantics for a final closed LoTE.", "semantic", "mixed", "error", "mixed", [citation("6.3.15")], "partial", ["ts119602.scheme.next_update", "json_lote.dates.next_after_issue", "json_lote.dates.next_update_expired", "xml_lote.dates.next_after_issue"]),
  requirement("ts119602.scheme.distribution_points", "Distribution point structure", "Validate a non-empty sequence of distribution-point URIs when the component is present.", "structure", "conditional", "error", "local", [citation("6.3.16")], "partial", ["ts119602.scheme.distribution_points", "json_lote.distribution_points"]),
  requirement("ts119602.scheme.distribution_consistency", "Distribution point consistency", "Dereference supplied distribution points and verify that each returns the current identical LoTE.", "contextual", "shall", "error", "contextual", [citation("6.3.16")]),
  requirement("ts119602.scheme.extensions", "Scheme extensions and criticality", "Validate extension criticality and reject unknown critical extensions.", "semantic", "conditional", "critical", "local", [citation("6.3.17")], "partial", ["ts119602.scheme.extensions"]),
  requirement("ts119602.entities.list", "Trusted entities list", "Validate presence or absence according to whether any entity service is or was approved, and validate non-empty entity structure.", "structure", "conditional", "critical", "local", [citation("6.4.0")], "partial", ["ts119602.entities.list", "xml_lote.structure.trusted_entities_container", "xml_lote.services.trusted_entity_count"]),
  requirement("ts119602.entities.structure", "Trusted entity and service containers", "Validate TrustedEntityInformation, TrustedEntityServices, TrustedEntityService, and optional history nesting and cardinality.", "structure", "shall", "critical", "local", [citation("6.4.1"), citation("6.4.2"), citation("6.4.3"), citation("6.4.4")], "partial", ["ts119602.entities.structure", "xml_lote.services.entity.1.information", "xml_lote.services.entity.1.service_count"]),
  requirement("ts119602.entity.information", "Trusted entity information", "Validate mandatory name, address, information URI, optional trade name, and extensions.", "structure", "shall", "critical", "local", [citation("6.5.0")], "partial", ["ts119602.entity.information", "xml_lote.services.entity.1.name", "xml_lote.services.entity.1.address"]),
  requirement("ts119602.entity.names", "Trusted entity names", "Validate legal or natural-person name and optional trade-name semantics.", "semantic", "mixed", "error", "local", [citation("6.5.1"), citation("6.5.2")], "partial", ["ts119602.entity.names", "xml_lote.services.entity.1.name"]),
  requirement("ts119602.entity.address", "Trusted entity address", "Validate multilingual postal and electronic addresses and their contact semantics.", "semantic", "shall", "error", "local", [citation("6.5.3"), citation("6.5.3.1"), citation("6.5.3.2")], "partial", ["ts119602.entity.address", "xml_lote.services.entity.1.address"]),
  requirement("ts119602.entity.information_uri", "Trusted entity information URI", "Validate mandatory multilingual pointers to information about the trusted entity.", "semantic", "shall", "error", "mixed", [citation("6.5.4")], "partial", ["ts119602.entity.information_uri"]),
  requirement("ts119602.entity.extensions", "Trusted entity and associated-body extensions", "Validate extension structure, criticality, and all selected-profile associated-body requirements.", "semantic", "conditional", "error", "local", [citation("6.5.5"), citation("6.5.5.1", "Associated body extension")], "partial", ["ts119602.entity.extensions"]),
  requirement("ts119602.service.information", "Service information structure", "Validate mandatory name and digital identity and all conditional components and cross-field presence rules.", "structure", "shall", "critical", "local", [citation("6.6.0")], "partial", ["ts119602.service.information", "xml_lote.services.entity.1.service.1.service_name", "xml_lote.services.entity.1.service.1.digital_identity"]),
  requirement("ts119602.service.type", "Service type identifier", "Validate the optional base URI and any selected-profile allowed-value restriction without inventing a universal presence rule.", "semantic", "conditional", "error", "local", [citation("6.6.1")], "partial", ["ts119602.service.type", "xml_lote.services.entity.1.service.1.type_identifier"]),
  requirement("ts119602.service.name", "Service name", "Validate multilingual service-name structure and selected-profile semantics.", "semantic", "shall", "error", "local", [citation("6.6.2")], "partial", ["ts119602.service.name", "xml_lote.services.entity.1.service.1.service_name"]),
  requirement("ts119602.service.digital_identity", "Service digital identity", "Validate identity alternatives, strict Base64 and DN forms, certificate/key/SKI equivalence, and PKI certificate presence.", "semantic", "shall", "critical", "local", [citation("6.6.3"), citation("6.6.3.1"), citation("6.6.3.2"), citation("6.6.3.3"), citation("6.6.3.4")], "partial", ["ts119602.service.digital_identity", "ts119602.service.identity_equivalence", "xml_lote.services.entity.1.service.1.digital_identity"]),
  requirement("ts119602.service.status", "Service status", "Validate status presence, registered value, and consistency with history period and selected profile.", "semantic", "conditional", "error", "local", [citation("6.6.4")], "partial", ["ts119602.service.status"]),
  requirement("ts119602.service.status_start", "Status starting time", "Validate lexical form and consistency with list issuance and current status.", "semantic", "conditional", "error", "local", [citation("6.6.5")], "partial", ["ts119602.service.status_start"]),
  requirement("ts119602.service.scheme_definition", "Scheme service definition URI", "Validate multilingual scheme-level service-definition pointers.", "semantic", "conditional", "error", "mixed", [citation("6.6.6")], "partial", ["ts119602.service.scheme_definition"]),
  requirement("ts119602.service.supply_points", "Service supply points", "Validate service supply-point URI structure and selected-profile machine-processable endpoint rules.", "semantic", "conditional", "error", "mixed", [citation("6.6.7")], "partial", ["ts119602.service.supply_points"]),
  requirement("ts119602.service.definition", "TE service definition URI", "Validate multilingual pointers to trusted-entity service information.", "semantic", "conditional", "error", "mixed", [citation("6.6.8")], "partial", ["ts119602.service.definition"]),
  requirement("ts119602.service.extensions", "Service information extensions", "Validate extension structure and selected-profile service unique identifier requirements.", "semantic", "conditional", "error", "local", [citation("6.6.9"), citation("6.6.9.1", "Service unique identifier extension")], "partial", ["ts119602.service.extensions"]),
  requirement("ts119602.service.history", "Service history instances", "Validate mandatory history fields, ordering, retained identity semantics, and profile-specific restrictions.", "semantic", "conditional", "error", "local", [citation("6.7")], "partial", ["ts119602.service.history"]),
  requirement("ts119602.signature.baseline_b", "AdES Baseline B signature", "Validate a Baseline B signature, signer subject country/organization matching, cryptographic validity, certificate validity, and explicit signer trust separately.", "signature", "shall", "critical", "local", [citation("6.8.0"), citation("6.8.1")], "implemented", ["signature.present", "signature.xades_baseline_b.structure", "signature.xades_baseline_b.mandatory_elements", "signature.xades_baseline_b.signing_time", "signature.xades_baseline_b.signing_certificate_reference", "signature.xades_baseline_b.data_object_formats", "signature.xades_baseline_b.reference_digests", "signature.xades_baseline_b.prohibited_legacy_properties", "signature.cryptographic_verification_result", "signature.signing_certificate_validity", "signature.signer_subject.country", "signature.signer_subject.organization", "signature.signer_trust", "json_lote.signature.jades_compact_serialization", "json_lote.signature.jades_baseline_b", "json_lote.signature.jades_payload_match", "json_lote.signature.jades_cryptographic_verification_result", "json_lote.signature.jades_signing_certificate_validity", "json_lote.signature.jades_signer_subject.country", "json_lote.signature.jades_signer_subject.organization", "json_lote.signature.jades_signer_trust"]),
  requirement("ts119602.binding.json_schema", "Official scheme-explicit JSON binding", "Validate the pinned official JSON schema offline and retain semantic checks where document text prevails.", "schema", "shall", "critical", "local", [citation("Annex A.1", "JSON bindings")], "implemented", ["ts119602.binding.json_schema"], ["scheme_explicit_json"]),
  requirement("ts119602.binding.xml_schema", "Official scheme-explicit XML binding", "Validate the pinned official XML schema offline and retain semantic checks where document text prevails.", "schema", "shall", "critical", "local", [citation("Annex A.2.1", "ETSI TS 119 602 schema")], "partial", ["xml_lote.structure.xml_binding"], ["scheme_explicit_xml"]),
  requirement("ts119602.binding.ts119612_mapping", "TS 119 612 alternative XML binding", "Validate the applicable TS 119 612 schema and map components through Table A.1 before applying TS 119 602 profile rules.", "binding", "shall", "critical", "local", [citation("Annex A.2.2", "ETSI TS 119 612 schema"), citation("Table A.1", "Mapping of TS 119 612 fields to TS 119 602 components")], "not_implemented", [], ["ts119612_alternative_xml"]),
  requirement("ts119602.language.annex_b", "Normative multilingual implementation", "Apply Annex B character, encoding, pointer, and parser interoperability requirements.", "syntax", "mixed", "error", "mixed", [citation("Annex B")], "partial", ["ts119602.language.annex_b"]),
  requirement("ts119602.uri_registry.annex_c", "Registered EU profile URIs", "Compare registered LoTE type, status, rules, service type, status, and related URIs exactly, preserving published ambiguities.", "semantic", "shall", "error", "local", [citation("Annex C")], "implemented", ["ts119602.profile.dispatch", "ts119602.profile.pid_providers.scheme_information", "ts119602.profile.wallet_providers.scheme_information", "ts119602.profile.wrpac_providers.scheme_information", "ts119602.profile.wrprc_providers.scheme_information", "ts119602.profile.pub_eaa_providers.scheme_information", "ts119602.profile.registrars_and_registers.scheme_information"]),
] as const satisfies readonly Ts119602Requirement[];

interface ProfileDefinition {
  profile: Ts119602Profile;
  annex: "D" | "E" | "F" | "G" | "H" | "I";
  label: string;
  bindings: readonly Ts119602Binding[];
}

const PROFILE_DEFINITIONS = [
  { profile: "pid_providers", annex: "D", label: "PID providers", bindings: ["scheme_explicit_json"] },
  { profile: "wallet_providers", annex: "E", label: "wallet providers", bindings: ["scheme_explicit_json"] },
  { profile: "wrpac_providers", annex: "F", label: "WRPAC providers", bindings: ["scheme_explicit_json"] },
  { profile: "wrprc_providers", annex: "G", label: "WRPRC providers", bindings: ["scheme_explicit_json"] },
  { profile: "pub_eaa_providers", annex: "H", label: "Pub-EAA providers", bindings: TS119602_BINDINGS },
  { profile: "registrars_and_registers", annex: "I", label: "registrars and registers", bindings: ["scheme_explicit_json"] },
] as const satisfies readonly ProfileDefinition[];

const PROFILE_REQUIREMENTS = PROFILE_DEFINITIONS.flatMap(profileRequirements);

export const TS119602_REQUIREMENTS: readonly Ts119602Requirement[] = Object.freeze([
  ...CORE_REQUIREMENTS,
  ...PROFILE_REQUIREMENTS,
]);

export interface Ts119602RequirementFilter {
  binding?: Ts119602Binding;
  profile?: Ts119602Profile;
  evidenceScope?: Ts119602EvidenceScope;
}

export function findTs119602Requirement(checkId: string): Ts119602Requirement | undefined {
  return TS119602_REQUIREMENTS.find((requirementEntry) => requirementEntry.checkId === checkId);
}

export function filterTs119602Requirements(filter: Ts119602RequirementFilter): Ts119602Requirement[] {
  return TS119602_REQUIREMENTS.filter((requirementEntry) =>
    (!filter.binding || requirementEntry.applicability.bindings.includes(filter.binding))
    && (!filter.profile || requirementEntry.applicability.profiles.includes(filter.profile))
    && (!filter.evidenceScope || requirementEntry.applicability.evidenceScope === filter.evidenceScope),
  );
}

export function summarizeTs119602Requirements(): {
  standard: typeof TS119602_SOURCE;
  total: number;
  implemented: number;
  partial: number;
  notImplemented: number;
  complete: boolean;
} {
  const implemented = countImplementation("implemented");
  const partial = countImplementation("partial");
  const notImplemented = countImplementation("not_implemented");
  return {
    standard: TS119602_SOURCE,
    total: TS119602_REQUIREMENTS.length,
    implemented,
    partial,
    notImplemented,
    complete: implemented === TS119602_REQUIREMENTS.length,
  };
}

function profileRequirements(definition: ProfileDefinition): Ts119602Requirement[] {
  const prefix = `ts119602.profile.${definition.profile}` as const;
  const applicability = profileApplicability(definition);
  return [
    profileRequirement(`${prefix}.binding`, `${definition.label} binding`, `Validate the binding permitted by the ${definition.label} profile.`, "binding", "critical", applicability, [citation(`${definition.annex}.1`, "General requirements")], "implemented", [`${prefix}.binding`]),
    profileRequirement(`${prefix}.scheme_information`, `${definition.label} scheme information`, `Validate every additional scheme-information rule for the ${definition.label} profile.`, "profile", "error", applicability, [citation(`${definition.annex}.2`), citation(`Table ${definition.annex}.1`, `${definition.label} scheme information`)], "partial", [`${prefix}.scheme_information`]),
    profileRequirement(`${prefix}.trusted_entity`, `${definition.label} trusted entity`, `Validate every additional trusted-entity information rule for the ${definition.label} profile.`, "profile", "error", applicability, [citation(`${definition.annex}.3`), citation(`Table ${definition.annex}.2`, `${definition.label} information`)], "partial", [`${prefix}.trusted_entity`]),
    profileRequirement(`${prefix}.service`, `${definition.label} service`, `Validate every additional service and history rule for the ${definition.label} profile.`, "profile", "error", applicability, [citation(`${definition.annex}.3`), citation(`Table ${definition.annex}.3`, `${definition.label} service information`)], "partial", [`${prefix}.service`]),
    profileRequirement(
      `${prefix}.signature`,
      `${definition.label} signature`,
      `Validate the signature binding and AdES profile required by the ${definition.label} profile.`,
      "signature",
      "critical",
      applicability,
      [citation(`${definition.annex}.4`, "Signature")],
      "implemented",
      definition.profile === "pub_eaa_providers"
        ? [`${prefix}.signature`, "json_lote.signature.jades_baseline_b", "json_lote.signature.jades_cryptographic_verification_result", "signature.annex_h4.enveloped", "signature.annex_h4.document_reference", "signature.annex_h4.transforms", "signature.annex_h4.canonicalization"]
        : [`${prefix}.signature`, "json_lote.signature.jades_baseline_b", "json_lote.signature.jades_cryptographic_verification_result"],
    ),
  ];
}

function profileApplicability(definition: ProfileDefinition): Ts119602Requirement["applicability"] {
  return {
    bindings: definition.bindings,
    profiles: [definition.profile],
    schemeModes: EXPLICIT_SCHEME_MODE,
    evidenceScope: "local",
  };
}

function profileRequirement(
  checkId: `ts119602.${string}`,
  title: string,
  description: string,
  category: Ts119602RequirementCategory,
  defaultSeverity: CheckSeverity,
  applicability: Ts119602Requirement["applicability"],
  citations: readonly Ts119602Citation[],
  implementationStatus: Ts119602ImplementationStatus = "not_implemented",
  existingCheckIds: readonly string[] = [],
): Ts119602Requirement {
  return {
    checkId,
    title,
    description,
    category,
    requirementLevel: "shall",
    defaultSeverity,
    applicability,
    citations,
    implementation: { status: implementationStatus, existingCheckIds },
  };
}

function requirement(
  checkId: `ts119602.${string}`,
  title: string,
  description: string,
  category: Ts119602RequirementCategory,
  requirementLevel: Ts119602RequirementLevel,
  defaultSeverity: CheckSeverity,
  evidenceScope: Ts119602EvidenceScope,
  citations: readonly Ts119602Citation[],
  implementationStatus: Ts119602ImplementationStatus = "not_implemented",
  existingCheckIds: readonly string[] = [],
  bindings: readonly Ts119602Binding[] = TS119602_BINDINGS,
  profiles: readonly Ts119602Profile[] = TS119602_PROFILES,
  schemeModes: readonly Ts119602SchemeMode[] = BOTH_SCHEME_MODES,
): Ts119602Requirement {
  return {
    checkId,
    title,
    description,
    category,
    requirementLevel,
    defaultSeverity,
    applicability: { bindings, profiles, schemeModes, evidenceScope },
    citations,
    implementation: { status: implementationStatus, existingCheckIds },
  };
}

function citation(location: string, title?: string): Ts119602Citation {
  return { location, title };
}

function countImplementation(status: Ts119602ImplementationStatus): number {
  return TS119602_REQUIREMENTS.filter((requirementEntry) => requirementEntry.implementation.status === status).length;
}
