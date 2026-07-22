import type {
  Ts119602EntitiesInput,
  Ts119602IdentityObservation,
  Ts119602ServiceExtensionObservation,
  Ts119602ServiceObservation,
  Ts119602StructureObservation,
} from "../standards/ts119602Entities.js";
import {
  TS119602_SCHEME_FIELDS,
  type Ts119602MetadataInput,
  type Ts119602SchemeField,
} from "../standards/ts119602Metadata.js";
import type { CheckResult } from "../types.js";

const TSL_NS = "http://uri.etsi.org/02231/v2#";
const XML_LANG = "http://www.w3.org/XML/1998/namespace";

export interface Ts119612MappedSourceField {
  sourceComponent: string;
  sourceClause: string;
  targetComponent: string;
  targetClause: string;
  present: boolean;
  count: number;
  sourceValidation: Array<{ id: string; status: CheckResult["status"] }>;
}

/**
 * Typed TS 119 612 facts emitted by the source-standard assessor. Consumers
 * must not reparse the XML to apply the TS 119 602 alternative binding.
 */
export interface Ts119612ValidatedFacts {
  sourceNamespace: string | null;
  sourceSchemaStatus: CheckResult["status"] | "missing";
  sourceBindingStatus: CheckResult["status"] | "missing";
  mappedFields: Ts119612MappedSourceField[];
  metadata: Ts119602MetadataInput;
  entities: Ts119602EntitiesInput;
}

interface MappingDefinition {
  source: string;
  sourceClause: string;
  target: string;
  targetClause: string;
  sourceCheckIds: readonly string[];
}

export const TS119602_TABLE_A1_MAPPING: readonly MappingDefinition[] = Object.freeze([
  map("TSLVersionIdentifier", "5.3.1", "LoTEVersionIdentifier", "6.3.1", ["ts119612.scheme.version"]),
  map("TSLSequenceNumber", "5.3.2", "LoTESequenceNumber", "6.3.2", ["ts119612.scheme.sequence.local"]),
  map("TSLType", "5.3.3", "LoTEType", "6.3.3", ["ts119612.scheme.type"]),
  map("SchemeOperatorName", "5.3.4", "SchemeOperatorName", "6.3.4", ["ts119612.scheme.operator_name"]),
  map("SchemeOperatorAddress", "5.3.5", "SchemeOperatorAddress", "6.3.5", ["ts119612.scheme.operator_address"]),
  map("SchemeName", "5.3.6", "SchemeName", "6.3.6", ["ts119612.scheme.name"]),
  map("SchemeInformationURI", "5.3.7", "SchemeInformationURI", "6.3.7", ["ts119612.scheme.information_uri"]),
  map("StatusDeterminationApproach", "5.3.8", "StatusDeterminationApproach", "6.3.8", ["ts119612.scheme.status_determination"]),
  map("SchemeTypeCommunityRules", "5.3.9", "SchemeTypeCommunityRules", "6.3.9", ["ts119612.scheme.community_rules"]),
  map("SchemeTerritory", "5.3.10", "SchemeTerritory", "6.3.10", ["ts119612.scheme.territory"]),
  map("PolicyOrLegalNotice", "5.3.11", "PolicyOrLegalNotice", "6.3.11", ["ts119612.scheme.policy_or_legal_notice"]),
  map("HistoricalInformationPeriod", "5.3.12", "HistoricalInformationPeriod", "6.3.12", ["ts119612.scheme.history_period"]),
  map("PointersToOtherTSL", "5.3.13", "PointersToOtherLoTE", "6.3.13", ["ts119612.scheme.pointers.structure"]),
  map("ListIssueDateTime", "5.3.14", "ListIssueDateTime", "6.3.14", ["ts119612.scheme.issue_time"]),
  map("NextUpdate", "5.3.15", "NextUpdate", "6.3.15", ["ts119612.scheme.next_update"]),
  map("DistributionPoints", "5.3.16", "DistributionPoints", "6.3.16", ["ts119612.scheme.distribution_points"]),
  map("SchemeExtensions", "5.3.17", "SchemeExtensions", "6.3.17", ["ts119612.scheme.extensions"]),
  map("TrustServiceProviderList", "5.3.18", "TrustedEntitiesList", "6.4", ["ts119612.providers.list"]),
  map("TSPName", "5.4.1", "TEName", "6.5.1", ["ts119612.tsp.*.name"]),
  map("TSPTradeName", "5.4.2", "TETradeName", "6.5.2", ["ts119612.tsp.*.trade_name"]),
  map("TSPAddress", "5.4.3", "TEAddress", "6.5.3", ["ts119612.tsp.*.address"]),
  map("TSPInformationURI", "5.4.4", "TEInformationURI", "6.5.4", ["ts119612.tsp.*.information_uri"]),
  map("TSPInformationExtensions", "5.4.5", "TEInformationExtensions", "6.5.5", ["ts119612.tsp.*.extensions"]),
  map("TSPServices", "5.4.6", "TrustedEntityServices", "6.4.2", ["ts119612.tsp.*.services"]),
  map("ServiceTypeIdentifier", "5.5.1", "ServiceTypeIdentifier", "6.6.1", ["ts119612.service.*.*.type"]),
  map("ServiceName", "5.5.2", "ServiceName", "6.6.2", ["ts119612.service.*.*.name"]),
  map("ServiceDigitalIdentity", "5.5.3", "ServiceDigitalIdentity", "6.6.3", ["ts119612.service.*.*.digital_identity", "ts119612.service.*.*.identity_equivalence"]),
  map("ServiceStatus", "5.5.4", "ServiceStatus", "6.6.4", ["ts119612.service.*.*.status"]),
  map("StatusStartingTime", "5.5.5", "StatusStartingTime", "6.6.5", ["ts119612.service.*.*.status_start"]),
  map("SchemeServiceDefinitionURI", "5.5.6", "SchemeServiceDefinitionURI", "6.6.6", ["ts119612.service.*.*.scheme_definition"]),
  map("ServiceSupplyPoints", "5.5.7", "ServiceSupplyPoints", "6.6.7", ["ts119612.service.*.*.supply_points"]),
  map("TSPServiceDefinitionURI", "5.5.8", "TEServiceDefinitionURI", "6.6.8", ["ts119612.service.*.*.tsp_definition"]),
  map("ServiceInformationExtensions", "5.5.9", "ServiceInformationExtensions", "6.6.9", ["ts119612.service.*.*.extensions"]),
  map("ServiceHistory", "5.6", "ServiceHistory", "6.4.4", ["ts119612.service.*.*.history.structure"]),
]);

export function extractTs119612ValidatedFacts(
  document: Document,
  checks: readonly CheckResult[],
  assessmentDate: Date,
): Ts119612ValidatedFacts {
  const root = document.documentElement;
  const scheme = direct(root, "SchemeInformation")[0];
  const sourceCounts = collectSourceCounts(root, scheme);
  const metadata = metadataFacts(root, scheme, sourceCounts, assessmentDate);
  const entities = entityFacts(root, metadata.historyPeriod, metadata.issueDateTime, assessmentDate);
  return {
    sourceNamespace: root.namespaceURI,
    sourceSchemaStatus: checks.find((entry) => entry.id === "schema.xsd")?.status ?? "missing",
    sourceBindingStatus: checks.find((entry) => entry.id === "ts119612.binding.supported")?.status ?? "missing",
    mappedFields: TS119602_TABLE_A1_MAPPING.map((definition) => ({
      sourceComponent: definition.source,
      sourceClause: definition.sourceClause,
      targetComponent: definition.target,
      targetClause: definition.targetClause,
      present: (sourceCounts.get(definition.source) ?? 0) > 0,
      count: sourceCounts.get(definition.source) ?? 0,
      sourceValidation: checks
        .filter((entry) => definition.sourceCheckIds.some((pattern) => matchesId(entry.id, pattern)))
        .map((entry) => ({ id: entry.id, status: entry.status })),
    })),
    metadata,
    entities,
  };
}

function metadataFacts(
  root: Element,
  scheme: Element | undefined,
  counts: Map<string, number>,
  assessmentDate: Date,
): Ts119602MetadataInput {
  const fieldSources: Record<Ts119602SchemeField, string> = {
    LoTEVersionIdentifier: "TSLVersionIdentifier", LoTESequenceNumber: "TSLSequenceNumber", LoTEType: "TSLType",
    SchemeOperatorName: "SchemeOperatorName", SchemeOperatorAddress: "SchemeOperatorAddress", SchemeName: "SchemeName",
    SchemeInformationURI: "SchemeInformationURI", StatusDeterminationApproach: "StatusDeterminationApproach",
    SchemeTypeCommunityRules: "SchemeTypeCommunityRules", SchemeTerritory: "SchemeTerritory",
    PolicyOrLegalNotice: "PolicyOrLegalNotice", HistoricalInformationPeriod: "HistoricalInformationPeriod",
    PointersToOtherLoTE: "PointersToOtherTSL", ListIssueDateTime: "ListIssueDateTime", NextUpdate: "NextUpdate",
    DistributionPoints: "DistributionPoints", SchemeExtensions: "SchemeExtensions",
  };
  const fields = Object.fromEntries(TS119602_SCHEME_FIELDS.map((target) => {
    const count = counts.get(fieldSources[target]) ?? 0;
    return [target, { present: count > 0, count }];
  })) as Ts119602MetadataInput["fields"];
  const address = scheme ? direct(scheme, "SchemeOperatorAddress")[0] : undefined;
  const policy = scheme ? direct(scheme, "PolicyOrLegalNotice")[0] : undefined;
  const pointers = scheme ? direct(direct(scheme, "PointersToOtherTSL")[0], "OtherTSLPointer") : [];
  const extensions = scheme ? direct(direct(scheme, "SchemeExtensions")[0], "Extension") : [];
  const next = scheme ? direct(scheme, "NextUpdate")[0] : undefined;
  return {
    binding: "xml",
    schemeInformationContainerPresent: Boolean(scheme),
    fields,
    loteTag: { present: root.hasAttribute("TSLTag"), value: root.getAttribute("TSLTag") || undefined },
    version: integer(value(direct(scheme, "TSLVersionIdentifier")[0])),
    sequence: integer(value(direct(scheme, "TSLSequenceNumber")[0])),
    loteType: value(direct(scheme, "TSLType")[0]),
    schemeInformationUris: values(direct(direct(scheme, "SchemeInformationURI")[0], "URI")),
    statusDeterminationApproach: value(direct(scheme, "StatusDeterminationApproach")[0]),
    schemeTypeCommunityRules: values(direct(direct(scheme, "SchemeTypeCommunityRules")[0], "URI")),
    schemeNames: multilingual(direct(direct(scheme, "SchemeName")[0], "Name")),
    territory: value(direct(scheme, "SchemeTerritory")[0]),
    address: addressFacts(address),
    policy: {
      present: Boolean(policy),
      policyPointerCount: direct(policy, "TSLPolicy").length,
      legalNoticeCount: direct(policy, "TSLLegalNotice").length,
      unknownEntryCount: children(policy).filter((entry) => !["TSLPolicy", "TSLLegalNotice"].includes(local(entry))).length,
    },
    historyPeriod: integer(value(direct(scheme, "HistoricalInformationPeriod")[0])),
    pointers: pointers.map((pointer, index) => pointerFacts(pointer, index)),
    issueDateTime: value(direct(scheme, "ListIssueDateTime")[0]),
    nextUpdate: { present: Boolean(next), value: value(direct(next, "dateTime")[0]) ?? (next ? value(next) ?? null : undefined) },
    serviceStatuses: descendants(root, "ServiceStatus").map(value).filter(isString),
    distributionPoints: { present: fields.DistributionPoints.present, values: values(direct(direct(scheme, "DistributionPoints")[0], "URI")) },
    extensions: { present: fields.SchemeExtensions.present, values: extensions.map(extensionFacts) },
    assessmentDate,
  };
}

function entityFacts(root: Element, historyPeriod: unknown, issue: unknown, assessmentDate: Date): Ts119602EntitiesInput {
  const providerContainer = direct(root, "TrustServiceProviderList")[0];
  const providers = direct(providerContainer, "TrustServiceProvider");
  return {
    containerPresent: Boolean(providerContainer),
    listStructure: mappedStructure(
      "/TrustServiceStatusList/TrustServiceProviderList",
      providers.map(() => "TrustServiceProvider"),
      Boolean(providerContainer) && providers.length > 0,
    ),
    entities: providers.map((provider, providerIndex) => {
      const path = `/TrustServiceStatusList/TrustServiceProviderList/TrustServiceProvider[${providerIndex + 1}]`;
      const information = direct(provider, "TSPInformation")[0];
      const servicesContainer = direct(provider, "TSPServices")[0];
      const extensionContainer = direct(information, "TSPInformationExtensions")[0];
      return {
        path,
        structure: mappedStructure(path, children(provider).map(local), Boolean(information && servicesContainer)),
        informationStructure: mappedStructure(
          `${path}/TSPInformation`,
          children(information).map(local),
          direct(information, "TSPName").length === 1
            && direct(information, "TSPAddress").length === 1
            && direct(information, "TSPInformationURI").length === 1,
        ),
        servicesStructure: mappedStructure(
          `${path}/TSPServices`,
          direct(servicesContainer, "TSPService").map(() => "TSPService"),
          Boolean(servicesContainer) && direct(servicesContainer, "TSPService").length > 0,
        ),
        informationPresent: Boolean(information),
        servicesContainerPresent: Boolean(servicesContainer),
        name: multilingual(direct(direct(information, "TSPName")[0], "Name")),
        tradeNamePresent: direct(information, "TSPTradeName").length > 0,
        tradeName: multilingual(direct(direct(information, "TSPTradeName")[0], "Name")),
        address: addressFacts(direct(information, "TSPAddress")[0]),
        informationUris: multilingual(direct(direct(information, "TSPInformationURI")[0], "URI")),
        extensionsPresent: Boolean(extensionContainer),
        extensions: direct(extensionContainer, "Extension").map(extensionFacts),
        services: direct(servicesContainer, "TSPService").map((service, serviceIndex) => serviceFacts(service, `${path}/TSPServices/TSPService[${serviceIndex + 1}]`)),
      };
    }),
    historyPeriod,
    listIssueDateTime: issue,
    assessmentDate,
  };
}

function serviceFacts(service: Element, path: string): Ts119602ServiceObservation {
  const information = direct(service, "ServiceInformation")[0];
  const historyContainer = direct(service, "ServiceHistory")[0];
  const extensions = direct(information, "ServiceInformationExtensions")[0];
  const supplyPoints = direct(direct(information, "ServiceSupplyPoints")[0], "ServiceSupplyPoint");
  return {
    path,
    structure: mappedStructure(
      path,
      children(service).map(local),
      Boolean(information) && direct(service, "ServiceInformation").length === 1 && direct(service, "ServiceHistory").length <= 1,
    ),
    informationStructure: mappedStructure(
      `${path}/ServiceInformation`,
      children(information).map(local),
      direct(information, "ServiceName").length === 1 && direct(information, "ServiceDigitalIdentity").length === 1,
    ),
    informationPresent: Boolean(information),
    name: multilingual(direct(direct(information, "ServiceName")[0], "Name")),
    identity: identityFacts(direct(information, "ServiceDigitalIdentity")[0], `${path}/ServiceInformation/ServiceDigitalIdentity`),
    typeIdentifier: presenceValue(direct(information, "ServiceTypeIdentifier")[0]),
    status: presenceValue(direct(information, "ServiceStatus")[0]),
    statusStartingTime: presenceValue(direct(information, "StatusStartingTime")[0]),
    schemeDefinitionPresent: direct(information, "SchemeServiceDefinitionURI").length > 0,
    schemeDefinitionUris: values(direct(direct(information, "SchemeServiceDefinitionURI")[0], "URI")),
    supplyPointsPresent: direct(information, "ServiceSupplyPoints").length > 0,
    supplyPoints: supplyPoints.map((point, index) => ({ path: `${path}/ServiceInformation/ServiceSupplyPoints/ServiceSupplyPoint[${index + 1}]`, uri: value(point), type: point.getAttribute("type") || undefined })),
    teDefinitionPresent: direct(information, "TSPServiceDefinitionURI").length > 0,
    teDefinitionUris: values(direct(direct(information, "TSPServiceDefinitionURI")[0], "URI")),
    extensionsPresent: Boolean(extensions),
    extensions: direct(extensions, "Extension").map(extensionFacts),
    historyPresent: Boolean(historyContainer),
    history: direct(historyContainer, "ServiceHistoryInstance").map((entry, index) => {
      const entryPath = `${path}/ServiceHistory/ServiceHistoryInstance[${index + 1}]`;
      return {
        path: entryPath,
        name: multilingual(direct(direct(entry, "ServiceName")[0], "Name")),
        identity: identityFacts(direct(entry, "ServiceDigitalIdentity")[0], `${entryPath}/ServiceDigitalIdentity`),
        status: presenceValue(direct(entry, "ServiceStatus")[0]),
        statusStartingTime: presenceValue(direct(entry, "StatusStartingTime")[0]),
        typeIdentifier: value(direct(entry, "ServiceTypeIdentifier")[0]),
        extensions: direct(direct(entry, "ServiceInformationExtensions")[0], "Extension").map(extensionFacts),
      };
    }),
  };
}

function mappedStructure(
  path: string,
  childNames: string[],
  valid: boolean,
): Ts119602StructureObservation {
  return {
    path,
    binding: "xml",
    observedType: valid || childNames.length > 0 ? "element" : "missing",
    childNames,
    violations: valid ? [] : [{ code: "structure.ts119612_mapping", message: "The TS 119 612 source does not provide the mandatory directly mapped TS 119 602 component structure." }],
    valid,
  };
}

function identityFacts(identity: Element | undefined, path: string): Ts119602IdentityObservation {
  const digitalIds = direct(identity, "DigitalId");
  const alternatives = (name: string) => digitalIds.flatMap((digitalId, digitalIndex) => direct(digitalId, name).map((entry) => ({
    path: `${path}/DigitalId[${digitalIndex + 1}]/${name}`,
    value: name === "KeyValue" ? { xmlElement: entry.nodeName } : ["X509Certificate", "X509SKI"].includes(name) ? (value(entry) ?? "").replace(/\s+/g, "") : value(entry),
  })));
  return {
    path, present: Boolean(identity), certificates: alternatives("X509Certificate"),
    subjectNames: alternatives("X509SubjectName"), publicKeys: alternatives("KeyValue"),
    skis: alternatives("X509SKI"), otherIds: alternatives("Other"),
  };
}

function addressFacts(address: Element | undefined): Ts119602MetadataInput["address"] {
  const postal = descendants(direct(address, "PostalAddresses")[0], "PostalAddress");
  const electronic = direct(direct(address, "ElectronicAddress")[0], "URI");
  return {
    present: Boolean(address),
    structure: {
      childNames: children(address).map(local),
      violations: address && direct(address, "PostalAddresses").length === 1 && direct(address, "ElectronicAddress").length === 1 && postal.length > 0 && electronic.length > 0
        ? []
        : [{ code: "structure.ts119612_address_mapping", message: "The mapped address requires directly nested non-empty postal and electronic address components." }],
      valid: Boolean(address && direct(address, "PostalAddresses").length === 1 && direct(address, "ElectronicAddress").length === 1 && postal.length > 0 && electronic.length > 0),
    },
    postalAddresses: postal.map((entry, index) => ({
      path: `/PostalAddress[${index + 1}]`,
      streetPresent: Boolean(value(direct(entry, "StreetAddress")[0])),
      countryPresent: Boolean(value(direct(entry, "CountryName")[0])),
      language: entry.getAttributeNS(XML_LANG, "lang") || undefined,
      value: children(entry).map(value).filter(isString).join(" "),
    })),
    electronicUris: electronic.map((entry, index) => ({ path: `/ElectronicAddress/URI[${index + 1}]`, value: value(entry), language: entry.getAttributeNS(XML_LANG, "lang") || undefined })),
  };
}

function pointerFacts(pointer: Element, index: number): Ts119602MetadataInput["pointers"][number] {
  const identities = direct(direct(pointer, "ServiceDigitalIdentities")[0], "ServiceDigitalIdentity");
  const information = direct(pointer, "AdditionalInformation")[0];
  return {
    path: `/SchemeInformation/PointersToOtherTSL/OtherTSLPointer[${index + 1}]`,
    location: value(direct(pointer, "TSLLocation")[0]), identityCount: identities.length,
    qualifiers: information ? [{
      path: `/SchemeInformation/PointersToOtherTSL/OtherTSLPointer[${index + 1}]/AdditionalInformation`,
      typePresent: descendants(information, "TSLType").length > 0,
      operatorNamePresent: descendants(information, "SchemeOperatorName").length > 0,
      mimeTypePresent: descendants(information, "MimeType").length > 0,
    }] : [],
  };
}

function extensionFacts(extension: Element): Ts119602ServiceExtensionObservation {
  const raw = extension.getAttribute("Critical");
  const content = children(extension)[0];
  const critical = raw === "true" || raw === "1" ? true : raw === "false" || raw === "0" ? false : raw || undefined;
  return {
    path: `/${local(extension)}`,
    critical,
    identifier: content ? `{${content.namespaceURI ?? ""}}${local(content)}` : undefined,
    recognized: false,
    payloadValid: Boolean(content),
    payloadEvidence: content ? value(content) : undefined,
  };
}

function collectSourceCounts(root: Element, scheme: Element | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  const schemeNames = TS119602_TABLE_A1_MAPPING.slice(0, 17).map((entry) => entry.source);
  schemeNames.forEach((name) => counts.set(name, direct(scheme, name).length));
  counts.set("TrustServiceProviderList", direct(root, "TrustServiceProviderList").length);
  const providers = descendants(root, "TrustServiceProvider");
  ["TSPName", "TSPTradeName", "TSPAddress", "TSPInformationURI", "TSPInformationExtensions"]
    .forEach((name) => counts.set(name, providers.reduce((sum, provider) => {
      const information = direct(provider, "TSPInformation")[0];
      return sum + direct(information, name).length;
    }, 0)));
  counts.set("TSPServices", providers.reduce((sum, provider) => sum + direct(provider, "TSPServices").length, 0));
  const services = descendants(root, "TSPService");
  ["ServiceTypeIdentifier", "ServiceName", "ServiceDigitalIdentity", "ServiceStatus", "StatusStartingTime", "SchemeServiceDefinitionURI", "ServiceSupplyPoints", "TSPServiceDefinitionURI", "ServiceInformationExtensions"]
    .forEach((name) => counts.set(name, services.reduce((sum, service) => {
      const information = direct(service, "ServiceInformation")[0];
      return sum + direct(information, name).length;
    }, 0)));
  counts.set("ServiceHistory", services.reduce((sum, service) => sum + direct(service, "ServiceHistory").length, 0));
  return counts;
}

function map(source: string, sourceClause: string, target: string, targetClause: string, sourceCheckIds: readonly string[]): MappingDefinition {
  return { source, sourceClause, target, targetClause, sourceCheckIds };
}
function matchesId(id: string, pattern: string): boolean { return new RegExp(`^${pattern.replaceAll(".", "\\.").replaceAll("*", "[0-9]+")}$`).test(id); }
function integer(input: string | undefined): unknown { return input && /^-?\d+$/.test(input) ? Number(input) : input; }
function presenceValue(element: Element | undefined): { present: boolean; value: unknown } { return { present: Boolean(element), value: value(element) }; }
function multilingual(elements: Element[]): Array<{ language: unknown; value: unknown }> { return elements.map((entry) => ({ language: entry.getAttributeNS(XML_LANG, "lang") || entry.getAttribute("xml:lang") || undefined, value: value(entry) })); }
function values(elements: Element[]): unknown[] { return elements.map(value); }
function descendants(parent: Element | undefined, name: string): Element[] { return parent ? Array.from(parent.getElementsByTagNameNS(TSL_NS, name)) : []; }
function direct(parent: Element | undefined, name: string): Element[] { return children(parent).filter((entry) => entry.namespaceURI === TSL_NS && local(entry) === name); }
function children(parent: Node | undefined): Element[] { return parent ? Array.from(parent.childNodes).filter((entry): entry is Element => entry.nodeType === 1) : []; }
function local(element: Element): string { return element.localName || element.nodeName.split(":").at(-1) as string; }
function value(element: Element | undefined): string | undefined { const result = element?.textContent?.trim(); return result || undefined; }
function isString(input: string | undefined): input is string { return Boolean(input); }
