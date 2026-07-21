import { buildStandardAssessment } from "../standards/assessment.js";
import {
  buildTs119602EntityFindings,
  TS119602_ENTITY_EXTENSION_REGISTRY,
  TS119602_SERVICE_EXTENSION_REGISTRY,
  type Ts119602EntitiesInput,
  type Ts119602IdentityObservation,
  type Ts119602ServiceExtensionObservation,
  type Ts119602ServiceObservation,
} from "../standards/ts119602Entities.js";
import {
  buildTs119602MetadataFindings,
  inferTs119602SchemeMode,
  TS119602_SCHEME_FIELDS,
  ts119602Table1Presence,
  type Ts119602MetadataInput,
} from "../standards/ts119602Metadata.js";
import { summarizeTs119602Requirements } from "../standards/ts119602Requirements.js";
import { buildTs119602ProfileFindings } from "../standards/ts119602Profiles.js";
import { parseTs119602UtcDateTime, validateTs119602Uri } from "../standards/ts119602Syntax.js";
import {
  buildTs119602SyntaxFindings,
  type LocatedMultilingualSet,
  type LocatedSyntaxValue,
} from "../standards/ts119602SyntaxFindings.js";
import type { CheckResult, TrustedListAuditResult } from "../types.js";
import { assessSignature } from "./signature.js";
import { parseXml } from "./parse.js";
import { firstNode, has, nodes, text, texts } from "./xpath.js";

const ETSI_TS119602_NAMESPACE = "http://uri.etsi.org/019602/v1#";
const INFO = `./*[local-name()='ListAndSchemeInformation' and namespace-uri()='${ETSI_TS119602_NAMESPACE}']`;
const TRUSTED_ENTITIES =
  `./*[local-name()='TrustedEntitiesList' and namespace-uri()='${ETSI_TS119602_NAMESPACE}']`
  + `/*[local-name()='TrustedEntity' and namespace-uri()='${ETSI_TS119602_NAMESPACE}']`;
const PUB_EAA_LOTE_TYPE = "http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList";

type XmlLoteBinding = "etsi_ts_119_602_v1_1_1" | "we_build_compatibility" | "unsupported";

/** Assess the implemented ETSI TS 119 602 XML LoTE data-model evidence. */
export async function assessXmlLoteMetadata(
  xml: string,
  assessmentDate = new Date(),
  profileSelectionStatus?: NonNullable<TrustedListAuditResult["ts119602Classification"]>["profileStatus"],
): Promise<Pick<TrustedListAuditResult, "ts119602" | "extracted" | "detected">> {
  const parsed = parseXml(xml);
  if (!parsed.document || parsed.errors.some((error) => error.startsWith("fatal"))) {
    return { detected: { format: "xml", artifactKind: "xml_lote" }, ts119602: buildStandardAssessment([check("parse.xml", "parse", "fail", "critical", "XML LoTE parse failed.", parsed.errors)]) };
  }

  const document = parsed.document;
  const root = document.documentElement;
  const binding = xmlLoteBinding(root);
  const infoNode = firstNode(root, INFO);
  const metadataContext = infoNode ?? root;
  const issue = text(metadataContext, "./*[local-name()='ListIssueDateTime']");
  const nextNode = firstNode(metadataContext, "./*[local-name()='NextUpdate']");
  const next = nextNode
    ? text(nextNode, "./*[local-name()='dateTime']") ?? (nextNode.textContent?.trim() || undefined)
    : undefined;
  const metadataInput = collectXmlMetadataInput(root, metadataContext, Boolean(infoNode), assessmentDate);
  const entityInput = collectXmlEntitiesInput(root, metadataInput.historyPeriod, metadataInput.issueDateTime, assessmentDate);
  const entityAssessment = buildTs119602EntityFindings(entityInput);
  const checks: CheckResult[] = [
    check("parse.xml", "parse", parsed.errors.length === 0 ? "pass" : "warn", parsed.errors.length === 0 ? "info" : "warning", parsed.errors.length === 0 ? "XML LoTE parsed successfully." : "XML LoTE parsed with parser warnings.", parsed.errors.length ? parsed.errors : undefined),
    xmlBindingCheck(root, binding),
    check("xml_lote.structure.list_and_scheme_information", "structure", has(root, INFO) ? "pass" : "fail", has(root, INFO) ? "info" : "critical", "ListAndSchemeInformation exists."),
  ];
  const mode = inferTs119602SchemeMode(metadataInput.fields);
  for (const [id, name] of Object.entries({
    version_identifier: "LoTEVersionIdentifier", sequence_number: "LoTESequenceNumber", type: "LoTEType", scheme_operator_name: "SchemeOperatorName", scheme_operator_address: "SchemeOperatorAddress", scheme_name: "SchemeName", scheme_information_uri: "SchemeInformationURI", status_determination_approach: "StatusDeterminationApproach", scheme_type_community_rules: "SchemeTypeCommunityRules", scheme_territory: "SchemeTerritory", policy_or_legal_notice: "PolicyOrLegalNotice", list_issue_date_time: "ListIssueDateTime", next_update: "NextUpdate",
  })) {
    const present = metadataInput.fields[name as keyof typeof metadataInput.fields].present;
    const expected = ts119602Table1Presence(mode, name as keyof typeof metadataInput.fields);
    checks.push(check(
      `xml_lote.structure.${id}`,
      "structure",
      present ? "pass" : expected === "mandatory" ? "fail" : "not_applicable",
      !present && expected === "mandatory" ? "error" : "info",
      present ? `${name} exists.` : `${name} is ${expected} and absent in ${mode} scheme-information mode.`,
      { mode, expected },
    ));
  }
  const loteType = text(metadataContext, "./*[local-name()='LoTEType']");
  const signature = await assessSignature(xml, document, assessmentDate, {}, {
    requireBaselineB: true,
    requireAnnexH4: loteType === PUB_EAA_LOTE_TYPE,
    schemeTerritory: text(metadataContext, "./*[local-name()='SchemeTerritory']"),
    schemeOperatorNames: names(root, `${INFO}/*[local-name()='SchemeOperatorName']`),
  });
  checks.push(...signature.checks);
  checks.push(...buildTs119602MetadataFindings(metadataInput));
  checks.push(...buildTs119602SyntaxFindings(collectXmlSyntaxInputs(root)));
  checks.push(...dateChecks(issue, nextNode !== undefined, next, assessmentDate));
  const services = assessTrustedEntities(root);
  checks.push(...services.checks);
  checks.push(...entityAssessment.checks);
  checks.push(...buildTs119602ProfileFindings({
    binding: binding === "etsi_ts_119_602_v1_1_1" ? "scheme_explicit_xml" : "unknown",
    metadata: metadataInput,
    entities: entityInput,
    signatureChecks: signature.checks,
    profileSelectionStatus,
  }));
  checks.push(check(
    "ts119602.coverage.complete",
    "profile",
    "not_checked",
    "warning",
    "Complete ETSI TS 119 602 V1.1.1 XML schema, alternative-binding mapping, and contextual trust/dereferencing coverage is not implemented.",
    summarizeTs119602Requirements(),
  ));

  const certificates = [...signature.certificates, ...entityAssessment.certificates];
  return {
    detected: { format: "xml", artifactKind: "xml_lote" },
    ts119602: buildStandardAssessment(checks, { coverageComplete: false }),
    extracted: {
      schemeOperatorName: names(root, `${INFO}/*[local-name()='SchemeOperatorName']`),
      schemeName: names(root, `${INFO}/*[local-name()='SchemeName']`),
      schemeTerritory: text(root, `${INFO}/*[local-name()='SchemeTerritory']`),
      statusDeterminationApproach: text(root, `${INFO}/*[local-name()='StatusDeterminationApproach']`),
      listIssueDateTime: issue, nextUpdate: next,
      distributionPoints: texts(root, `${INFO}/*[local-name()='DistributionPoints']//*[local-name()='URI']`),
      trustServiceProviderCount: services.entityCount, serviceCount: services.serviceCount, certificates,
      jsonLote: { assessmentProfile: "ETSI TS 119 602 XML LoTE evidence checks (not full normative conformance)", XmlBinding: binding, LoTEVersionIdentifier: text(root, `${INFO}/*[local-name()='LoTEVersionIdentifier']`), LoTESequenceNumber: text(root, `${INFO}/*[local-name()='LoTESequenceNumber']`), LoTEType: text(root, `${INFO}/*[local-name()='LoTEType']`), TrustedEntityCount: services.entityCount, ServiceCount: services.serviceCount },
    },
  };
}

function assessTrustedEntities(root: Element): { checks: CheckResult[]; entityCount: number; serviceCount: number } {
  const entities = nodes(root, TRUSTED_ENTITIES);
  const services = nodes(root, `${TRUSTED_ENTITIES}//*[local-name()='ServiceInformation']`);
  const containerPresent = has(
    root,
    `./*[local-name()='TrustedEntitiesList' and namespace-uri()='${ETSI_TS119602_NAMESPACE}']`,
  );
  const checks: CheckResult[] = [
    check(
      "xml_lote.structure.trusted_entities_container",
      "structure",
      containerPresent ? "pass" : "not_checked",
      containerPresent ? "info" : "warning",
      containerPresent
        ? "TrustedEntitiesList container is present directly below the LoTE document root."
        : "TrustedEntitiesList container is absent; it is optional in the base XML binding.",
    ),
    check(
      "xml_lote.services.trusted_entity_count",
      "services",
      entities.length > 0 ? "pass" : "warn",
      entities.length > 0 ? "info" : "warning",
      entities.length > 0
        ? "TrustedEntity entries counted at the selected XML binding path."
        : "No TrustedEntity entries were found at the selected XML binding path.",
      entities.length,
    ),
  ];
  entities.forEach((entity, entityIndex) => {
    const prefix = `xml_lote.services.entity.${entityIndex + 1}`;
    exists(checks, entity, `${prefix}.information`, ".//*[local-name()='TrustedEntityInformation']", "TrustedEntityInformation exists.");
    exists(checks, entity, `${prefix}.name`, ".//*[local-name()='TEName']", "TEName exists.");
    exists(checks, entity, `${prefix}.address`, ".//*[local-name()='TEAddress']", "TEAddress exists.");
    const entityServices = nodes(entity, ".//*[local-name()='ServiceInformation']");
    checks.push(check(`${prefix}.service_count`, "services", entityServices.length > 0 ? "pass" : "warn", entityServices.length > 0 ? "info" : "warning", "ServiceInformation entries counted.", entityServices.length));
    entityServices.forEach((service, serviceIndex) => {
      const servicePrefix = `${prefix}.service.${serviceIndex + 1}`;
      exists(checks, service, `${servicePrefix}.type_identifier`, ".//*[local-name()='ServiceTypeIdentifier']", "ServiceTypeIdentifier exists.");
      exists(checks, service, `${servicePrefix}.service_name`, ".//*[local-name()='ServiceName']", "ServiceName exists.");
      exists(checks, service, `${servicePrefix}.digital_identity`, ".//*[local-name()='ServiceDigitalIdentity']", "ServiceDigitalIdentity exists.");
    });
  });
  return { checks, entityCount: entities.length, serviceCount: services.length };
}

function xmlLoteBinding(root: Element): XmlLoteBinding {
  if (root.namespaceURI !== ETSI_TS119602_NAMESPACE) return "unsupported";
  if (root.localName === "ListOfTrustedEntities") return "etsi_ts_119_602_v1_1_1";
  if (root.localName === "TrustedEntitiesList") return "we_build_compatibility";
  return "unsupported";
}

function xmlBindingCheck(root: Element, binding: XmlLoteBinding): CheckResult {
  const commonEvidence = {
    observedRootLocalName: root.localName || root.nodeName,
    observedRootNamespace: root.namespaceURI ?? undefined,
    expectedRootLocalName: "ListOfTrustedEntities",
    expectedRootNamespace: ETSI_TS119602_NAMESPACE,
    normativeEntityPath: "/ListOfTrustedEntities/TrustedEntitiesList/TrustedEntity",
  };
  if (binding === "etsi_ts_119_602_v1_1_1") {
    return check(
      "xml_lote.structure.xml_binding",
      "structure",
      "pass",
      "info",
      "XML root matches the ETSI TS 119 602 V1.1.1 scheme-explicit XML binding.",
      { binding, ...commonEvidence },
    );
  }
  if (binding === "we_build_compatibility") {
    return check(
      "xml_lote.structure.xml_binding",
      "structure",
      "warn",
      "warning",
      "TrustedEntitiesList is accepted as a WE BUILD compatibility root, but it is not conformant with the ETSI TS 119 602 V1.1.1 scheme-explicit XML binding.",
      {
        binding,
        ...commonEvidence,
        observedEntityPath: "/TrustedEntitiesList/TrustedEntitiesList/TrustedEntity",
        historicalVersion: "not_established",
        historicalVersionReason: "No normative ETSI version or published WE BUILD profile defining this alternative root has been identified.",
      },
    );
  }
  return check(
    "xml_lote.structure.xml_binding",
    "structure",
    "fail",
    "critical",
    "XML root does not match an implemented ETSI TS 119 602 XML binding.",
    { binding, ...commonEvidence },
  );
}

function dateChecks(issueValue: string | undefined, nextPresent: boolean, nextValue: string | undefined, assessmentDate: Date): CheckResult[] {
  const issue = parseTs119602UtcDateTime(issueValue); const closed = nextPresent && !nextValue; const next = parseTs119602UtcDateTime(nextValue);
  const checks = [check("xml_lote.dates.issue_valid", "dates", issue ? "pass" : "fail", issue ? "info" : "error", "ListIssueDateTime uses the strict TS 119 602 UTC lexical form.", issueValue), check("xml_lote.dates.next_update_valid", "dates", closed ? "not_applicable" : next ? "pass" : "fail", closed || next ? "info" : "error", closed ? "NextUpdate date-time syntax is not applicable to a closed LoTE." : "NextUpdate uses the strict TS 119 602 UTC lexical form.", nextValue)];
  checks.push(check("xml_lote.dates.next_after_issue", "dates", closed ? "not_applicable" : issue && next && next > issue ? "pass" : "fail", closed || issue && next && next > issue ? "info" : "error", closed ? "NextUpdate ordering is not applicable to a closed LoTE." : "NextUpdate is after ListIssueDateTime.", issue && next ? { issue: issue.toISOString(), nextUpdate: next.toISOString() } : undefined));
  if (issue && next) {
    const milliseconds = next.getTime() - issue.getTime();
    checks.push(check("xml_lote.dates.update_period_days", "dates", "not_checked", "info", "A maximum update interval is profile-specific and was not checked by the base metadata assessment.", { milliseconds, days: milliseconds / 86_400_000 }));
    if (assessmentDate > next) checks.push(check("xml_lote.dates.next_update_expired", "dates", "fail", "error", "XML LoTE NextUpdate is before assessment time and the LoTE is expired.", { nextUpdate: next.toISOString(), assessmentDate: assessmentDate.toISOString() }));
  } else {
    checks.push(check("xml_lote.dates.update_period_days", "dates", "not_checked", "info", "A maximum update interval is profile-specific and was not checked by the base metadata assessment."));
  }
  return checks;
}

function collectXmlMetadataInput(
  root: Element,
  context: Node,
  schemeInformationContainerPresent: boolean,
  assessmentDate: Date,
): Ts119602MetadataInput {
  const fields = Object.fromEntries(TS119602_SCHEME_FIELDS.map((field) => {
    const matches = nodes(context, `./*[local-name()='${field}' and namespace-uri()='${ETSI_TS119602_NAMESPACE}']`);
    return [field, { present: matches.length > 0, count: matches.length }];
  })) as Ts119602MetadataInput["fields"];
  const addressNode = firstNode(context, "./*[local-name()='SchemeOperatorAddress']");
  const postalNodes = addressNode ? nodes(addressNode, ".//*[local-name()='PostalAddress']") : [];
  const electronicNodes = addressNode ? nodes(addressNode, ".//*[local-name()='ElectronicAddress']/*[local-name()='URI']") : [];
  const policyNode = firstNode(context, "./*[local-name()='PolicyOrLegalNotice']");
  const policyPointers = policyNode ? nodes(policyNode, "./*[local-name()='LoTEPolicy']") : [];
  const legalNotices = policyNode ? nodes(policyNode, "./*[local-name()='LoTELegalNotice']") : [];
  const policyChildren = policyNode ? nodes(policyNode, "./*") : [];
  const pointerNodes = nodes(context, "./*[local-name()='PointersToOtherLoTE']/*[local-name()='OtherLoTEPointer']");
  const extensionNodes = nodes(context, "./*[local-name()='SchemeExtensions']/*[local-name()='Extension']");
  const nextNode = firstNode(context, "./*[local-name()='NextUpdate']");
  return {
    binding: "xml",
    schemeInformationContainerPresent,
    fields,
    loteTag: { present: root.hasAttribute("LOTETag"), value: root.getAttribute("LOTETag") || undefined },
    version: integerElementValue(context, "LoTEVersionIdentifier"),
    sequence: integerElementValue(context, "LoTESequenceNumber"),
    loteType: text(context, "./*[local-name()='LoTEType']"),
    schemeInformationUris: nodes(context, "./*[local-name()='SchemeInformationURI']/*[local-name()='URI']").map(nodeText),
    statusDeterminationApproach: text(context, "./*[local-name()='StatusDeterminationApproach']"),
    schemeTypeCommunityRules: nodes(context, "./*[local-name()='SchemeTypeCommunityRules']/*[local-name()='URI']").map(nodeText),
    schemeNames: nodes(context, "./*[local-name()='SchemeName']/*[local-name()='Name']").map((node) => ({
      language: (node as Element).getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang") || undefined,
      value: node.textContent?.trim(),
    })),
    territory: text(context, "./*[local-name()='SchemeTerritory']"),
    address: {
      present: Boolean(addressNode),
      postalAddresses: postalNodes.map((node) => ({
        path: xmlNodePath(node),
        streetPresent: has(node, "./*[local-name()='StreetAddress' and normalize-space(.) != '']"),
        countryPresent: has(node, "./*[local-name()='Country' or local-name()='CountryName'][normalize-space(.) != '']"),
      })),
      electronicUris: electronicNodes.map((node) => ({ path: xmlNodePath(node), value: node.textContent?.trim() })),
    },
    policy: {
      present: Boolean(policyNode),
      policyPointerCount: policyPointers.length,
      legalNoticeCount: legalNotices.length,
      unknownEntryCount: policyChildren.length - policyPointers.length - legalNotices.length,
    },
    historyPeriod: integerElementValue(context, "HistoricalInformationPeriod"),
    pointers: pointerNodes.map(xmlPointerObservation),
    issueDateTime: text(context, "./*[local-name()='ListIssueDateTime']"),
    nextUpdate: {
      present: Boolean(nextNode),
      value: nextNode ? text(nextNode, "./*[local-name()='dateTime']") ?? (nextNode.textContent?.trim() || null) : undefined,
    },
    serviceStatuses: texts(root, ".//*[local-name()='ServiceStatus']"),
    distributionPoints: {
      present: fields.DistributionPoints.present,
      values: nodes(context, "./*[local-name()='DistributionPoints']/*[local-name()='URI']").map((node) => node.textContent?.trim()),
    },
    extensions: {
      present: fields.SchemeExtensions.present,
      values: extensionNodes.map((node) => xmlExtensionObservation(node as Element)),
    },
    assessmentDate,
  };
}

function integerElementValue(context: Node, localName: string): unknown {
  const value = text(context, `./*[local-name()='${localName}']`);
  return value && /^-?\d+$/.test(value) ? Number(value) : value;
}

function xmlPointerObservation(node: Node, index: number): Ts119602MetadataInput["pointers"][number] {
  const qualifierNodes = nodes(node, ".//*[local-name()='LoTEQualifier']");
  const additionalInformation = firstNode(node, "./*[local-name()='AdditionalInformation']");
  const effectiveQualifiers = qualifierNodes.length > 0 ? qualifierNodes : additionalInformation ? [additionalInformation] : [];
  return {
    path: xmlNodePath(node),
    location: text(node, "./*[local-name()='LoTELocation']"),
    identityCount: nodes(node, "./*[local-name()='ServiceDigitalIdentities']/*[local-name()='ServiceDigitalIdentity']").length,
    qualifiers: effectiveQualifiers.map((qualifier, qualifierIndex) => ({
      path: `${xmlNodePath(qualifier)}#qualifier-${qualifierIndex + 1}`,
      typePresent: has(qualifier, ".//*[local-name()='LoTEType']"),
      operatorNamePresent: has(qualifier, ".//*[local-name()='SchemeOperatorName']"),
      mimeTypePresent: has(qualifier, ".//*[local-name()='MimeType']"),
    })),
  };
}

function xmlExtensionObservation(element: Element): Ts119602MetadataInput["extensions"]["values"][number] {
  const rawCritical = element.getAttribute("Critical");
  const critical = rawCritical === "true" || rawCritical === "1"
    ? true
    : rawCritical === "false" || rawCritical === "0"
      ? false
      : rawCritical || undefined;
  const content = Array.from(element.childNodes).find((node): node is Element => node.nodeType === 1);
  return {
    path: xmlNodePath(element),
    critical,
    identifier: content ? `{${content.namespaceURI ?? ""}}${content.localName}` : undefined,
    recognized: false,
  };
}

function collectXmlEntitiesInput(
  root: Element,
  historyPeriod: unknown,
  listIssueDateTime: unknown,
  assessmentDate: Date,
): Ts119602EntitiesInput {
  const container = firstNode(root, `./*[local-name()='TrustedEntitiesList' and namespace-uri()='${ETSI_TS119602_NAMESPACE}']`);
  const entityNodes = nodes(root, TRUSTED_ENTITIES);
  return {
    containerPresent: Boolean(container),
    entities: entityNodes.map((entity) => {
      const path = xmlNodePath(entity);
      const information = firstNode(entity, "./*[local-name()='TrustedEntityInformation']");
      const servicesContainer = firstNode(entity, "./*[local-name()='TrustedEntityServices']");
      const extensionContainer = information && firstNode(information, "./*[local-name()='TEInformationExtensions']");
      return {
        path,
        informationPresent: Boolean(information),
        servicesContainerPresent: Boolean(servicesContainer),
        name: information ? xmlMultilingual(information, "./*[local-name()='TEName']/*[local-name()='Name']") : [],
        tradeNamePresent: Boolean(information && firstNode(information, "./*[local-name()='TETradeName']")),
        tradeName: information ? xmlMultilingual(information, "./*[local-name()='TETradeName']/*[local-name()='Name']") : [],
        address: xmlAddress(information && firstNode(information, "./*[local-name()='TEAddress']")),
        informationUris: information ? nodes(information, "./*[local-name()='TEInformationURI']/*[local-name()='URI']").map(nodeText) : [],
        extensionsPresent: Boolean(extensionContainer),
        extensions: extensionContainer ? nodes(extensionContainer, "./*[local-name()='Extension']").map((extension) => xmlTypedExtension(extension as Element, "entity")) : [],
        services: servicesContainer ? nodes(servicesContainer, "./*[local-name()='TrustedEntityService']").map((service) => xmlService(service)) : [],
      };
    }),
    historyPeriod,
    listIssueDateTime,
    assessmentDate,
  };
}

function xmlService(node: Node): Ts119602ServiceObservation {
  const path = xmlNodePath(node);
  const information = firstNode(node, "./*[local-name()='ServiceInformation']");
  const historyContainer = firstNode(node, "./*[local-name()='ServiceHistory']");
  const extensions = information && firstNode(information, "./*[local-name()='ServiceInformationExtensions']");
  const supplyPoints = information ? nodes(information, "./*[local-name()='ServiceSupplyPoints']/*[local-name()='ServiceSupplyPoint']") : [];
  return {
    path,
    informationPresent: Boolean(information),
    name: information ? xmlMultilingual(information, "./*[local-name()='ServiceName']/*[local-name()='Name']") : [],
    identity: xmlIdentity(information && firstNode(information, "./*[local-name()='ServiceDigitalIdentity']"), `${path}/ServiceInformation/ServiceDigitalIdentity`),
    typeIdentifier: { present: Boolean(information && firstNode(information, "./*[local-name()='ServiceTypeIdentifier']")), value: information ? text(information, "./*[local-name()='ServiceTypeIdentifier']") : undefined },
    status: { present: Boolean(information && firstNode(information, "./*[local-name()='ServiceStatus']")), value: information ? text(information, "./*[local-name()='ServiceStatus']") : undefined },
    statusStartingTime: { present: Boolean(information && firstNode(information, "./*[local-name()='StatusStartingTime']")), value: information ? text(information, "./*[local-name()='StatusStartingTime']") : undefined },
    schemeDefinitionPresent: Boolean(information && firstNode(information, "./*[local-name()='SchemeServiceDefinitionURI']")),
    schemeDefinitionUris: information ? nodes(information, "./*[local-name()='SchemeServiceDefinitionURI']/*[local-name()='URI']").map(nodeText) : [],
    supplyPointsPresent: Boolean(information && firstNode(information, "./*[local-name()='ServiceSupplyPoints']")),
    supplyPoints: supplyPoints.map((point) => ({ path: xmlNodePath(point), uri: nodeText(point), type: (point as Element).getAttribute("type") || undefined })),
    teDefinitionPresent: Boolean(information && firstNode(information, "./*[local-name()='TEServiceDefinitionURI' or local-name()='ServiceDefinitionURI']")),
    teDefinitionUris: information ? nodes(information, "./*[local-name()='TEServiceDefinitionURI' or local-name()='ServiceDefinitionURI']/*[local-name()='URI']").map(nodeText) : [],
    extensionsPresent: Boolean(extensions),
    extensions: extensions ? nodes(extensions, "./*[local-name()='Extension']").map((extension) => xmlTypedExtension(extension as Element, "service")) : [],
    historyPresent: Boolean(historyContainer),
    history: historyContainer ? nodes(historyContainer, "./*[local-name()='ServiceHistoryInstance']").map((entry) => {
      const entryPath = xmlNodePath(entry);
      const entryExtensions = firstNode(entry, "./*[local-name()='ServiceInformationExtensions']");
      return {
        path: entryPath,
        name: xmlMultilingual(entry, "./*[local-name()='ServiceName']/*[local-name()='Name']"),
        identity: xmlIdentity(firstNode(entry, "./*[local-name()='ServiceDigitalIdentity']"), `${entryPath}/ServiceDigitalIdentity`),
        status: { present: Boolean(firstNode(entry, "./*[local-name()='ServiceStatus']")), value: text(entry, "./*[local-name()='ServiceStatus']") },
        statusStartingTime: { present: Boolean(firstNode(entry, "./*[local-name()='StatusStartingTime']")), value: text(entry, "./*[local-name()='StatusStartingTime']") },
        typeIdentifier: text(entry, "./*[local-name()='ServiceTypeIdentifier']"),
        extensions: entryExtensions ? nodes(entryExtensions, "./*[local-name()='Extension']").map((extension) => xmlTypedExtension(extension as Element, "service")) : [],
      };
    }) : [],
  };
}

function xmlIdentity(node: Node | undefined, fallbackPath: string): Ts119602IdentityObservation {
  const path = node ? xmlNodePath(node) : fallbackPath;
  const digitalIds = node ? nodes(node, "./*[local-name()='DigitalId']") : [];
  function alternatives(localName: string): Array<{ path: string; value: unknown }> {
    return digitalIds.flatMap((digitalId) => nodes(digitalId, `./*[local-name()='${localName}']`).map((entry) => ({
      path: xmlNodePath(entry),
      value: localName === "KeyValue"
        ? { xmlElement: entry.nodeName }
        : ["X509Certificate", "X509SKI"].includes(localName)
          ? nodeText(entry).replace(/\s+/g, "")
          : nodeText(entry),
    })));
  }
  return {
    path,
    present: Boolean(node),
    certificates: alternatives("X509Certificate"),
    subjectNames: alternatives("X509SubjectName"),
    publicKeys: alternatives("KeyValue"),
    skis: alternatives("X509SKI"),
    otherIds: alternatives("OtherId"),
  };
}

function xmlAddress(node: Node | undefined): Ts119602EntitiesInput["entities"][number]["address"] {
  const postal = node ? nodes(node, ".//*[local-name()='PostalAddress']") : [];
  const electronic = node ? nodes(node, ".//*[local-name()='ElectronicAddress']/*[local-name()='URI']") : [];
  return {
    present: Boolean(node),
    postalAddresses: postal.map((entry) => ({ path: xmlNodePath(entry), streetPresent: has(entry, "./*[local-name()='StreetAddress' and normalize-space(.) != '']"), countryPresent: has(entry, "./*[local-name()='Country' or local-name()='CountryName'][normalize-space(.) != '']") })),
    electronicUris: electronic.map((entry) => ({ path: xmlNodePath(entry), value: nodeText(entry) })),
  };
}

function xmlMultilingual(context: Node, expression: string): Array<{ language: unknown; value: unknown }> {
  return nodes(context, expression).map((entry) => ({ language: (entry as Element).getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang") || undefined, value: nodeText(entry) }));
}

function xmlTypedExtension(element: Element, kind: "entity" | "service"): Ts119602ServiceExtensionObservation {
  const base = xmlExtensionObservation(element);
  const content = Array.from(element.childNodes).find((node): node is Element => node.nodeType === 1);
  const registry = kind === "entity" ? TS119602_ENTITY_EXTENSION_REGISTRY : TS119602_SERVICE_EXTENSION_REGISTRY;
  const identifier = content ? `{${content.namespaceURI ?? ""}}${content.localName}` : base.identifier;
  const recognized = Boolean(identifier && registry.recognizedIdentifiers.some((candidate) => candidate === identifier));
  const payloadValid = content?.localName === "ServiceUniqueIdentifier"
    ? /^[A-Za-z][A-Za-z0-9+.-]*:/.test(nodeText(content))
    : content?.localName === "OtherAssociatedBodies"
      ? validXmlAssociatedBodies(content)
      : true;
  return { ...base, identifier, recognized, payloadValid, payloadEvidence: content ? nodeText(content) : undefined };
}

function validXmlAssociatedBodies(content: Element): boolean {
  const bodies = nodes(content, "./*[local-name()='AssociatedBody']");
  return bodies.length > 0 && bodies.every((body) => {
    if (!has(body, "./*[local-name()='AssociatedBodyName']/*[local-name()='Name' and normalize-space(.) != '']")) return false;
    const address = firstNode(body, "./*[local-name()='AssociatedBodyAddress']");
    if (address) {
      const observed = xmlAddress(address);
      const schemes = observed.electronicUris.map((entry) => validateTs119602Uri(entry.value).classification);
      if (observed.postalAddresses.length === 0 || observed.postalAddresses.some((entry) => !entry.streetPresent || !entry.countryPresent) || !schemes.includes("mailto") || (!schemes.includes("http") && !schemes.includes("https"))) return false;
    }
    const information = firstNode(body, "./*[local-name()='AssociatedBodyInformationURI']");
    if (information) {
      const uris = nodes(information, "./*[local-name()='URI']").map(nodeText);
      if (uris.length === 0 || uris.some((uri) => validateTs119602Uri(uri).outcome !== "valid")) return false;
    }
    const type = text(body, "./*[local-name()='AssociatedBodyTypeIdentifier']");
    return !type || validateTs119602Uri(type).outcome === "valid";
  });
}

function nodeText(node: Node): string { return node.textContent?.trim() ?? ""; }

const XML_URI_ELEMENTS = new Set([
  "LoTEType",
  "StatusDeterminationApproach",
  "LoTELocation",
  "URI",
  "ServiceTypeIdentifier",
  "ServiceStatus",
  "ServiceSupplyPoint",
  "ServiceUniqueIdentifier",
  "AssociatedBodyTypeIdentifier",
]);
const XML_DATE_TIME_ELEMENTS = new Set(["ListIssueDateTime", "dateTime", "StatusStartingTime"]);
const XML_COUNTRY_ELEMENTS = new Set(["Country", "CountryName", "SchemeTerritory"]);
const XML_MULTILINGUAL_ELEMENTS = new Set(["Name", "PostalAddress", "URI", "LoTEPolicy", "LoTELegalNotice", "TextualInformation"]);
const XML_MULTILINGUAL_URI_PARENTS = new Set([
  "ElectronicAddress",
  "SchemeInformationURI",
  "SchemeTypeCommunityRules",
  "TEInformationURI",
  "SchemeServiceDefinitionURI",
  "TEServiceDefinitionURI",
  "AssociatedBodyInformationURI",
]);

function collectXmlSyntaxInputs(root: Element): {
  uris: LocatedSyntaxValue[];
  dateTimes: LocatedSyntaxValue[];
  countries: LocatedSyntaxValue[];
  multilingual: LocatedMultilingualSet[];
} {
  const descendants = nodes(root, ".//*").filter((node): node is Element => node.nodeType === 1);
  const uriByPath = new Map<string, LocatedSyntaxValue>();
  const dateTimes: LocatedSyntaxValue[] = [];
  const countries: LocatedSyntaxValue[] = [];
  const multilingualGroups = new Map<Node, LocatedMultilingualSet>();

  if (root.hasAttribute("LOTETag")) {
    uriByPath.set(`${xmlNodePath(root)}/@LOTETag`, { path: `${xmlNodePath(root)}/@LOTETag`, value: root.getAttribute("LOTETag") });
  }
  for (const element of descendants) {
    const path = xmlNodePath(element);
    if (XML_URI_ELEMENTS.has(element.localName)) {
      uriByPath.set(path, { path, value: element.textContent?.trim() ?? "" });
    }
    if (element.localName === "ServiceSupplyPoint" && element.hasAttribute("type")) {
      uriByPath.set(`${path}/@type`, { path: `${path}/@type`, value: element.getAttribute("type") });
    }
    if (XML_DATE_TIME_ELEMENTS.has(element.localName)) {
      dateTimes.push({ path, value: element.textContent?.trim() ?? "" });
    }
    if (XML_COUNTRY_ELEMENTS.has(element.localName)) {
      countries.push({ path, value: element.textContent?.trim() ?? "" });
    }
    if (isXmlMultilingualElement(element)) {
      const parent = element.parentNode;
      if (!parent) continue;
      const group = multilingualGroups.get(parent) ?? { path: xmlNodePath(parent), values: [] };
      group.values.push({
        language: element.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang") || undefined,
        value: xmlMultilingualContent(element),
      });
      multilingualGroups.set(parent, group);
    }
  }
  return {
    uris: [...uriByPath.values()],
    dateTimes,
    countries,
    multilingual: [...multilingualGroups.values()],
  };
}

function isXmlMultilingualElement(element: Element): boolean {
  if (!XML_MULTILINGUAL_ELEMENTS.has(element.localName)) return false;
  if (element.localName !== "URI") return true;
  const parent = element.parentNode;
  return XML_MULTILINGUAL_URI_PARENTS.has(parent?.nodeType === 1 ? (parent as Element).localName : "");
}

function xmlMultilingualContent(element: Element): string {
  if (element.localName !== "PostalAddress") return element.textContent?.trim() ?? "";
  return Array.from(element.childNodes)
    .filter((child): child is Element => child.nodeType === 1)
    .map((child) => child.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function xmlNodePath(node: Node): string {
  const segments: string[] = [];
  let current: Node | null = node;
  while (current?.nodeType === 1) {
    const element = current as Element;
    let position = 1;
    let sibling = element.previousSibling;
    while (sibling) {
      if (sibling.nodeType === 1 && (sibling as Element).localName === element.localName) position += 1;
      sibling = sibling.previousSibling;
    }
    segments.unshift(`${element.localName}[${position}]`);
    current = element.parentNode;
  }
  return `/${segments.join("/")}`;
}

function names(context: Node, expression: string): string[] { const named = texts(context, `${expression}/*[local-name()='Name']`); return named.length > 0 ? named : texts(context, expression); }
function exists(checks: CheckResult[], context: Node, id: string, expression: string, message: string): void { const present = has(context, expression); checks.push(check(id, "structure", present ? "pass" : "fail", present ? "info" : "error", message)); }
function check(id: string, category: CheckResult["category"], status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult { return { id, category, status, severity, message, evidence }; }
