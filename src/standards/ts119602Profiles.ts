import { createHash, X509Certificate } from "node:crypto";
import { normalizeBase64Certificate } from "../certs.js";
import type { CheckResult, Ts119602Binding, Ts119602Classification, Ts119602Profile } from "../types.js";
import { profileFromLoteType, TS119602_PROFILE_URIS } from "./ts119602Classification.js";
import type {
  Ts119602EntitiesInput,
  Ts119602EntityObservation,
  Ts119602ServiceObservation,
} from "./ts119602Entities.js";
import type { Ts119602MetadataInput } from "./ts119602Metadata.js";
import { parseTs119602UtcDateTime, validateTs119602CountryCode, validateTs119602Uri } from "./ts119602Syntax.js";

const EU_MEMBER_STATES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "EL",
]);

const REGISTRATION_IDENTIFIER_PREFIXES = ["VAT", "NTR", "PAS", "IDC", "PNO", "TIN"] as const;

interface ProfileDefinition {
  annex: "D" | "E" | "F" | "G" | "H" | "I";
  profile: Exclude<Ts119602Profile, "unknown">;
  label: string;
  bindings: readonly Exclude<Ts119602Binding, "unknown">[];
  statusDetermination: string;
  schemeRules: string;
  schemeInformationUriMinimum: 1 | 2;
  historyPeriod: "absent" | 65535;
  pointers: "present" | "absent";
  roleUriName: "PIDProvider" | "WalletProvider" | "WRPACProvider" | "WRPRCProvider" | "PubEAAProvider" | "Registrar";
  roleUriLocation: "information" | "address";
  serviceTypes: readonly string[];
  serviceCertificates: "required" | "optional_pub_eaa";
  serviceStatus: "absent" | "pub_eaa";
  walletServiceIdentifier?: true;
  registerSupplyPoint?: true;
}

export const TS119602_PROFILE_REGISTRY_VERSION = "2026-07-22" as const;

export const TS119602_PROFILE_REGISTRY = Object.freeze({
  pid_providers: definition("D", "pid_providers", "PID providers", "PIDProvidersList", "PIDProviders", "PIDProvider", ["PID/Issuance", "PID/Revocation"]),
  wallet_providers: definition("E", "wallet_providers", "wallet providers", "WalletProvidersList", "WalletProvidersList", "WalletProvider", ["WalletSolution/Issuance", "WalletSolution/Revocation"], { walletServiceIdentifier: true }),
  wrpac_providers: definition("F", "wrpac_providers", "WRPAC providers", "WRPACProvidersList", "WRPACProvidersList", "WRPACProvider", ["WRPAC/Issuance", "WRPAC/Revocation"]),
  wrprc_providers: definition("G", "wrprc_providers", "WRPRC providers", "WRPRCrovidersList", "WRPRCProvidersList", "WRPRCProvider", ["WRPRC/Issuance", "WRPRC/Revocation"]),
  pub_eaa_providers: definition("H", "pub_eaa_providers", "Pub-EAA providers", "PubEAAProvidersList", "PubEAAProvidersList", "PubEAAProvider", ["PubEAA/Issuance", "PubEAA/Revocation"], {
    bindings: ["scheme_explicit_json", "scheme_explicit_xml", "ts119612_alternative_xml"],
    historyPeriod: 65535,
    pointers: "absent",
    schemeInformationUriMinimum: 1,
    roleUriLocation: "address",
    serviceCertificates: "optional_pub_eaa",
    serviceStatus: "pub_eaa",
  }),
  registrars_and_registers: definition("I", "registrars_and_registers", "registrars and registers", "RegistrarsAndRegistersList", "RegistrarsAndRegistersList", "Registrar", ["Register"], { registerSupplyPoint: true }),
} as const satisfies Readonly<Record<Exclude<Ts119602Profile, "unknown">, ProfileDefinition>>);

export interface Ts119602ProfileAssessmentInput {
  binding: Ts119602Binding;
  metadata: Ts119602MetadataInput;
  entities: Ts119602EntitiesInput;
  signatureChecks: readonly CheckResult[];
  profileSelectionStatus?: Ts119602Classification["profileStatus"];
}

/** Apply the locally decidable Annex D-I tables after exact embedded LoTEType dispatch. */
export function buildTs119602ProfileFindings(input: Ts119602ProfileAssessmentInput): CheckResult[] {
  const embeddedType = typeof input.metadata.loteType === "string" ? input.metadata.loteType : undefined;
  const profile = profileFromLoteType(embeddedType);
  if (profile === "unknown" || input.profileSelectionStatus === "conflict") {
    return [finding(
      "ts119602.profile.dispatch",
      "fail",
      "critical",
      input.profileSelectionStatus === "conflict"
        ? "No Annex D-I profile is selected because the embedded and declared profile evidence conflict."
        : "No Annex D-I profile can be selected because the embedded LoTEType is absent or is not an exact registered profile URI.",
      { embeddedType, profileSelectionStatus: input.profileSelectionStatus, registryVersion: TS119602_PROFILE_REGISTRY_VERSION, registeredTypes: Object.values(TS119602_PROFILE_URIS) },
    )];
  }

  const definitionEntry = TS119602_PROFILE_REGISTRY[profile];
  return [
    finding(
      "ts119602.profile.dispatch",
      "pass",
      "info",
      `The embedded LoTEType selects the Annex ${definitionEntry.annex} ${definitionEntry.label} profile.`,
      { profile, annex: definitionEntry.annex, embeddedType, registryVersion: TS119602_PROFILE_REGISTRY_VERSION },
    ),
    bindingFinding(input.binding, definitionEntry),
    schemeFinding(input.metadata, definitionEntry),
    entityFinding(input.entities.entities, definitionEntry),
    serviceFinding(input.entities, definitionEntry),
    signatureFinding(input.binding, input.signatureChecks, definitionEntry),
  ];
}

function bindingFinding(binding: Ts119602Binding, profile: ProfileDefinition): CheckResult {
  const valid = profile.bindings.includes(binding as Exclude<Ts119602Binding, "unknown">);
  return profileFinding(profile, "binding", valid ? "pass" : "fail", valid ? "info" : "critical",
    valid ? `The ${binding} binding is permitted by Annex ${profile.annex}.` : `The ${binding} binding is not permitted by Annex ${profile.annex}.`,
    { observed: binding, permitted: profile.bindings });
}

function schemeFinding(metadata: Ts119602MetadataInput, profile: ProfileDefinition): CheckResult {
  const informationUris = metadata.schemeInformationUris ?? [];
  const schemeRules = metadata.schemeTypeCommunityRules ?? [];
  const issue = parseTs119602UtcDateTime(metadata.issueDateTime);
  const next = parseTs119602UtcDateTime(metadata.nextUpdate.value);
  const deadline = issue ? addUtcCalendarMonths(issue, 6) : undefined;
  const localResults = {
    version: { observed: metadata.version, expected: 1, valid: metadata.version === 1 },
    type: { observed: metadata.loteType, expected: TS119602_PROFILE_URIS[profile.profile], valid: metadata.loteType === TS119602_PROFILE_URIS[profile.profile] },
    informationUris: {
      observed: informationUris,
      minimum: profile.schemeInformationUriMinimum,
      valid: informationUris.length >= profile.schemeInformationUriMinimum && informationUris.every(validUri),
      targetSemantics: "not_checked_until_contextual_dereferencing",
    },
    statusDetermination: {
      observed: metadata.statusDeterminationApproach,
      expected: profile.statusDetermination,
      valid: metadata.statusDeterminationApproach === profile.statusDetermination,
      interpretation: profile.profile === "wrprc_providers" ? "ts119602-v1.1.1-wrprc-uri-typo" : undefined,
    },
    schemeRules: { observed: schemeRules, expected: profile.schemeRules, valid: schemeRules.length > 0 && schemeRules.every((value) => value === profile.schemeRules) },
    territory: { observed: metadata.territory, expected: "EU", valid: metadata.territory === "EU" },
    historyPeriod: profile.historyPeriod === "absent"
      ? { observed: metadata.historyPeriod ?? null, expected: "absent", valid: metadata.historyPeriod === undefined }
      : { observed: metadata.historyPeriod, expected: profile.historyPeriod, valid: metadata.historyPeriod === profile.historyPeriod },
    pointers: profile.pointers === "absent"
      ? { observed: metadata.pointers.length, expected: "absent", valid: metadata.pointers.length === 0 }
      : { observed: metadata.pointers.length, expected: "self_pointer", valid: metadata.pointers.length > 0, targetMatch: "not_checked_until_contextual_assessment" },
    nextUpdate: {
      issue: issue?.toISOString(),
      observed: next?.toISOString(),
      maximum: deadline?.toISOString(),
      valid: Boolean(issue && next && deadline && next > issue && next <= deadline),
    },
    sequenceHistory: "not_checked_until_prior_instance_is_supplied",
  };
  const valid = Object.values(localResults).every((entry) => typeof entry !== "object" || entry === null || !("valid" in entry) || entry.valid);
  return profileFinding(profile, "scheme_information", valid ? "pass" : "fail", valid ? "info" : "error",
    valid ? `The locally decidable Annex ${profile.annex} scheme-information rules pass.` : `One or more locally decidable Annex ${profile.annex} scheme-information rules fail.`,
    localResults);
}

function entityFinding(entities: Ts119602EntityObservation[], profile: ProfileDefinition): CheckResult {
  if (entities.length === 0) {
    return profileFinding(profile, "trusted_entity", "not_applicable", "info", `Annex ${profile.annex} trusted-entity rules are not applicable because no entity is present.`, { entityCount: 0 });
  }
  const results = entities.map((entity) => {
    const electronicUris = entity.address.electronicUris.map((entry) => entry.value);
    const informationUris = entity.informationUris.map((entry) => entry.value);
    const roleUris = profile.roleUriLocation === "address" ? electronicUris : informationUris;
    const tradeNames = stringValues(entity.tradeName.map((entry) => entry.value));
    const registrationIdentifiers = registrationIdentifierResult(tradeNames);
    const associatedBodies = associatedBodyResult(entity);
    const result = {
      path: entity.path,
      namePresent: entity.name.some((entry) => nonEmptyString(entry.value)),
      postalAddressPresent: entity.address.postalAddresses.length > 0,
      emailPresent: electronicUris.some((value) => uriScheme(value) === "mailto"),
      telephonePresent: electronicUris.some((value) => uriScheme(value) === "tel"),
      informationPagePresent: informationUris.some((value) => ["http", "https"].includes(uriScheme(value) ?? "")),
      countryRoleUriPresent: roleUris.some((value) => validCountryRoleUri(value, profile.roleUriName)),
      pubEaaLawReferencePresent: profile.profile !== "pub_eaa_providers" || tradeNames.some(validOjLawReference),
      registrationIdentifiers,
      associatedBodies,
      officialRegistrationMatch: registrationIdentifiers.validIdentifiers.length > 0
        ? "not_checked_without_authoritative_records"
        : "not_applicable_no_locally_asserted_identifier",
      valid: false,
    };
    result.valid = result.namePresent && result.postalAddressPresent && result.emailPresent && result.telephonePresent
      && result.informationPagePresent && result.countryRoleUriPresent && result.pubEaaLawReferencePresent
      && registrationIdentifiers.valid && associatedBodies.valid;
    return result;
  });
  const valid = results.every((entry) => entry.valid);
  return profileFinding(profile, "trusted_entity", valid ? "pass" : "fail", valid ? "info" : "error",
    valid ? `Every entity satisfies the locally decidable Annex ${profile.annex} identity/contact rules.` : `One or more entities violate the locally decidable Annex ${profile.annex} identity/contact rules.`,
    { results });
}

function serviceFinding(input: Ts119602EntitiesInput, profile: ProfileDefinition): CheckResult {
  const services = input.entities.flatMap((entity) => entity.services.map((service) => ({ entity, service })));
  if (services.length === 0) {
    return profileFinding(profile, "service", "not_applicable", "info", `Annex ${profile.annex} service rules are not applicable because no service is present.`, { serviceCount: 0 });
  }
  const issue = parseTs119602UtcDateTime(input.listIssueDateTime);
  const results = services.map(({ entity, service }) => serviceResult(entity, service, issue, profile));
  const valid = results.every((entry) => entry.valid);
  return profileFinding(profile, "service", valid ? "pass" : "fail", valid ? "info" : "error",
    valid ? `Every service satisfies the locally decidable Annex ${profile.annex} service/history rules.` : `One or more services violate the locally decidable Annex ${profile.annex} service/history rules.`,
    { results });
}

function serviceResult(entity: Ts119602EntityObservation, service: Ts119602ServiceObservation, issue: Date | undefined, profile: ProfileDefinition) {
  const typeValid = !service.typeIdentifier.present || profile.serviceTypes.includes(String(service.typeIdentifier.value));
  const certificates = service.identity.certificates.map((entry) => certificateObservation(entry.value));
  const certificateValid = profile.serviceCertificates === "required"
    ? certificates.length > 0 && certificates.every((entry) => entry.parsed)
    : certificates.every((entry) => entry.parsed);
  const entityNames = stringValues(entity.name.map((entry) => entry.value));
  const certificateNameMatchRequired = ["pid_providers", "wallet_providers", "registrars_and_registers"].includes(profile.profile);
  const certificateNameMatch = !certificateNameMatchRequired || certificates.every((entry) => {
    const subjectNames = [...distinguishedNameValues(entry.subject, "O"), ...distinguishedNameValues(entry.subject, "CN")];
    return subjectNames.some((value) => entityNames.includes(value));
  });
  const registrationIdentifiers = registrationIdentifierResult(stringValues(entity.tradeName.map((entry) => entry.value)));
  const certificateRegistrationMatchRequired = ["pid_providers", "wallet_providers", "registrars_and_registers"].includes(profile.profile)
    && registrationIdentifiers.validIdentifiers.length > 0;
  const certificateRegistrationMatch = !certificateRegistrationMatchRequired || certificates.every((entry) => {
    const certifiedIdentifiers = [
      ...distinguishedNameValues(entry.subject, "organizationIdentifier"),
      ...distinguishedNameValues(entry.subject, "serialNumber"),
      ...distinguishedNameValues(entry.subject, "2.5.4.97"),
      ...distinguishedNameValues(entry.subject, "2.5.4.5"),
    ];
    return registrationIdentifiers.validIdentifiers.some((value) => certifiedIdentifiers.includes(value));
  });
  const certificatePurpose = certificatePurposeResult(certificates, profile);
  const pubEaaCertificateConstraints = profile.serviceCertificates !== "optional_pub_eaa" || certificates.length === 0
    ? { applicable: false, valid: true }
    : pubEaaCertificateResult(certificates, entity);
  const statusValid = profile.serviceStatus === "absent"
    ? !service.status.present && !service.statusStartingTime.present
    : service.status.present
      && [
        "http://uri.etsi.org/19602/PubEAAProvidersList/SvcStatus/notified",
        "http://uri.etsi.org/19602/PubEAAProvidersList/SvcStatus/withdrawn",
      ].includes(String(service.status.value))
      && service.statusStartingTime.present
      && Boolean(issue && parseTs119602UtcDateTime(service.statusStartingTime.value)
        && parseTs119602UtcDateTime(service.statusStartingTime.value)! >= issue);
  const walletIdentifierValid = !profile.walletServiceIdentifier || service.extensions.some((extension) =>
    extension.identifier?.endsWith("ServiceUniqueIdentifier") && extension.payloadValid);
  const supplyPointValid = !profile.registerSupplyPoint || service.supplyPoints.length > 0
    && service.supplyPoints.every((point) => validUri(point.uri));
  const historyValid = profile.profile !== "pub_eaa_providers" || service.history.every((entry) =>
    entry.identity.skis.length > 0 && entry.identity.certificates.length === 0);
  return {
    path: service.path,
    type: { present: service.typeIdentifier.present, observed: service.typeIdentifier.value, allowed: profile.serviceTypes, valid: typeValid },
    certificates,
    certificateRequirement: profile.serviceCertificates,
    certificateValid,
    certificateNameMatch: { required: certificateNameMatchRequired, expectedNames: entityNames, valid: certificateNameMatch },
    certificateRegistrationMatch: {
      required: certificateRegistrationMatchRequired,
      expectedIdentifiers: registrationIdentifiers.validIdentifiers,
      valid: certificateRegistrationMatch,
      authoritativeRegistrationChecked: false,
    },
    pubEaaCertificateConstraints,
    status: { observed: service.status.value, present: service.status.present, statusStartingTime: service.statusStartingTime.value, rule: profile.serviceStatus, valid: statusValid },
    walletServiceIdentifier: { required: Boolean(profile.walletServiceIdentifier), valid: walletIdentifierValid },
    registerSupplyPoint: { required: Boolean(profile.registerSupplyPoint), points: service.supplyPoints, valid: supplyPointValid, authentication: profile.registerSupplyPoint ? "not_checked_until_dereferencing" : "not_applicable" },
    history: { instanceCount: service.history.length, pubEaaSkiOnlyRule: profile.profile === "pub_eaa_providers", valid: historyValid },
    certificatePurpose,
    valid: typeValid && certificateValid && certificateNameMatch && certificateRegistrationMatch
      && certificatePurpose.valid && pubEaaCertificateConstraints.valid && statusValid
      && walletIdentifierValid && supplyPointValid && historyValid,
  };
}

function signatureFinding(binding: Ts119602Binding, checks: readonly CheckResult[], profile: ProfileDefinition): CheckResult {
  const ids = binding === "scheme_explicit_json"
    ? ["json_lote.signature.jades_baseline_b", "json_lote.signature.jades_cryptographic_verification_result"]
    : [
      "signature.xades_baseline_b.structure",
      "signature.xades_baseline_b.mandatory_elements",
      "signature.xades_baseline_b.signing_time",
      "signature.xades_baseline_b.signing_certificate_reference",
      "signature.xades_baseline_b.data_object_formats",
      "signature.xades_baseline_b.reference_digests",
      "signature.xades_baseline_b.prohibited_legacy_properties",
      "signature.annex_h4.enveloped",
      "signature.annex_h4.document_reference",
      "signature.annex_h4.transforms",
      "signature.annex_h4.canonicalization",
      "signature.cryptographic_verification_result",
    ];
  const required = ids.map((id) => checks.find((entry) => entry.id === id)).filter((entry): entry is CheckResult => Boolean(entry));
  const status = required.length !== ids.length || required.some((entry) => entry.status === "fail")
    ? "fail"
    : required.some((entry) => entry.status === "unsupported")
      ? "unsupported"
      : required.some((entry) => entry.status !== "pass")
        ? "not_checked"
        : "pass";
  return profileFinding(profile, "signature", status, status === "pass" ? "info" : status === "fail" ? "critical" : "warning",
    status === "pass" ? `The signature evidence satisfies the Annex ${profile.annex} binding/profile requirements.` : `The signature evidence does not establish all Annex ${profile.annex} binding/profile requirements.`,
    { binding, requiredCheckIds: ids, observed: required.map((entry) => ({ id: entry.id, status: entry.status })) });
}

function pubEaaCertificateResult(certificates: ReturnType<typeof certificateObservation>[], entity: Ts119602EntityObservation) {
  const parsed = certificates.filter((entry) => entry.parsed);
  const publicKeys = new Set(parsed.map((entry) => entry.publicKeySha256));
  const subjects = new Set(parsed.map((entry) => entry.subject));
  const names = stringValues(entity.name.map((entry) => entry.value));
  const organizations = parsed.flatMap((entry) => distinguishedNameValues(entry.subject, "O"));
  const organizationMatches = organizations.length === parsed.length && organizations.every((value) => names.includes(value));
  return {
    applicable: true,
    samePublicKey: parsed.length === certificates.length && publicKeys.size === 1,
    identicalSubjects: parsed.length === certificates.length && subjects.size === 1,
    organizations,
    expectedNames: names,
    organizationMatches,
    valid: parsed.length === certificates.length && publicKeys.size === 1 && subjects.size === 1 && organizationMatches,
  };
}

function certificateObservation(value: unknown): {
  parsed: boolean;
  subject?: string;
  publicKeySha256?: string;
  ca?: boolean;
  keyUsage?: string[];
  error?: string;
} {
  if (typeof value !== "string") return { parsed: false, error: "Certificate value is not a string." };
  try {
    const clean = normalizeBase64Certificate(value);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) return { parsed: false, error: "Certificate is not strict Base64." };
    const raw = Buffer.from(clean, "base64");
    const certificate = new X509Certificate(raw);
    const publicKey = certificate.publicKey.export({ format: "der", type: "spki" });
    return {
      parsed: true,
      subject: certificate.subject,
      publicKeySha256: createHash("sha256").update(publicKey).digest("hex"),
      ca: certificate.ca,
      keyUsage: certificateKeyUsage(raw),
    };
  } catch (error) {
    return { parsed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function definition(
  annex: ProfileDefinition["annex"],
  profile: ProfileDefinition["profile"],
  label: string,
  statusPath: string,
  schemeRulesPath: string,
  roleUriName: ProfileDefinition["roleUriName"],
  serviceTypePaths: readonly string[],
  overrides: Partial<ProfileDefinition> = {},
): ProfileDefinition {
  return {
    annex,
    profile,
    label,
    bindings: ["scheme_explicit_json"],
    statusDetermination: `http://uri.etsi.org/19602/${statusPath}/StatusDetn/EU`,
    schemeRules: `http://uri.etsi.org/19602/${schemeRulesPath}/schemerules/EU`,
    schemeInformationUriMinimum: 2,
    historyPeriod: "absent",
    pointers: "present",
    roleUriName,
    roleUriLocation: "information",
    serviceTypes: serviceTypePaths.map((path) => `http://uri.etsi.org/19602/SvcType/${path}`),
    serviceCertificates: "required",
    serviceStatus: "absent",
    ...overrides,
  };
}

function addUtcCalendarMonths(value: Date, months: number): Date {
  const targetMonth = value.getUTCMonth() + months;
  const year = value.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const finalDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(value.getUTCDate(), finalDay), value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds()));
}

function validCountryRoleUri(value: unknown, role: ProfileDefinition["roleUriName"]): boolean {
  if (typeof value !== "string") return false;
  const match = new RegExp(`^http://uri\\.etsi\\.org/19602/ListOfTrustedEntities/${role}/([A-Z]{2})$`).exec(value);
  return Boolean(match && EU_MEMBER_STATES.has(match[1]));
}

function validOjLawReference(value: string): boolean {
  const match = /^OJ:(EU|[A-Z]{2}):?([^\s]+)$/.exec(value);
  return Boolean(match && (match[1] === "EU" || EU_MEMBER_STATES.has(match[1])) && match[2].length > 0);
}

function registrationIdentifierResult(values: string[]) {
  const attemptedIdentifiers = values.filter((value) => REGISTRATION_IDENTIFIER_PREFIXES.some((prefix) => value.startsWith(prefix)));
  const validIdentifiers = attemptedIdentifiers.filter(validRegistrationIdentifier);
  return {
    values,
    attemptedIdentifiers,
    validIdentifiers,
    malformedIdentifiers: attemptedIdentifiers.filter((value) => !validIdentifiers.includes(value)),
    conditionalPresence: "official_identifier_required_only_where_registered",
    valid: attemptedIdentifiers.length === validIdentifiers.length,
  };
}

function validRegistrationIdentifier(value: string): boolean {
  const match = /^(?:VAT|NTR|PAS|IDC|PNO|TIN)([A-Z]{2})-(\S+)$/.exec(value);
  return Boolean(match && validateTs119602CountryCode(match[1]).outcome === "valid" && match[2].length > 0);
}

function associatedBodyResult(entity: Ts119602EntityObservation) {
  const extensions = entity.extensions.filter((entry) => entry.identifier?.endsWith("OtherAssociatedBodies"));
  return {
    applicableProfiles: ["pid_providers", "wallet_providers"],
    extensionCount: extensions.length,
    extensions: extensions.map((entry) => ({
      path: entry.path,
      identifier: entry.identifier,
      recognized: entry.recognized,
      payloadValid: entry.payloadValid,
      payloadEvidence: entry.payloadEvidence,
    })),
    responsibilityMatch: extensions.length > 0 ? "not_checked_without_external_role_evidence" : "not_applicable_no_associated_body_asserted",
    valid: extensions.every((entry) => entry.recognized && entry.payloadValid),
  };
}

function certificatePurposeResult(
  certificates: ReturnType<typeof certificateObservation>[],
  profile: ProfileDefinition,
) {
  const purpose = ["wrpac_providers", "wrprc_providers"].includes(profile.profile)
    ? "certificate_issuer_signature_verification"
    : profile.profile === "pub_eaa_providers"
      ? "attestation_signature_or_issuing_ca_verification"
      : "service_output_signature_or_seal_verification";
  const observations = certificates.map((certificate) => {
    const keyUsage = certificate.keyUsage ?? [];
    const issuerCertificate = purpose === "certificate_issuer_signature_verification"
      || (purpose === "attestation_signature_or_issuing_ca_verification" && certificate.ca === true);
    const requiredUsages = issuerCertificate ? ["keyCertSign"] : ["digitalSignature", "nonRepudiation"];
    const basicConstraintsValid = purpose !== "certificate_issuer_signature_verification" || certificate.ca === true;
    const keyUsageValid = keyUsage.length === 0 || requiredUsages.some((usage) => keyUsage.includes(usage));
    return {
      parsed: certificate.parsed,
      subject: certificate.subject,
      ca: certificate.ca,
      keyUsage,
      requiredUsages,
      basicConstraintsValid,
      keyUsageValid,
      valid: certificate.parsed && basicConstraintsValid && keyUsageValid,
    };
  });
  return {
    purpose,
    observations,
    certificatePolicies: "not_checked_no_profile_specific_policy_oid_is_defined_by_annex",
    valid: observations.every((entry) => entry.valid),
  };
}

function certificateKeyUsage(raw: Buffer): string[] {
  const certificate = derTlv(raw, 0);
  const tbs = derTlv(raw, certificate.contentStart);
  let offset = tbs.contentStart;
  while (offset < tbs.end) {
    const item = derTlv(raw, offset);
    if (item.tag === 0xa3) {
      const sequence = derTlv(raw, item.contentStart);
      let extensionOffset = sequence.contentStart;
      while (extensionOffset < sequence.end) {
        const extension = derTlv(raw, extensionOffset);
        const oid = derTlv(raw, extension.contentStart);
        let valueOffset = oid.end;
        const maybeCritical = derTlv(raw, valueOffset);
        if (maybeCritical.tag === 0x01) valueOffset = maybeCritical.end;
        const octets = derTlv(raw, valueOffset);
        if (raw.subarray(oid.contentStart, oid.end).toString("hex") === "551d0f") {
          const bits = derTlv(raw, octets.contentStart);
          return decodeKeyUsage(raw.subarray(bits.contentStart + 1, bits.end));
        }
        extensionOffset = extension.end;
      }
    }
    offset = item.end;
  }
  return [];
}

function decodeKeyUsage(bits: Buffer): string[] {
  const names = ["digitalSignature", "nonRepudiation", "keyEncipherment", "dataEncipherment", "keyAgreement", "keyCertSign", "crlSign", "encipherOnly", "decipherOnly"];
  return names.filter((_name, index) => Boolean(bits[Math.floor(index / 8)] & (0x80 >> (index % 8))));
}

function derTlv(data: Buffer, offset: number): { tag: number; contentStart: number; end: number } {
  if (offset + 2 > data.length) throw new Error("Invalid DER.");
  const tag = data[offset];
  const firstLength = data[offset + 1];
  let length = firstLength;
  let contentStart = offset + 2;
  if (firstLength & 0x80) {
    const octets = firstLength & 0x7f;
    if (octets === 0 || octets > 4 || contentStart + octets > data.length) throw new Error("Invalid DER length.");
    length = 0;
    for (let index = 0; index < octets; index += 1) length = (length * 256) + data[contentStart + index];
    contentStart += octets;
  }
  if (contentStart + length > data.length) throw new Error("Invalid DER bounds.");
  return { tag, contentStart, end: contentStart + length };
}

function validUri(value: unknown): boolean {
  return validateTs119602Uri(value).outcome === "valid";
}

function uriScheme(value: unknown): string | undefined {
  const result = validateTs119602Uri(value);
  return result.outcome === "valid" ? result.classification : undefined;
}

function stringValues(values: unknown[]): string[] {
  return values.filter((value): value is string => nonEmptyString(value));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function distinguishedNameValues(subject: string | undefined, attribute: string): string[] {
  if (!subject) return [];
  const values: string[] = [];
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\n|,\\s*)${escapedAttribute}=((?:\\\\.|[^\\n,])*)`, "g");
  for (const match of subject.matchAll(pattern)) values.push(match[1].trim().replace(/\\\\([,=+<>#;"\\\\])/g, "$1"));
  return values;
}

function profileFinding(
  profile: ProfileDefinition,
  family: "binding" | "scheme_information" | "trusted_entity" | "service" | "signature",
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): CheckResult {
  return finding(`ts119602.profile.${profile.profile}.${family}`, status, severity, message, { annex: profile.annex, profile: profile.profile, ...asEvidence(evidence) });
}

function finding(id: string, status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult {
  return { id, category: id.endsWith(".signature") ? "signature" : "profile", status, severity, message, evidence };
}

function asEvidence(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : { details: value };
}
