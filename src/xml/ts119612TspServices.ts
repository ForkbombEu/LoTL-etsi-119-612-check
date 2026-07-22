import { tryCertificateFromBase64 } from "../certs.js";
import {
  validateTs119602MultilingualValues,
  validateTs119602Uri,
  validateTs119602UtcDateTime,
} from "../standards/ts119602Syntax.js";
import {
  classifyTs119612ServiceType,
  isTs119612PkiOptionalServiceType,
  TS119612_NATIONAL_ROOT_SERVICE_TYPE,
  TS119612_UNSPECIFIED_SERVICE_TYPE,
} from "../standards/ts119612ServiceTypes.js";
import type { ArtifactKind, CertificateSummary, CheckResult } from "../types.js";

const EU_GENERIC = "http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric";
const STATUS_PREFIX = "http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/";
const XML_LANG = "http://www.w3.org/XML/1998/namespace";
const XMLDSIG_NAMESPACE = "http://www.w3.org/2000/09/xmldsig#";
const ADDITIONAL_TYPES_NAMESPACE = "http://uri.etsi.org/02231/v2/additionaltypes#";
const QUALIFICATIONS_NAMESPACE = "http://uri.etsi.org/TrstSvc/SvcInfoExt/eSigDir-1999-93-EC-TrustedList/#";

const QUALIFIED_STATUSES = new Set([`${STATUS_PREFIX}granted`, `${STATUS_PREFIX}withdrawn`]);
const OTHER_STATUSES = new Set([
  `${STATUS_PREFIX}recognisedatnationallevel`, `${STATUS_PREFIX}deprecatedatnationallevel`,
]);
const TSP_INFO_ORDER = [
  "TSPName", "TSPTradeName", "TSPAddress", "TSPInformationURI", "TSPInformationExtensions",
] as const;
const SERVICE_INFO_ORDER = [
  "ServiceTypeIdentifier", "ServiceName", "ServiceDigitalIdentity", "ServiceStatus",
  "StatusStartingTime", "SchemeServiceDefinitionURI", "ServiceSupplyPoints",
  "TSPServiceDefinitionURI", "ServiceInformationExtensions",
] as const;

type TslArtifact = Extract<ArtifactKind, "ts119612_xml_tsl" | "ts119612_xml_lotl">;

export interface Ts119612TspServiceAssessment {
  checks: CheckResult[];
  certificates: CertificateSummary[];
  tspCount: number;
  serviceCount: number;
}

export function assessTs119612TspServices(
  document: Document,
  artifactKind: TslArtifact,
  assessmentDate: Date,
): Ts119612TspServiceAssessment {
  const checks: CheckResult[] = [];
  const certificates: CertificateSummary[] = [];
  const root = document.documentElement;
  const lists = namedChildren(root, "TrustServiceProviderList");
  const scheme = namedChild(root, "SchemeInformation");
  const tslType = text(scheme && namedChild(scheme, "TSLType"));
  const territory = text(scheme && namedChild(scheme, "SchemeTerritory"));
  const issueTime = text(scheme && namedChild(scheme, "ListIssueDateTime"));
  const euMember = tslType === EU_GENERIC;

  if (artifactKind === "ts119612_xml_lotl") {
    checks.push(check(
      "ts119612.providers.list", "structure",
      lists.length === 0 ? "not_applicable" : "fail",
      lists.length === 0 ? "info" : "critical",
      lists.length === 0
        ? "TrustServiceProviderList is not applicable to the selected LoTL artifact."
        : "TrustServiceProviderList shall not be present in a List of Trusted Lists.",
      { artifactKind, observedCount: lists.length },
    ));
    legacy(checks, "structure.trust_service_provider_list", "structure", "not_applicable", "info",
      "TrustServiceProviderList is not applicable to the selected LoTL artifact.");
    return { checks, certificates, tspCount: 0, serviceCount: 0 };
  }

  if (lists.length === 0) {
    checks.push(check(
      "ts119612.providers.list", "structure", "inconclusive", "warning",
      "TrustServiceProviderList is absent; local XML cannot establish whether no TSP is or was approved.",
      { artifactKind, observedCount: 0, approvalHistoryChecked: false },
    ));
    legacy(checks, "structure.trust_service_provider_list", "structure", "inconclusive", "warning",
      "TrustServiceProviderList presence is conditional on whether a TSP is or was approved.");
    legacy(checks, "services.tsp_count", "services", "not_applicable", "info",
      "No TrustServiceProvider entries are present.", 0);
    return { checks, certificates, tspCount: 0, serviceCount: 0 };
  }

  const list = lists[0];
  const providers = list ? namedChildren(list, "TrustServiceProvider") : [];
  const listValid = lists.length === 1
    && Boolean(list)
    && directChildren(list as Element).length === providers.length
    && providers.length > 0;
  checks.push(result(
    "ts119612.providers.list", "structure", listValid,
    "TrustServiceProviderList is a single direct non-empty provider sequence.",
    "A TL provider list shall be a single direct non-empty sequence containing only TrustServiceProvider elements.",
    { artifactKind, listCount: lists.length, providerCount: providers.length }, "critical",
  ));
  legacy(checks, "structure.trust_service_provider_list", "structure",
    lists.length === 1 ? "pass" : "fail", lists.length === 1 ? "info" : "error",
    "TrustServiceProviderList direct cardinality was checked.", lists.length);
  legacy(checks, "services.tsp_count", "services",
    providers.length > 0 ? "pass" : "fail", providers.length > 0 ? "info" : "error",
    "TrustServiceProvider entries counted.", providers.length);

  let serviceCount = 0;
  let certificateIndex = 0;
  providers.forEach((provider, providerIndex) => {
    const tspNumber = providerIndex + 1;
    const prefix = `ts119612.tsp.${tspNumber}`;
    const legacyPrefix = `services.tsp.${tspNumber}`;
    const providerChildren = directChildren(provider);
    const information = namedChildren(provider, "TSPInformation");
    const serviceLists = namedChildren(provider, "TSPServices");
    const providerValid = exactChildren(providerChildren, provider.namespaceURI, [
      { name: "TSPInformation", min: 1, max: 1 },
      { name: "TSPServices", min: 1, max: 1 },
    ]).valid && ordered(providerChildren, ["TSPInformation", "TSPServices"], provider.namespaceURI);
    checks.push(result(
      `${prefix}.structure`, "structure", providerValid,
      "TrustServiceProvider contains exactly TSPInformation followed by TSPServices.",
      "TrustServiceProvider shall contain exactly TSPInformation followed by TSPServices.",
      { observedChildren: qnames(providerChildren), informationCount: information.length, serviceListCount: serviceLists.length },
      "critical",
    ));
    legacy(checks, `${legacyPrefix}.information`, "structure", information.length === 1 ? "pass" : "fail",
      information.length === 1 ? "info" : "error", "TSPInformation direct cardinality was checked.", information.length);

    if (information[0]) assessTspInformation(
      information[0], prefix, legacyPrefix, euMember, checks,
    );
    const tspServices = serviceLists[0];
    const services = tspServices ? namedChildren(tspServices, "TSPService") : [];
    const servicesValid = serviceLists.length === 1
      && Boolean(tspServices)
      && directChildren(tspServices as Element).length === services.length
      && services.length > 0;
    checks.push(result(
      `${prefix}.services`, "structure", servicesValid,
      "TSPServices is a non-empty direct TSPService sequence.",
      "TSPServices shall contain a non-empty sequence of direct TSPService elements.",
      { serviceListCount: serviceLists.length, serviceCount: services.length }, "critical",
    ));
    legacy(checks, `${legacyPrefix}.service_count`, "services",
      services.length > 0 ? "pass" : "fail", services.length > 0 ? "info" : "error",
      "TSPServices/TSPService entries counted.", services.length);
    serviceCount += services.length;

    services.forEach((service, serviceIndex) => {
      const serviceNumber = serviceIndex + 1;
      const servicePrefix = `ts119612.service.${tspNumber}.${serviceNumber}`;
      const legacyServicePrefix = `${legacyPrefix}.service.${serviceNumber}`;
      const children = directChildren(service);
      const informationItems = namedChildren(service, "ServiceInformation");
      const histories = namedChildren(service, "ServiceHistory");
      const valid = exactChildren(children, service.namespaceURI, [
        { name: "ServiceInformation", min: 1, max: 1 },
        { name: "ServiceHistory", min: 0, max: 1 },
      ]).valid && ordered(children, ["ServiceInformation", "ServiceHistory"], service.namespaceURI);
      checks.push(result(
        `${servicePrefix}.container`, "structure", valid,
        "TSPService has one ServiceInformation followed by at most one ServiceHistory.",
        "TSPService shall contain one ServiceInformation followed by at most one ServiceHistory.",
        { observedChildren: qnames(children), serviceInformationCount: informationItems.length, historyCount: histories.length },
        "critical",
      ));
      if (informationItems[0]) {
        const parsed = assessServiceInformation(
          informationItems[0], servicePrefix, legacyServicePrefix,
          { euMember, issueTime }, checks,
        );
        parsed.certificateTexts.forEach((certificateText) => {
          certificateIndex += 1;
          addCertificateEvidence(certificateText, certificateIndex, assessmentDate, checks, certificates);
        });
      }
    });
  });

  return { checks, certificates, tspCount: providers.length, serviceCount };
}

function assessTspInformation(
  information: Element,
  prefix: string,
  legacyPrefix: string,
  euMember: boolean,
  checks: CheckResult[],
): void {
  const children = directChildren(information);
  const cardinality = exactChildren(children, information.namespaceURI, [
    { name: "TSPName", min: 1, max: 1 },
    { name: "TSPTradeName", min: 1, max: 1 },
    { name: "TSPAddress", min: 1, max: 1 },
    { name: "TSPInformationURI", min: 1, max: 1 },
    { name: "TSPInformationExtensions", min: 0, max: 1 },
  ]);
  checks.push(result(
    `${prefix}.information_structure`, "structure",
    cardinality.valid && ordered(children, TSP_INFO_ORDER, information.namespaceURI),
    "TSPInformation direct children satisfy normative order and cardinality.",
    "TSPInformation direct children do not satisfy normative order/cardinality; V2.4.1 requires TSPTradeName.",
    { observedChildren: qnames(children), violations: cardinality.violations }, "critical",
  ));

  const name = namedChild(information, "TSPName");
  const nameSyntax = multilingual(name, "Name", false);
  checks.push(result(
    `${prefix}.name`, "services", nameSyntax.valid,
    "TSPName has valid multilingual local syntax.",
    "TSPName shall contain a non-empty English-capable multilingual legal name.",
    { diagnostics: nameSyntax.diagnostics, formalLegalRegistrationChecked: false },
  ));
  legacy(checks, `${legacyPrefix}.name`, "structure", name ? "pass" : "fail", name ? "info" : "error",
    "TSPName direct presence was checked.");

  const tradeName = namedChild(information, "TSPTradeName");
  const tradeSyntax = multilingual(tradeName, "Name", false);
  const tradeValues = tradeName ? namedChildren(tradeName, "Name").map(text).filter(isString) : [];
  const identifiers = tradeValues.filter((value) => /^(?:VAT|NTR|PAS|IDC|PNO|TIN)[A-Z]{2}-.+$/.test(value));
  checks.push(result(
    `${prefix}.trade_name`, "services", tradeSyntax.valid && identifiers.length > 0,
    "TSPTradeName includes a locally well-formed official identifier.",
    "TSPTradeName is mandatory and shall include a multilingual official identifier using type, country, hyphen and identifier.",
    { values: tradeValues, identifierCandidates: identifiers, officialRegistryChecked: false, diagnostics: tradeSyntax.diagnostics },
  ));

  const address = namedChild(information, "TSPAddress");
  const addressSyntax = validateAddress(address);
  checks.push(result(
    `${prefix}.address`, "services", addressSyntax.valid,
    "TSPAddress has valid ordered postal and electronic local syntax.",
    "TSPAddress shall contain valid ordered postal and electronic contact structures.",
    { ...addressSyntax.evidence, customerCareOperationChecked: false },
  ));
  legacy(checks, `${legacyPrefix}.address`, "structure", address ? "pass" : "fail", address ? "info" : "error",
    "TSPAddress direct presence was checked.");

  const informationUri = namedChild(information, "TSPInformationURI");
  const informationUriSyntax = multilingual(informationUri, "URI", true);
  checks.push(result(
    `${prefix}.information_uri`, "services", informationUriSyntax.valid,
    "TSPInformationURI has valid multilingual absolute URI syntax.",
    "TSPInformationURI shall contain non-empty English-capable multilingual absolute URIs.",
    { diagnostics: informationUriSyntax.diagnostics, referencedContentChecked: false },
  ));

  checks.push(extensionCheck(
    `${prefix}.extensions`, namedChild(information, "TSPInformationExtensions"),
    "none", euMember,
    "TSP information extensions",
  ));
}

function assessServiceInformation(
  information: Element,
  prefix: string,
  legacyPrefix: string,
  context: { euMember: boolean; issueTime?: string },
  checks: CheckResult[],
): { certificateTexts: string[] } {
  const children = directChildren(information);
  const cardinality = exactChildren(children, information.namespaceURI, [
    { name: "ServiceTypeIdentifier", min: 1, max: 1 },
    { name: "ServiceName", min: 1, max: 1 },
    { name: "ServiceDigitalIdentity", min: 1, max: 1 },
    { name: "ServiceStatus", min: 1, max: 1 },
    { name: "StatusStartingTime", min: 1, max: 1 },
    { name: "SchemeServiceDefinitionURI", min: 0, max: 1 },
    { name: "ServiceSupplyPoints", min: 0, max: 1 },
    { name: "TSPServiceDefinitionURI", min: 0, max: 1 },
    { name: "ServiceInformationExtensions", min: 0, max: 1 },
  ]);
  checks.push(result(
    `${prefix}.structure`, "structure",
    cardinality.valid && ordered(children, SERVICE_INFO_ORDER, information.namespaceURI),
    "ServiceInformation direct children satisfy normative order and cardinality.",
    "ServiceInformation direct children do not satisfy normative order/cardinality.",
    { observedChildren: qnames(children), violations: cardinality.violations }, "critical",
  ));

  const typeValue = text(namedChild(information, "ServiceTypeIdentifier"));
  const typeClass = classifyTs119612ServiceType(typeValue);
  const typeUri = validateTs119602Uri(typeValue);
  if (typeUri.outcome !== "valid") {
    checks.push(result(`${prefix}.type`, "services", false, "",
      "ServiceTypeIdentifier shall be a non-empty absolute URI.",
      { value: typeValue ?? null, diagnostics: typeUri.diagnostics }, "critical"));
  } else if (typeClass === "custom") {
    checks.push(check(
      `${prefix}.type`, "services", "inconclusive", "warning",
      "ServiceTypeIdentifier is absolute, but local evidence cannot establish custom URI registration and meaning.",
      { value: typeValue, classification: typeClass, registryChecked: false },
    ));
  } else {
    checks.push(result(`${prefix}.type`, "services", true,
      "ServiceTypeIdentifier is registered by clauses 5.5.1.1-5.5.1.3.", "",
      { value: typeValue, classification: typeClass }, "critical"));
  }
  legacy(checks, `${legacyPrefix}.type_identifier`, "structure", typeValue ? "pass" : "fail",
    typeValue ? "info" : "error", "ServiceTypeIdentifier direct presence was checked.", typeValue);

  const name = namedChild(information, "ServiceName");
  const nameSyntax = multilingual(name, "Name", false);
  checks.push(result(`${prefix}.name`, "services", nameSyntax.valid,
    "ServiceName has valid multilingual local syntax.",
    "ServiceName shall contain a non-empty English-capable multilingual name.",
    { diagnostics: nameSyntax.diagnostics }));
  legacy(checks, `${legacyPrefix}.service_name`, "structure", name ? "pass" : "fail",
    name ? "info" : "error", "ServiceName direct presence was checked.");

  const identity = namedChild(information, "ServiceDigitalIdentity");
  const identityAssessment = assessDigitalIdentity(identity, typeValue);
  checks.push(identityAssessment.valid && !identityAssessment.conclusive
    ? check(
      `${prefix}.digital_identity`, "services", "inconclusive", "warning",
      "ServiceDigitalIdentity has a locally valid representation, but a custom service type does not establish whether PKI or non-PKI form applies.",
      identityAssessment.evidence,
    )
    : result(
      `${prefix}.digital_identity`, "services", identityAssessment.valid,
      "ServiceDigitalIdentity satisfies locally decidable PKI/non-PKI representation structure.",
      "ServiceDigitalIdentity does not satisfy the representation required by ServiceTypeIdentifier.",
      identityAssessment.evidence, "critical",
    ));
  legacy(checks, `${legacyPrefix}.digital_identity`, "structure", identity ? "pass" : "fail",
    identity ? "info" : "error", "ServiceDigitalIdentity direct presence was checked.");

  const statusValue = text(namedChild(information, "ServiceStatus"));
  const statusUri = validateTs119602Uri(statusValue);
  if (statusUri.outcome !== "valid") {
    checks.push(result(`${prefix}.status`, "services", false, "",
      "ServiceStatus shall be a non-empty absolute URI.",
      { value: statusValue ?? null, diagnostics: statusUri.diagnostics }, "critical"));
  } else if (!context.euMember || typeClass === "custom") {
    checks.push(check(`${prefix}.status`, "services", "inconclusive", "warning",
      "ServiceStatus is absolute, but its scheme-defined vocabulary cannot be established from local evidence.",
      { value: statusValue, euMember: context.euMember, serviceTypeClassification: typeClass, schemeRulesChecked: false }));
  } else {
    const allowed = typeClass === "qualified" ? QUALIFIED_STATUSES : OTHER_STATUSES;
    checks.push(result(`${prefix}.status`, "services", allowed.has(statusValue as string),
      "ServiceStatus belongs to the registered EU vocabulary for its service-type family.",
      "ServiceStatus does not belong to the registered EU vocabulary for its service-type family.",
      { value: statusValue, serviceTypeClassification: typeClass, allowedValues: [...allowed], transitionHistoryChecked: false },
      "critical"));
  }
  legacy(checks, `${legacyPrefix}.status`, "structure", statusValue ? "pass" : "fail",
    statusValue ? "info" : "error", "ServiceStatus direct presence was checked.", statusValue);

  const startingValue = text(namedChild(information, "StatusStartingTime"));
  const starting = strictDate(startingValue);
  const issue = strictDate(context.issueTime);
  checks.push(result(
    `${prefix}.status_start`, "dates", Boolean(starting && issue && starting >= issue),
    "StatusStartingTime has strict UTC syntax and is not before ListIssueDateTime.",
    "StatusStartingTime shall use strict UTC syntax and shall not predate ListIssueDateTime.",
    {
      value: startingValue ?? null,
      listIssueDateTime: context.issueTime ?? null,
      signingTimeConsistencyChecked: false,
      statusTransitionHistoryChecked: false,
    },
  ));
  legacy(checks, `${legacyPrefix}.status_starting_time`, "structure", startingValue ? "pass" : "fail",
    startingValue ? "info" : "error", "StatusStartingTime direct presence was checked.", startingValue);

  const schemeDefinition = namedChild(information, "SchemeServiceDefinitionURI");
  checks.push(optionalMultilingualUriCheck(
    `${prefix}.scheme_definition`, schemeDefinition, false,
    "SchemeServiceDefinitionURI", "Referenced scheme service-definition content was not fetched.",
  ));
  const supplyPoints = namedChild(information, "ServiceSupplyPoints");
  checks.push(supplyPointsCheck(`${prefix}.supply_points`, supplyPoints));
  const tspDefinition = namedChild(information, "TSPServiceDefinitionURI");
  checks.push(optionalMultilingualUriCheck(
    `${prefix}.tsp_definition`, tspDefinition, typeValue === TS119612_NATIONAL_ROOT_SERVICE_TYPE,
    "TSPServiceDefinitionURI", "Referenced TSP service-definition content was not fetched.",
  ));
  const extensions = namedChild(information, "ServiceInformationExtensions");
  checks.push(extensionCheck(
    `${prefix}.extensions`, extensions, "service", false,
    "Service information extensions",
  ));

  if (typeValue === TS119612_UNSPECIFIED_SERVICE_TYPE) {
    checks.push(result(
      `${prefix}.unspecified_definition`, "services", Boolean(schemeDefinition || extensions),
      "The unspecified service type is accompanied by service-level definition evidence.",
      "The unspecified service type requires SchemeServiceDefinitionURI or ServiceInformationExtensions.",
      { schemeDefinitionPresent: Boolean(schemeDefinition), serviceExtensionsPresent: Boolean(extensions) },
    ));
  } else {
    checks.push(check(`${prefix}.unspecified_definition`, "services", "not_applicable", "info",
      "The unspecified-service definition rule is not applicable.", { serviceType: typeValue ?? null }));
  }

  return { certificateTexts: identityAssessment.certificateTexts };
}

function assessDigitalIdentity(
  container: Element | undefined,
  serviceType: string | undefined,
): { valid: boolean; conclusive: boolean; certificateTexts: string[]; evidence: Record<string, unknown> } {
  if (!container) return {
    valid: false,
    conclusive: true,
    certificateTexts: [],
    evidence: { diagnostics: ["ServiceDigitalIdentity is missing."] },
  };
  const all = directChildren(container);
  const ids = namedChildren(container, "DigitalId");
  const diagnostics: string[] = [];
  if (all.length !== ids.length || ids.length === 0) {
    diagnostics.push("ServiceDigitalIdentity shall contain a non-empty sequence of direct DigitalId elements.");
  }
  const representations = ids.map((id, index) => {
    const content = directChildren(id);
    if (content.length !== 1) diagnostics.push(`DigitalId ${index + 1} shall contain exactly one representation element.`);
    const representation = content[0];
    const name = representation ? local(representation) : "missing";
    const allowed = ["X509Certificate", "X509SubjectName", "KeyValue", "X509SKI", "Other"];
    if (!representation || !allowed.includes(name)) diagnostics.push(`DigitalId ${index + 1} has an unsupported representation.`);
    const expectedNamespace = name === "KeyValue" ? XMLDSIG_NAMESPACE : container.namespaceURI;
    if (representation && representation.namespaceURI !== expectedNamespace) {
      diagnostics.push(`DigitalId ${index + 1} representation is in an unexpected namespace.`);
    }
    return { name, element: representation };
  });
  const counts = Object.fromEntries(
    ["X509Certificate", "X509SubjectName", "KeyValue", "X509SKI", "Other"]
      .map((name) => [name, representations.filter((item) => item.name === name).length]),
  );
  const nonPkiRequired = serviceType?.endsWith("/nothavingPKIid") ?? false;
  const pkiOptional = isTs119612PkiOptionalServiceType(serviceType);
  const customType = classifyTs119612ServiceType(serviceType) === "custom";
  const otherElements = representations.filter((item) => item.name === "Other").map((item) => item.element);
  const otherUris = otherElements.map((element) => text(element)).filter(isString);
  const otherUriValid = otherElements.length === 1
    && otherUris.length === 1
    && validateTs119602Uri(otherUris[0]).outcome === "valid"
    && directChildren(otherElements[0] as Element).length === 0;
  const pkiValid = (counts.X509Certificate ?? 0) >= 1
    && (counts.X509SubjectName ?? 0) <= 1
    && (counts.KeyValue ?? 0) <= 1
    && (counts.X509SKI ?? 0) <= 1
    && (counts.Other ?? 0) === 0;
  if (nonPkiRequired && !otherUriValid) diagnostics.push("A /nothavingPKIid service requires exactly one simple absolute Other URI representation.");
  if (!nonPkiRequired && !pkiOptional && !pkiValid) diagnostics.push("This service type requires at least one X509Certificate representation and no Other representation.");
  if (pkiOptional && !pkiValid && !otherUriValid) diagnostics.push("This service type permits either a PKI tuple or one non-PKI Other URI representation.");
  if (customType) {
    const modeDiagnostic = "This service type requires at least one X509Certificate representation and no Other representation.";
    const index = diagnostics.indexOf(modeDiagnostic);
    if (index >= 0) diagnostics.splice(index, 1);
    if (!pkiValid && !otherUriValid) diagnostics.push("A custom service type still requires a locally valid PKI tuple or one non-PKI Other URI representation.");
  }
  const certificateTexts = representations
    .filter((item) => item.name === "X509Certificate")
    .map((item) => text(item.element)).filter(isString);
  return {
    valid: diagnostics.length === 0,
    conclusive: !customType,
    certificateTexts,
    evidence: {
      serviceType: serviceType ?? null,
      representationCounts: counts,
      nonPkiRequired,
      pkiOptional,
      serviceTypeModeConclusive: !customType,
      nonPkiUris: otherUris,
      diagnostics,
      representationEquivalenceChecked: false,
      uniquenessAcrossListChecked: false,
      certificateSubjectTspNameMatchChecked: false,
    },
  };
}

function validateAddress(address: Element | undefined): {
  valid: boolean;
  evidence: Record<string, unknown>;
} {
  if (!address) return { valid: false, evidence: { violations: ["Address is missing."] } };
  const violations: string[] = [];
  const children = directChildren(address);
  const postalContainers = namedChildren(address, "PostalAddresses");
  const electronicContainers = namedChildren(address, "ElectronicAddress");
  if (
    children.length !== 2
    || postalContainers.length !== 1
    || electronicContainers.length !== 1
    || !ordered(children, ["PostalAddresses", "ElectronicAddress"], address.namespaceURI)
  ) violations.push("Address shall contain exactly PostalAddresses followed by ElectronicAddress.");
  const postals = postalContainers[0] ? namedChildren(postalContainers[0], "PostalAddress") : [];
  if (!postalContainers[0] || directChildren(postalContainers[0]).length !== postals.length || postals.length === 0) {
    violations.push("PostalAddresses shall contain a non-empty direct PostalAddress sequence.");
  }
  const postalValues: Array<{ language: unknown; value: unknown }> = [];
  postals.forEach((postal, index) => {
    const fields = directChildren(postal);
    const card = exactChildren(fields, postal.namespaceURI, [
      { name: "StreetAddress", min: 1, max: 1 },
      { name: "Locality", min: 1, max: 1 },
      { name: "StateOrProvince", min: 0, max: 1 },
      { name: "PostalCode", min: 0, max: 1 },
      { name: "CountryName", min: 1, max: 1 },
    ]);
    if (!card.valid || !ordered(fields, ["StreetAddress", "Locality", "StateOrProvince", "PostalCode", "CountryName"], postal.namespaceURI)) {
      violations.push(`PostalAddress ${index + 1} has invalid direct order/cardinality.`);
    }
    const values = fields.map(text).filter(isString);
    if (values.length !== fields.length) violations.push(`PostalAddress ${index + 1} contains an empty field.`);
    const country = text(namedChild(postal, "CountryName"));
    if (!country || !/^[A-Z]{2}$/.test(country)) violations.push(`PostalAddress ${index + 1} CountryName shall be an uppercase two-character code.`);
    postalValues.push({ language: language(postal), value: values.join(" ") });
  });
  const postalSyntax = validateTs119602MultilingualValues(postalValues);
  violations.push(...postalSyntax.diagnostics.map((entry) => `Postal address: ${entry.message}`));

  const electronic = electronicContainers[0];
  const uris = electronic ? namedChildren(electronic, "URI") : [];
  if (!electronic || directChildren(electronic).length !== uris.length || uris.length < 2 || uris.length > 3) {
    violations.push("ElectronicAddress shall contain email and website URIs followed by at most one telephone URI.");
  }
  uris.forEach((uriElement, index) => {
    const uri = validateTs119602Uri(text(uriElement));
    const expected = index === 0 ? "mailto" : index === 1 ? "web" : "tel";
    const validScheme = expected === "web"
      ? uri.classification === "http" || uri.classification === "https"
      : uri.classification === expected;
    if (uri.outcome !== "valid" || !validScheme) violations.push(`ElectronicAddress URI ${index + 1} does not use the required ${expected} syntax.`);
  });
  const electronicSyntax = validateTs119602MultilingualValues(uris.map((uri) => ({
    language: language(uri), value: text(uri),
  })));
  violations.push(...electronicSyntax.diagnostics.map((entry) => `Electronic address: ${entry.message}`));
  return {
    valid: violations.length === 0,
    evidence: { postalAddressCount: postals.length, electronicUriCount: uris.length, violations },
  };
}

function multilingual(
  container: Element | undefined,
  itemName: string,
  uriValues: boolean,
): { valid: boolean; diagnostics: string[] } {
  if (!container) return { valid: false, diagnostics: ["The container is missing."] };
  const all = directChildren(container);
  const items = namedChildren(container, itemName);
  const diagnostics: string[] = [];
  if (all.length !== items.length) diagnostics.push(`Only direct ${itemName} children in the TSL namespace are allowed.`);
  const syntax = validateTs119602MultilingualValues(items.map((item) => ({
    language: language(item), value: text(item),
  })));
  diagnostics.push(...syntax.diagnostics.map((entry) => entry.message));
  items.forEach((item, index) => {
    if (directChildren(item).length > 0) diagnostics.push(`${itemName} ${index + 1} shall have simple text content.`);
    if (uriValues) diagnostics.push(...validateTs119602Uri(text(item)).diagnostics
      .map((entry) => `${itemName} ${index + 1}: ${entry.message}`));
  });
  return { valid: diagnostics.length === 0, diagnostics };
}

function optionalMultilingualUriCheck(
  id: string,
  container: Element | undefined,
  required: boolean,
  label: string,
  limitation: string,
): CheckResult {
  if (!container) return check(
    id, "services", required ? "fail" : "not_applicable", required ? "error" : "info",
    required ? `${label} is mandatory for this service type.` : `${label} is optional and absent.`,
    { required, referencedContentChecked: false },
  );
  const syntax = multilingual(container, "URI", true);
  return result(id, "services", syntax.valid,
    `${label} has valid multilingual absolute URI syntax.`,
    `${label} shall contain non-empty English-capable multilingual absolute URIs.`,
    { required, diagnostics: syntax.diagnostics, limitation });
}

function supplyPointsCheck(id: string, container: Element | undefined): CheckResult {
  if (!container) return check(id, "services", "not_applicable", "info",
    "ServiceSupplyPoints is optional and absent.", { referencedContentChecked: false });
  const all = directChildren(container);
  const points = namedChildren(container, "ServiceSupplyPoint");
  const diagnostics: string[] = [];
  if (all.length !== points.length || points.length === 0) {
    diagnostics.push("ServiceSupplyPoints shall contain a non-empty direct ServiceSupplyPoint sequence.");
  }
  points.forEach((point, index) => {
    diagnostics.push(...validateTs119602Uri(text(point)).diagnostics
      .map((entry) => `ServiceSupplyPoint ${index + 1}: ${entry.message}`));
    const type = point.getAttribute("type");
    if (type !== null) diagnostics.push(...validateTs119602Uri(type).diagnostics
      .map((entry) => `ServiceSupplyPoint ${index + 1} type: ${entry.message}`));
    if (directChildren(point).length > 0) diagnostics.push(`ServiceSupplyPoint ${index + 1} shall have simple text content.`);
    const unexpectedAttributes = Array.from(point.attributes)
      .filter((attribute) => attribute.name !== "type" && !attribute.name.startsWith("xmlns"));
    if (unexpectedAttributes.length > 0) diagnostics.push(`ServiceSupplyPoint ${index + 1} has unexpected attributes.`);
  });
  return result(id, "services", diagnostics.length === 0,
    "ServiceSupplyPoints has valid access and optional type URIs.",
    "ServiceSupplyPoints contains invalid structure or URI syntax.",
    { pointCount: points.length, diagnostics, referencedContentChecked: false });
}

function extensionCheck(
  id: string,
  container: Element | undefined,
  recognitionMode: "none" | "service",
  prohibitCritical: boolean,
  label: string,
): CheckResult {
  if (!container) return check(id, "services", "not_applicable", "info", `${label} are optional and absent.`);
  const all = directChildren(container);
  const extensions = namedChildren(container, "Extension");
  const diagnostics: string[] = [];
  if (all.length !== extensions.length || extensions.length === 0) diagnostics.push(`${label} shall contain a non-empty direct Extension sequence.`);
  const details = extensions.map((extension, index) => {
    const critical = extension.getAttribute("Critical");
    const content = directChildren(extension);
    const names = content.map(local);
    const recognized = recognitionMode === "service" && content.some((element) => recognizedServiceExtension(
      element, container.namespaceURI,
    ));
    if (!critical || !["true", "false", "1", "0"].includes(critical)) diagnostics.push(`Extension ${index + 1} requires boolean Critical.`);
    if ((critical === "true" || critical === "1") && prohibitCritical) diagnostics.push(`Extension ${index + 1} shall not be critical in this EU TSP context.`);
    if ((critical === "true" || critical === "1") && !prohibitCritical && !recognized) diagnostics.push(`Extension ${index + 1} is critical but not recognized locally.`);
    return { critical, childNames: names, recognized };
  });
  return result(id, "services", diagnostics.length === 0,
    `${label} satisfy base structure and criticality handling.`,
    `${label} do not satisfy base structure or criticality handling.`,
    { extensions: details, diagnostics, detailedExtensionSemanticsChecked: false }, "critical");
}

function recognizedServiceExtension(element: Element, tslNamespace: string | null): boolean {
  const name = local(element);
  return (
    element.namespaceURI === tslNamespace
      && (name === "ExpiredCertsRevocationInfo" || name === "AdditionalServiceInformation")
  ) || (
    element.namespaceURI === QUALIFICATIONS_NAMESPACE && name === "Qualifications"
  ) || (
    element.namespaceURI === ADDITIONAL_TYPES_NAMESPACE && name === "TakenOverBy"
  );
}

function addCertificateEvidence(
  certificateText: string,
  index: number,
  assessmentDate: Date,
  checks: CheckResult[],
  certificates: CertificateSummary[],
): void {
  const certificate = tryCertificateFromBase64(certificateText, "service_digital_identity", assessmentDate);
  if (!certificate) {
    checks.push(check(`certificates.service.${index}.parse`, "certificates", "fail", "error",
      "Service digital identity X.509 certificate could not be parsed."));
    return;
  }
  certificates.push(certificate);
  checks.push(check(`certificates.service.${index}.parse`, "certificates", "pass", "info",
    "Service digital identity X.509 certificate parsed.",
    { subject: certificate.subject, fingerprintSha256: certificate.fingerprintSha256 }));
  checks.push(check(
    `certificates.service.${index}.validity`, "certificates",
    certificate.validAtAssessmentTime === false ? "warn" : "pass",
    certificate.validAtAssessmentTime === false ? "warning" : "info",
    certificate.validAtAssessmentTime === false
      ? "Service digital identity certificate is expired or not yet valid at assessment time."
      : "Service digital identity certificate is valid at assessment time.",
    { notBefore: certificate.notBefore, notAfter: certificate.notAfter },
  ));
}

function exactChildren(
  children: Element[],
  namespace: string | null,
  expected: Array<{ name: string; min: number; max: number }>,
): { valid: boolean; violations: Array<Record<string, unknown>> } {
  const expectedNames = new Set(expected.map((item) => item.name));
  const violations: Array<Record<string, unknown>> = [];
  expected.forEach((item) => {
    const observed = children.filter((element) => element.namespaceURI === namespace && local(element) === item.name).length;
    if (observed < item.min || observed > item.max) violations.push({ name: item.name, observed, min: item.min, max: item.max });
  });
  children.filter((element) => element.namespaceURI !== namespace || !expectedNames.has(local(element)))
    .forEach((element) => violations.push({ name: qname(element), observed: 1, min: 0, max: 0 }));
  return { valid: violations.length === 0, violations };
}

function ordered(children: Element[], order: readonly string[], namespace: string | null): boolean {
  const positions = children
    .filter((element) => element.namespaceURI === namespace && order.includes(local(element)))
    .map((element) => order.indexOf(local(element)));
  return positions.every((position, index) => index === 0 || position >= positions[index - 1]);
}

function directChildren(parent: Node): Element[] {
  return Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1);
}

function namedChildren(parent: Element, name: string): Element[] {
  return directChildren(parent).filter((element) => element.namespaceURI === parent.namespaceURI && local(element) === name);
}

function namedChild(parent: Element | undefined, name: string): Element | undefined {
  return parent ? namedChildren(parent, name)[0] : undefined;
}

function qnames(elements: Element[]): string[] {
  return elements.map(qname);
}

function qname(element: Element): string {
  return `{${element.namespaceURI ?? ""}}${local(element)}`;
}

function local(element: Element): string {
  return element.localName || element.nodeName.split(":").at(-1) as string;
}

function text(element: Element | undefined): string | undefined {
  const value = element?.textContent?.trim();
  return value || undefined;
}

function language(element: Element): string | null {
  return element.getAttributeNS(XML_LANG, "lang") ?? element.getAttribute("xml:lang");
}

function strictDate(value: string | undefined): Date | undefined {
  return validateTs119602UtcDateTime(value).outcome === "valid" ? new Date(value as string) : undefined;
}

function isString(value: string | undefined): value is string {
  return Boolean(value);
}

function result(
  id: string,
  category: CheckResult["category"],
  valid: boolean,
  passMessage: string,
  failMessage: string,
  evidence?: unknown,
  failureSeverity: Extract<CheckResult["severity"], "critical" | "error"> = "error",
): CheckResult {
  return check(id, category, valid ? "pass" : "fail", valid ? "info" : failureSeverity,
    valid ? passMessage : failMessage, evidence);
}

function legacy(
  checks: CheckResult[],
  id: string,
  category: CheckResult["category"],
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): void {
  checks.push(check(id, category, status, severity, message, evidence));
}

function check(
  id: string,
  category: CheckResult["category"],
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): CheckResult {
  return { id, category, status, severity, message, evidence };
}
