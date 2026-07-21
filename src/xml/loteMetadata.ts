import { tryCertificateFromBase64 } from "../certs.js";
import { buildStandardAssessment } from "../standards/assessment.js";
import type { CertificateSummary, CheckResult, TrustedListAuditResult } from "../types.js";
import { assessSignature } from "./signature.js";
import { parseXml } from "./parse.js";
import { has, nodes, text, texts } from "./xpath.js";

const ETSI_TS119602_NAMESPACE = "http://uri.etsi.org/019602/v1#";
const INFO = `./*[local-name()='ListAndSchemeInformation' and namespace-uri()='${ETSI_TS119602_NAMESPACE}']`;
const TRUSTED_ENTITIES =
  `./*[local-name()='TrustedEntitiesList' and namespace-uri()='${ETSI_TS119602_NAMESPACE}']`
  + `/*[local-name()='TrustedEntity' and namespace-uri()='${ETSI_TS119602_NAMESPACE}']`;

type XmlLoteBinding = "etsi_ts_119_602_v1_1_1" | "we_build_compatibility" | "unsupported";

/** Assess the implemented ETSI TS 119 602 XML LoTE data-model evidence. */
export async function assessXmlLoteMetadata(xml: string): Promise<Pick<TrustedListAuditResult, "ts119602" | "extracted" | "detected">> {
  const parsed = parseXml(xml);
  if (!parsed.document || parsed.errors.some((error) => error.startsWith("fatal"))) {
    return { detected: { format: "xml", artifactKind: "xml_lote" }, ts119602: buildStandardAssessment([check("parse.xml", "parse", "fail", "critical", "XML LoTE parse failed.", parsed.errors)]) };
  }

  const document = parsed.document;
  const root = document.documentElement;
  const binding = xmlLoteBinding(root);
  const issue = text(root, `${INFO}/*[local-name()='ListIssueDateTime']`);
  const next = text(root, `${INFO}/*[local-name()='NextUpdate']/*[local-name()='dateTime'] | ${INFO}/*[local-name()='NextUpdate']`);
  const checks: CheckResult[] = [
    check("parse.xml", "parse", parsed.errors.length === 0 ? "pass" : "warn", parsed.errors.length === 0 ? "info" : "warning", parsed.errors.length === 0 ? "XML LoTE parsed successfully." : "XML LoTE parsed with parser warnings.", parsed.errors.length ? parsed.errors : undefined),
    xmlBindingCheck(root, binding),
    check("xml_lote.structure.list_and_scheme_information", "structure", has(root, INFO) ? "pass" : "fail", has(root, INFO) ? "info" : "critical", "ListAndSchemeInformation exists."),
  ];
  for (const [id, name] of Object.entries({
    version_identifier: "LoTEVersionIdentifier", sequence_number: "LoTESequenceNumber", type: "LoTEType", scheme_operator_name: "SchemeOperatorName", scheme_operator_address: "SchemeOperatorAddress", scheme_name: "SchemeName", scheme_information_uri: "SchemeInformationURI", status_determination_approach: "StatusDeterminationApproach", scheme_type_community_rules: "SchemeTypeCommunityRules", scheme_territory: "SchemeTerritory", policy_or_legal_notice: "PolicyOrLegalNotice", list_issue_date_time: "ListIssueDateTime", next_update: "NextUpdate",
  })) {
    exists(checks, root, `xml_lote.structure.${id}`, `${INFO}/*[local-name()='${name}']`, `${name} exists.`);
  }
  const signature = await assessSignature(xml, document);
  checks.push(...signature.checks);
  checks.push(...dateChecks(issue, next));
  const services = assessTrustedEntities(root);
  checks.push(...services.checks);
  checks.push(check(
    "ts119602.coverage.complete",
    "profile",
    "not_checked",
    "warning",
    "Complete ETSI TS 119 602 V1.1.1 schema, semantic, signature, and Annex D-I profile coverage is not implemented.",
  ));

  const certificates = [...signature.certificates, ...services.certificates];
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

function assessTrustedEntities(root: Element): { checks: CheckResult[]; certificates: CertificateSummary[]; entityCount: number; serviceCount: number } {
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
  const certificates: CertificateSummary[] = [];
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
  texts(root, ".//*[local-name()='ServiceDigitalIdentity']//*[local-name()='X509Certificate']").forEach((value, index) => {
    const certificate = tryCertificateFromBase64(value, "service_digital_identity", new Date());
    if (!certificate) checks.push(check(`xml_lote.certificates.service.${index + 1}.parse`, "certificates", "fail", "error", "Service digital identity X.509 certificate could not be parsed."));
    else { certificates.push(certificate); checks.push(check(`xml_lote.certificates.service.${index + 1}.parse`, "certificates", "pass", "info", "Service digital identity X.509 certificate parsed.", { subject: certificate.subject, fingerprintSha256: certificate.fingerprintSha256 })); }
  });
  return { checks, certificates, entityCount: entities.length, serviceCount: services.length };
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

function dateChecks(issueValue: string | undefined, nextValue: string | undefined): CheckResult[] {
  const issue = parseDate(issueValue); const next = parseDate(nextValue);
  const checks = [check("xml_lote.dates.issue_valid", "dates", issue ? "pass" : "fail", issue ? "info" : "error", "ListIssueDateTime is a valid ISO timestamp.", issueValue), check("xml_lote.dates.next_update_valid", "dates", next ? "pass" : "fail", next ? "info" : "error", "NextUpdate is a valid ISO timestamp.", nextValue)];
  checks.push(check("xml_lote.dates.next_after_issue", "dates", issue && next && next > issue ? "pass" : "fail", issue && next && next > issue ? "info" : "error", "NextUpdate is after ListIssueDateTime.", issue && next ? { issue: issue.toISOString(), nextUpdate: next.toISOString() } : undefined));
  if (issue && next) checks.push(check("xml_lote.dates.update_period_days", "dates", Math.round((next.getTime() - issue.getTime()) / 86_400_000) <= 183 ? "pass" : "warn", "warning", "Update period is not longer than six months.", Math.round((next.getTime() - issue.getTime()) / 86_400_000)));
  return checks;
}

function parseDate(value: string | undefined): Date | undefined { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date; }
function names(context: Node, expression: string): string[] { const named = texts(context, `${expression}/*[local-name()='Name']`); return named.length > 0 ? named : texts(context, expression); }
function exists(checks: CheckResult[], context: Node, id: string, expression: string, message: string): void { const present = has(context, expression); checks.push(check(id, "structure", present ? "pass" : "fail", present ? "info" : "error", message)); }
function check(id: string, category: CheckResult["category"], status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult { return { id, category, status, severity, message, evidence }; }
