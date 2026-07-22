import { tryCertificateFromBase64 } from "../certs.js";
import type { CertificateSummary, CheckResult } from "../types.js";
import {
  parseTs119602UtcDateTime,
  validateTs119602MultilingualValues,
  validateTs119602Uri,
  type Ts119602MultilingualValue,
} from "./ts119602Syntax.js";
import type { Ts119602AddressObservation, Ts119602ExtensionObservation } from "./ts119602Metadata.js";

export interface Ts119602IdentityObservation {
  path: string;
  present: boolean;
  certificates: Array<{ path: string; value: unknown }>;
  subjectNames: Array<{ path: string; value: unknown }>;
  publicKeys: Array<{ path: string; value: unknown }>;
  skis: Array<{ path: string; value: unknown }>;
  otherIds: Array<{ path: string; value: unknown }>;
}

export interface Ts119602ServiceExtensionObservation extends Ts119602ExtensionObservation {
  payloadValid: boolean;
  payloadEvidence?: unknown;
}

export interface Ts119602StructureObservation {
  path: string;
  binding: "json" | "xml";
  observedType: "object" | "array" | "element" | "missing" | "other";
  childNames: string[];
  violations: Array<{ code: string; message: string; observed?: unknown }>;
  valid: boolean;
}

export interface Ts119602HistoryObservation {
  path: string;
  name: Ts119602MultilingualValue[];
  identity: Ts119602IdentityObservation;
  status: { present: boolean; value: unknown };
  statusStartingTime: { present: boolean; value: unknown };
  typeIdentifier: unknown;
  extensions: Ts119602ServiceExtensionObservation[];
}

export interface Ts119602ServiceObservation {
  path: string;
  structure: Ts119602StructureObservation;
  informationStructure: Ts119602StructureObservation;
  informationPresent: boolean;
  name: Ts119602MultilingualValue[];
  identity: Ts119602IdentityObservation;
  typeIdentifier: { present: boolean; value: unknown };
  status: { present: boolean; value: unknown };
  statusStartingTime: { present: boolean; value: unknown };
  schemeDefinitionPresent: boolean;
  schemeDefinitionUris: unknown[];
  supplyPointsPresent: boolean;
  supplyPoints: Array<{ path: string; uri: unknown; type?: unknown }>;
  teDefinitionPresent: boolean;
  teDefinitionUris: unknown[];
  extensionsPresent: boolean;
  extensions: Ts119602ServiceExtensionObservation[];
  historyPresent: boolean;
  history: Ts119602HistoryObservation[];
}

export interface Ts119602EntityObservation {
  path: string;
  structure: Ts119602StructureObservation;
  informationStructure: Ts119602StructureObservation;
  servicesStructure: Ts119602StructureObservation;
  informationPresent: boolean;
  servicesContainerPresent: boolean;
  name: Ts119602MultilingualValue[];
  tradeNamePresent: boolean;
  tradeName: Ts119602MultilingualValue[];
  address: Ts119602AddressObservation;
  informationUris: Ts119602MultilingualValue[];
  extensionsPresent: boolean;
  extensions: Ts119602ServiceExtensionObservation[];
  services: Ts119602ServiceObservation[];
}

export interface Ts119602EntitiesInput {
  containerPresent: boolean;
  listStructure: Ts119602StructureObservation;
  entities: Ts119602EntityObservation[];
  historyPeriod: unknown;
  listIssueDateTime: unknown;
  assessmentDate: Date;
}

export const TS119602_ENTITY_EXTENSION_REGISTRY = Object.freeze({
  registryVersion: "2026-07-21",
  recognizedIdentifiers: ["OtherAssociatedBodies", "{http://uri.etsi.org/019602/v1/TrustedEntityExtensions}OtherAssociatedBodies"] as const,
  unknownCriticalPolicy: "reject" as const,
});

export const TS119602_SERVICE_EXTENSION_REGISTRY = Object.freeze({
  registryVersion: "2026-07-21",
  recognizedIdentifiers: ["ServiceUniqueIdentifier", "{http://uri.etsi.org/019602/v1/ServiceInformationExtensions}ServiceUniqueIdentifier"] as const,
  unknownCriticalPolicy: "reject" as const,
});

export function buildTs119602EntityFindings(input: Ts119602EntitiesInput): {
  checks: CheckResult[];
  certificates: CertificateSummary[];
} {
  const services = input.entities.flatMap((entity) => entity.services);
  const identities = services.flatMap((service) => [service.identity, ...service.history.map((entry) => entry.identity)]);
  const certificateEvidence = identities.flatMap((identity) => identity.certificates.map((certificate) => {
    const value = typeof certificate.value === "string" ? certificate.value : "";
    return { ...certificate, lexicalValid: strictBase64(value), summary: strictBase64(value) ? tryCertificateFromBase64(value, "service_digital_identity", input.assessmentDate) : undefined };
  }));
  const certificates = certificateEvidence.flatMap((entry) => entry.summary ?? []);
  return {
    checks: [
      entityListFinding(input),
      entityStructureFinding(input),
      entityInformationFinding(input),
      entityNamesFinding(input),
      entityAddressFinding(input),
      entityInformationUriFinding(input),
      extensionFinding("ts119602.entity.extensions", input.entities.flatMap((entity) => entity.extensions), input.entities.some((entity) => entity.extensionsPresent), TS119602_ENTITY_EXTENSION_REGISTRY),
      serviceInformationFinding(services),
      optionalUriFinding("ts119602.service.type", "ServiceTypeIdentifier", services.map((service) => service.typeIdentifier)),
      serviceNamesFinding(services),
      identityFinding(identities, certificateEvidence),
      identityEquivalenceFinding(identities),
      serviceStatusFinding(services, input.historyPeriod),
      serviceStatusStartFinding(services, input.listIssueDateTime),
      optionalUriSequenceFinding("ts119602.service.scheme_definition", "SchemeServiceDefinitionURI", services.map((service) => ({ present: service.schemeDefinitionPresent, values: service.schemeDefinitionUris }))),
      supplyPointFinding(services),
      optionalUriSequenceFinding("ts119602.service.definition", "TE service definition URI", services.map((service) => ({ present: service.teDefinitionPresent, values: service.teDefinitionUris }))),
      extensionFinding("ts119602.service.extensions", services.flatMap((service) => service.extensions), services.some((service) => service.extensionsPresent), TS119602_SERVICE_EXTENSION_REGISTRY),
      historyFinding(services, input.historyPeriod),
    ],
    certificates,
  };
}

function entityListFinding(input: Ts119602EntitiesInput): CheckResult {
  if (!input.containerPresent) return finding("ts119602.entities.list", "inconclusive", "warning", "TrustedEntitiesList is absent; local evidence cannot establish whether no entity service is or was approved.", { entityCount: 0 });
  const valid = input.listStructure.valid && input.entities.length > 0;
  return finding("ts119602.entities.list", valid ? "pass" : "fail", valid ? "info" : "critical", valid ? "TrustedEntitiesList contains one or more directly nested trusted entities." : "A present TrustedEntitiesList must be a non-empty sequence containing only directly nested TrustedEntity entries.", { entityCount: input.entities.length, structure: input.listStructure });
}

function entityStructureFinding(input: Ts119602EntitiesInput): CheckResult {
  if (input.entities.length === 0) return finding("ts119602.entities.structure", "not_applicable", "info", "Entity structure is not applicable because no TrustedEntity was observed.");
  const results = input.entities.map((entity) => ({
    path: entity.path,
    structure: entity.structure,
    servicesStructure: entity.servicesStructure,
    services: entity.services.map((service) => ({ path: service.path, structure: service.structure })),
    valid: entity.structure.valid
      && entity.servicesStructure.valid
      && entity.services.length > 0
      && entity.services.every((service) => service.structure.valid),
  }));
  return aggregate("ts119602.entities.structure", results, "Every TrustedEntity and service wrapper has exact direct nesting and cardinality.", "TrustedEntity, TrustedEntityServices, TrustedEntityService, and optional ServiceHistory must use the exact binding-specific direct nesting and cardinality.", "critical");
}

function entityInformationFinding(input: Ts119602EntitiesInput): CheckResult {
  if (input.entities.length === 0) return finding("ts119602.entity.information", "not_applicable", "info", "Trusted entity information is not applicable because no entity was observed.");
  const results = input.entities.map((entity) => ({ path: entity.path, structure: entity.informationStructure, nameCount: entity.name.length, addressPresent: entity.address.present, informationUriCount: entity.informationUris.length, valid: entity.informationStructure.valid && entity.name.length > 0 && entity.address.present && entity.informationUris.length > 0 }));
  return aggregate("ts119602.entity.information", results, "Every entity contains the mandatory information components with exact direct nesting and cardinality.", "TrustedEntityInformation must contain exactly one TEName, TEAddress, and TEInformationURI, with only the defined optional components.", "critical");
}

function entityNamesFinding(input: Ts119602EntitiesInput): CheckResult {
  if (input.entities.length === 0) return finding("ts119602.entity.names", "not_applicable", "info", "Entity names are not applicable because no entity was observed.");
  const results = input.entities.map((entity) => {
    const name = validateTs119602MultilingualValues(entity.name);
    const tradeName = entity.tradeNamePresent ? validateTs119602MultilingualValues(entity.tradeName) : undefined;
    return { path: entity.path, name, tradeName, officialRecordMatch: "not_checked", valid: name.outcome === "valid" && (!tradeName || tradeName.outcome === "valid") };
  });
  return aggregate("ts119602.entity.names", results, "Entity name and optional trade-name structures are locally valid.", "TEName and any TETradeName must be non-empty multilingual values.");
}

function entityAddressFinding(input: Ts119602EntitiesInput): CheckResult {
  if (input.entities.length === 0) return finding("ts119602.entity.address", "not_applicable", "info", "Entity addresses are not applicable because no entity was observed.");
  const results = input.entities.map((entity) => ({ path: entity.path, ...addressResult(entity.address) }));
  return aggregate("ts119602.entity.address", results, "Every TEAddress contains postal, email, and website contact structures.", "TEAddress must contain postal addresses plus a mailto URI and an HTTP(S) website URI.");
}

function entityInformationUriFinding(input: Ts119602EntitiesInput): CheckResult {
  if (input.entities.length === 0) return finding("ts119602.entity.information_uri", "not_applicable", "info", "TE information URIs are not applicable because no entity was observed.");
  const results = input.entities.map((entity) => {
    const multilingual = validateTs119602MultilingualValues(entity.informationUris);
    const values = entity.informationUris.map((entry) => ({ ...entry, uriValidation: validateTs119602Uri(entry.value) }));
    return { path: entity.path, multilingual, values, valid: multilingual.outcome === "valid" && values.every((entry) => entry.uriValidation.outcome === "valid") };
  });
  return aggregate("ts119602.entity.information_uri", results, "Every entity has one or more locally valid multilingual information pointers.", "TEInformationURI must be a non-empty multilingual pointer sequence including English and absolute RFC 3986 URIs.");
}

function serviceInformationFinding(services: Ts119602ServiceObservation[]): CheckResult {
  if (services.length === 0) return finding("ts119602.service.information", "not_applicable", "info", "Service information is not applicable because no service was observed.");
  const results = services.map((service) => ({ path: service.path, structure: service.informationStructure, serviceNameCount: service.name.length, digitalIdentityPresent: service.identity.present, valid: service.informationStructure.valid && service.name.length > 0 && service.identity.present }));
  return aggregate("ts119602.service.information", results, "Every service contains exactly nested ServiceName and ServiceDigitalIdentity components.", "ServiceInformation must contain exactly one ServiceName and ServiceDigitalIdentity, with only the defined optional components.", "critical");
}

function serviceNamesFinding(services: Ts119602ServiceObservation[]): CheckResult {
  if (services.length === 0) return finding("ts119602.service.name", "not_applicable", "info", "Service names are not applicable because no service was observed.");
  const results = services.map((service) => ({ path: service.path, validation: validateTs119602MultilingualValues(service.name), valid: validateTs119602MultilingualValues(service.name).outcome === "valid" }));
  return aggregate("ts119602.service.name", results, "Every service name is a locally valid multilingual value.", "ServiceName must be a non-empty multilingual value.");
}

function identityFinding(identities: Ts119602IdentityObservation[], certificateEvidence: Array<{ path: string; value: unknown; lexicalValid: boolean; summary?: CertificateSummary }>): CheckResult {
  if (identities.length === 0) return finding("ts119602.service.digital_identity", "not_applicable", "info", "Service digital identity is not applicable because no service or history identity was observed.");
  const results = identities.map((identity) => {
    const certificates = certificateEvidence.filter((entry) => identity.certificates.some((candidate) => candidate.path === entry.path));
    const subjects = identity.subjectNames.map((entry) => ({ ...entry, valid: typeof entry.value === "string" && validDistinguishedName(entry.value) }));
    const skis = identity.skis.map((entry) => ({ ...entry, valid: typeof entry.value === "string" && strictBase64(entry.value) }));
    const publicKeys = identity.publicKeys.map((entry) => ({ ...entry, valid: isNonEmptyObject(entry.value) }));
    const otherIds = identity.otherIds.map((entry) => ({ ...entry, valid: nonEmptyValue(entry.value) }));
    const count = certificates.length + subjects.length + skis.length + publicKeys.length + otherIds.length;
    const valid = identity.present && count > 0 && certificates.every((entry) => entry.lexicalValid && Boolean(entry.summary)) && subjects.every((entry) => entry.valid) && skis.every((entry) => entry.valid) && publicKeys.every((entry) => entry.valid) && otherIds.every((entry) => entry.valid);
    return { path: identity.path, identifierCount: count, certificates: certificates.map((entry) => ({ path: entry.path, lexicalValid: entry.lexicalValid, parsed: Boolean(entry.summary), summary: entry.summary })), subjects, skis, publicKeys, otherIds, valid };
  });
  return aggregate("ts119602.service.digital_identity", results, "Every service identity is non-empty and its locally supported identifier forms parse.", "ServiceDigitalIdentity must contain at least one valid identifier; certificates and SKIs require strict Base64 and certificates must parse.", "critical");
}

function identityEquivalenceFinding(identities: Ts119602IdentityObservation[]): CheckResult {
  const comparable = identities.filter((identity) => identity.certificates.length > 0 && (identity.publicKeys.length > 0 || identity.skis.length > 0));
  return finding("ts119602.service.identity_equivalence", comparable.length > 0 ? "not_checked" : "not_applicable", comparable.length > 0 ? "warning" : "info", comparable.length > 0 ? "Certificate/public-key and certificate/SKI equivalence is required but is not implemented by the local identity parser." : "Identity equivalence is not applicable because no identity combines a certificate with PublicKeyValue or X509SKI.", { comparableIdentityPaths: comparable.map((identity) => identity.path) });
}

function serviceStatusFinding(services: Ts119602ServiceObservation[], historyPeriod: unknown): CheckResult {
  if (services.length === 0) return finding("ts119602.service.status", "not_applicable", "info", "Service status is not applicable because no service was observed.");
  const historyRequired = Number.isInteger(historyPeriod) && (historyPeriod as number) > 0;
  const results = services.map((service) => ({ path: service.path, historyPeriod: historyPeriod ?? null, present: service.status.present, validation: service.status.present ? validateTs119602Uri(service.status.value) : undefined, valid: (!historyRequired || service.status.present) && (!service.status.present || validateTs119602Uri(service.status.value).outcome === "valid") }));
  return aggregate("ts119602.service.status", results, "ServiceStatus presence and local URI syntax are consistent with HistoricalInformationPeriod.", "A non-zero HistoricalInformationPeriod requires ServiceStatus, and any status must be an absolute URI.");
}

function serviceStatusStartFinding(services: Ts119602ServiceObservation[], issueValue: unknown): CheckResult {
  if (services.length === 0) return finding("ts119602.service.status_start", "not_applicable", "info", "Status starting time is not applicable because no service was observed.");
  const issue = parseTs119602UtcDateTime(issueValue);
  const present = services.filter((service) => service.statusStartingTime.present);
  if (present.length === 0) return finding("ts119602.service.status_start", "not_applicable", "info", "StatusStartingTime is optional and absent; past-time approval verification is not supported.", { listIssueDateTime: issue?.toISOString() ?? null });
  const results = present.map((service) => {
    const start = parseTs119602UtcDateTime(service.statusStartingTime.value);
    return { path: service.path, observed: service.statusStartingTime.value, parsed: start?.toISOString(), listIssueDateTime: issue?.toISOString(), valid: Boolean(start && issue && start.getTime() >= issue.getTime()) };
  });
  return aggregate("ts119602.service.status_start", results, "Every current status time is valid and not before list issuance.", "StatusStartingTime must use strict UTC syntax and must not precede ListIssueDateTime.");
}

function supplyPointFinding(services: Ts119602ServiceObservation[]): CheckResult {
  const present = services.filter((service) => service.supplyPointsPresent);
  if (present.length === 0) return finding("ts119602.service.supply_points", "not_applicable", "info", "ServiceSupplyPoints is optional and absent.");
  const results = present.map((service) => ({ path: service.path, points: service.supplyPoints.map((point) => ({ ...point, uriValidation: validateTs119602Uri(point.uri), typeValidation: point.type === undefined ? undefined : validateTs119602Uri(point.type), valid: validateTs119602Uri(point.uri).outcome === "valid" && (point.type === undefined || validateTs119602Uri(point.type).outcome === "valid") })), valid: service.supplyPoints.every((point) => validateTs119602Uri(point.uri).outcome === "valid" && (point.type === undefined || validateTs119602Uri(point.type).outcome === "valid")) }));
  return aggregate("ts119602.service.supply_points", results, "Every service supply point has a valid location and optional type URI.", "ServiceSupplyPoints must be non-empty absolute URIs with an optional absolute type URI.");
}

function historyFinding(services: Ts119602ServiceObservation[], historyPeriod: unknown): CheckResult {
  const present = services.filter((service) => service.historyPresent);
  if (present.length === 0) return finding("ts119602.service.history", "not_applicable", "info", "ServiceHistory is absent; no prior recorded status is asserted.", { historyPeriod: historyPeriod ?? null });
  const retained = Number.isInteger(historyPeriod) && (historyPeriod as number) > 0;
  const results = present.map((service) => {
    const instances = service.history.map((entry) => {
      const start = parseTs119602UtcDateTime(entry.statusStartingTime.value);
      const name = validateTs119602MultilingualValues(entry.name);
      return { path: entry.path, start, name, identityPresent: entry.identity.present, statusValid: entry.status.present && validateTs119602Uri(entry.status.value).outcome === "valid", valid: Boolean(start && name.outcome === "valid" && entry.identity.present && entry.status.present && validateTs119602Uri(entry.status.value).outcome === "valid") };
    });
    const times = instances.map((entry) => entry.start?.getTime());
    const descending = times.every((time, index) => index === 0 || (time !== undefined && times[index - 1] !== undefined && (times[index - 1] as number) > time));
    const current = parseTs119602UtcDateTime(service.statusStartingTime.value);
    const beforeCurrent = !current || times.every((time) => time !== undefined && time < current.getTime());
    return { path: service.path, retained, instanceCount: instances.length, descending, beforeCurrent, instances, valid: retained && instances.length > 0 && instances.every((entry) => entry.valid) && descending && beforeCurrent };
  });
  return aggregate("ts119602.service.history", results, "Service histories contain complete instances in descending time order.", "ServiceHistory is allowed only with retained history and must contain complete instances ordered newest to oldest before the current status time.");
}

function optionalUriFinding(id: string, label: string, values: Array<{ present: boolean; value: unknown }>): CheckResult {
  const present = values.filter((entry) => entry.present);
  if (present.length === 0) return finding(id, "not_applicable", "info", `${label} is optional and absent in the base data model.`);
  const results = present.map((entry) => ({ observed: entry.value, validation: validateTs119602Uri(entry.value), valid: validateTs119602Uri(entry.value).outcome === "valid" }));
  return aggregate(id, results, `${label} values are absolute URIs.`, `${label} values must be absolute URIs.`);
}

function optionalUriSequenceFinding(id: string, label: string, groups: Array<{ present: boolean; values: unknown[] }>): CheckResult {
  const present = groups.filter((group) => group.present);
  if (present.length === 0) return finding(id, "not_applicable", "info", `${label} is optional and absent.`);
  const results = present.map((group, index) => ({ index, values: group.values.map(uriResult), valid: group.values.length > 0 && group.values.every((value) => validateTs119602Uri(value).outcome === "valid") }));
  return aggregate(id, results, `${label} contains locally valid absolute URIs.`, `${label} must be a non-empty sequence of absolute URIs.`);
}

function extensionFinding(id: string, extensions: Ts119602ServiceExtensionObservation[], containerPresent: boolean, registry: { registryVersion: string; recognizedIdentifiers: readonly string[]; unknownCriticalPolicy: "reject" }): CheckResult {
  if (!containerPresent) return finding(id, "not_applicable", "info", "The extension container is optional and absent.", { registry });
  const results = extensions.map((extension) => ({ ...extension, criticalValid: typeof extension.critical === "boolean", reject: extension.critical === true && !extension.recognized, valid: typeof extension.critical === "boolean" && !(extension.critical === true && !extension.recognized) && extension.payloadValid }));
  const valid = results.length > 0 && results.every((entry) => entry.valid);
  return finding(id, valid ? "pass" : "fail", valid ? "info" : "critical", valid ? "Every extension has criticality and a valid recognized payload, or is safely ignorable." : "An extension container is empty, lacks criticality, has an invalid known payload, or contains an unknown critical extension.", { extensionCount: results.length, results, registry });
}

function addressResult(address: Ts119602AddressObservation) {
  const invalidPostal = address.postalAddresses.filter((entry) => !entry.streetPresent || !entry.countryPresent);
  const uriValidations = address.electronicUris.map((entry) => ({ ...entry, validation: validateTs119602Uri(entry.value) }));
  const schemes = uriValidations.map((entry) => entry.validation.classification);
  const postalLanguages = validateTs119602MultilingualValues(address.postalAddresses.map((entry) => ({ language: entry.language, value: entry.value })));
  const electronicLanguages = validateTs119602MultilingualValues(address.electronicUris.map((entry) => ({ language: entry.language, value: entry.value })));
  const hasEmail = schemes.includes("mailto");
  const hasWebsite = schemes.includes("http") || schemes.includes("https");
  return {
    structure: address.structure,
    postalAddressCount: address.postalAddresses.length,
    invalidPostal,
    postalLanguages,
    electronicLanguages,
    electronicUris: uriValidations,
    hasEmail,
    hasWebsite,
    valid: address.present
      && address.structure.valid
      && address.postalAddresses.length > 0
      && invalidPostal.length === 0
      && postalLanguages.outcome === "valid"
      && electronicLanguages.outcome === "valid"
      && uriValidations.every((entry) => entry.validation.outcome === "valid")
      && hasEmail
      && hasWebsite,
  };
}

function strictBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

function validDistinguishedName(value: string): boolean {
  const rdns = value.split(/(?<!\\),/);
  return rdns.length > 0 && rdns.every((rdn) => rdn.split(/(?<!\\)\+/).every((part) => /^(?:[A-Za-z][A-Za-z0-9-]*|\d+(?:\.\d+)+)=.+$/.test(part.trim())));
}

function nonEmptyValue(value: unknown): boolean { return typeof value === "string" ? value.length > 0 : value !== null && value !== undefined; }
function isNonEmptyObject(value: unknown): boolean { return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length > 0); }
function uriResult(value: unknown): { value: unknown; validation: ReturnType<typeof validateTs119602Uri> } { return { value, validation: validateTs119602Uri(value) }; }

function aggregate(id: string, results: Array<{ valid: boolean }>, passMessage: string, failMessage: string, failSeverity: CheckResult["severity"] = "error"): CheckResult {
  const valid = results.length > 0 && results.every((entry) => entry.valid);
  return finding(id, valid ? "pass" : "fail", valid ? "info" : failSeverity, valid ? passMessage : failMessage, { results });
}

function finding(id: string, status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult {
  const citation = citationForFinding(id);
  const citedEvidence = evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? { ...evidence, citation }
    : { details: evidence ?? null, citation };
  return { id, category: id.includes("status_start") || id.includes("history") ? "dates" : id.includes("service") ? "services" : "structure", status, severity, message, evidence: citedEvidence };
}

function citationForFinding(id: string): string {
  if (id === "ts119602.entities.list") return "ETSI TS 119 602 V1.1.1 clause 6.4.0";
  if (id === "ts119602.entities.structure") return "ETSI TS 119 602 V1.1.1 clauses 6.4.1 to 6.4.4";
  if (id === "ts119602.entity.information") return "ETSI TS 119 602 V1.1.1 clause 6.5.0";
  if (id === "ts119602.entity.names") return "ETSI TS 119 602 V1.1.1 clauses 6.5.1 and 6.5.2";
  if (id === "ts119602.entity.address") return "ETSI TS 119 602 V1.1.1 clause 6.5.3";
  if (id === "ts119602.entity.information_uri") return "ETSI TS 119 602 V1.1.1 clause 6.5.4";
  if (id === "ts119602.entity.extensions") return "ETSI TS 119 602 V1.1.1 clause 6.5.5";
  if (id === "ts119602.service.information") return "ETSI TS 119 602 V1.1.1 clause 6.6.0";
  if (id === "ts119602.service.type") return "ETSI TS 119 602 V1.1.1 clause 6.6.1";
  if (id === "ts119602.service.name") return "ETSI TS 119 602 V1.1.1 clause 6.6.2";
  if (id === "ts119602.service.digital_identity" || id === "ts119602.service.identity_equivalence") return "ETSI TS 119 602 V1.1.1 clause 6.6.3";
  if (id === "ts119602.service.status") return "ETSI TS 119 602 V1.1.1 clause 6.6.4";
  if (id === "ts119602.service.status_start") return "ETSI TS 119 602 V1.1.1 clause 6.6.5";
  if (id === "ts119602.service.scheme_definition") return "ETSI TS 119 602 V1.1.1 clause 6.6.6";
  if (id === "ts119602.service.supply_points") return "ETSI TS 119 602 V1.1.1 clause 6.6.7";
  if (id === "ts119602.service.definition") return "ETSI TS 119 602 V1.1.1 clause 6.6.8";
  if (id === "ts119602.service.extensions") return "ETSI TS 119 602 V1.1.1 clause 6.6.9";
  return "ETSI TS 119 602 V1.1.1 clause 6.7";
}
