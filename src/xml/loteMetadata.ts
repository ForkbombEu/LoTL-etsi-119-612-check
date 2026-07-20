import { tryCertificateFromBase64 } from "../certs.js";
import type { CertificateSummary, CheckResult, TrustedListAuditResult } from "../types.js";
import { assessSignature } from "./signature.js";
import { parseXml } from "./parse.js";
import { has, nodes, text, texts } from "./xpath.js";

const XML_LOTE_REASON =
  "Artifact is an ETSI TS 119 602 XML Trusted Entities List (LoTE), not an ETSI TS 119 612 XML Trusted List.";
const INFO = "/*[local-name()='TrustedEntitiesList']/*[local-name()='ListAndSchemeInformation']";

/** Assess the implemented ETSI TS 119 602 XML LoTE data-model evidence. */
export async function assessXmlLoteMetadata(xml: string): Promise<Pick<TrustedListAuditResult, "ts119612" | "extracted" | "detected">> {
  const parsed = parseXml(xml);
  if (!parsed.document || parsed.errors.some((error) => error.startsWith("fatal"))) {
    return { detected: { format: "xml", artifactKind: "xml_lote" }, ts119612: notApplicable([check("parse.xml", "parse", "fail", "critical", "XML LoTE parse failed.", parsed.errors)]) };
  }

  const document = parsed.document;
  const root = document.documentElement;
  const issue = text(document, `${INFO}/*[local-name()='ListIssueDateTime']`);
  const next = text(document, `${INFO}/*[local-name()='NextUpdate']/*[local-name()='dateTime'] | ${INFO}/*[local-name()='NextUpdate']`);
  const checks: CheckResult[] = [
    check("parse.xml", "parse", parsed.errors.length === 0 ? "pass" : "warn", parsed.errors.length === 0 ? "info" : "warning", parsed.errors.length === 0 ? "XML LoTE parsed successfully." : "XML LoTE parsed with parser warnings.", parsed.errors.length ? parsed.errors : undefined),
    check("profile.ts119612_applicability", "profile", "not_applicable", "info", XML_LOTE_REASON, { rootLocalName: root.localName || root.nodeName, rootNamespace: root.namespaceURI ?? undefined }),
    check("xml_lote.structure.list_and_scheme_information", "structure", has(document, INFO) ? "pass" : "fail", has(document, INFO) ? "info" : "critical", "ListAndSchemeInformation exists."),
  ];
  for (const [id, name] of Object.entries({
    version_identifier: "LoTEVersionIdentifier", sequence_number: "LoTESequenceNumber", type: "LoTEType", scheme_operator_name: "SchemeOperatorName", scheme_operator_address: "SchemeOperatorAddress", scheme_name: "SchemeName", scheme_information_uri: "SchemeInformationURI", status_determination_approach: "StatusDeterminationApproach", scheme_type_community_rules: "SchemeTypeCommunityRules", scheme_territory: "SchemeTerritory", policy_or_legal_notice: "PolicyOrLegalNotice", list_issue_date_time: "ListIssueDateTime", next_update: "NextUpdate",
  })) {
    exists(checks, document, `xml_lote.structure.${id}`, `${INFO}/*[local-name()='${name}']`, `${name} exists.`);
  }
  const signature = await assessSignature(xml, document);
  checks.push(...signature.checks);
  checks.push(...dateChecks(issue, next));
  const services = assessTrustedEntities(document);
  checks.push(...services.checks);

  const certificates = [...signature.certificates, ...services.certificates];
  return {
    detected: { format: "xml", artifactKind: "xml_lote" },
    ts119612: notApplicable(checks),
    extracted: {
      schemeOperatorName: names(document, `${INFO}/*[local-name()='SchemeOperatorName']`),
      schemeName: names(document, `${INFO}/*[local-name()='SchemeName']`),
      schemeTerritory: text(document, `${INFO}/*[local-name()='SchemeTerritory']`),
      statusDeterminationApproach: text(document, `${INFO}/*[local-name()='StatusDeterminationApproach']`),
      listIssueDateTime: issue, nextUpdate: next,
      distributionPoints: texts(document, `${INFO}/*[local-name()='DistributionPoints']//*[local-name()='URI']`),
      trustServiceProviderCount: services.entityCount, serviceCount: services.serviceCount, certificates,
      jsonLote: { assessmentProfile: "ETSI TS 119 602 XML LoTE evidence checks (not full normative conformance)", LoTEVersionIdentifier: text(document, `${INFO}/*[local-name()='LoTEVersionIdentifier']`), LoTESequenceNumber: text(document, `${INFO}/*[local-name()='LoTESequenceNumber']`), LoTEType: text(document, `${INFO}/*[local-name()='LoTEType']`), TrustedEntityCount: services.entityCount, ServiceCount: services.serviceCount },
    },
  };
}

function assessTrustedEntities(document: Document): { checks: CheckResult[]; certificates: CertificateSummary[]; entityCount: number; serviceCount: number } {
  const entities = nodes(document, "/*[local-name()='TrustedEntitiesList']/*[local-name()='TrustedEntity']");
  const services = nodes(document, "/*[local-name()='TrustedEntitiesList']/*[local-name()='TrustedEntity']//*[local-name()='ServiceInformation']");
  const checks: CheckResult[] = [check("xml_lote.services.trusted_entity_count", "services", entities.length > 0 ? "pass" : "warn", entities.length > 0 ? "info" : "warning", "TrustedEntity entries counted.", entities.length)];
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
  texts(document, "//*[local-name()='ServiceDigitalIdentity']//*[local-name()='X509Certificate']").forEach((value, index) => {
    const certificate = tryCertificateFromBase64(value, "service_digital_identity", new Date());
    if (!certificate) checks.push(check(`xml_lote.certificates.service.${index + 1}.parse`, "certificates", "fail", "error", "Service digital identity X.509 certificate could not be parsed."));
    else { certificates.push(certificate); checks.push(check(`xml_lote.certificates.service.${index + 1}.parse`, "certificates", "pass", "info", "Service digital identity X.509 certificate parsed.", { subject: certificate.subject, fingerprintSha256: certificate.fingerprintSha256 })); }
  });
  return { checks, certificates, entityCount: entities.length, serviceCount: services.length };
}

function dateChecks(issueValue: string | undefined, nextValue: string | undefined): CheckResult[] {
  const issue = parseDate(issueValue); const next = parseDate(nextValue);
  const checks = [check("xml_lote.dates.issue_valid", "dates", issue ? "pass" : "fail", issue ? "info" : "error", "ListIssueDateTime is a valid ISO timestamp.", issueValue), check("xml_lote.dates.next_update_valid", "dates", next ? "pass" : "fail", next ? "info" : "error", "NextUpdate is a valid ISO timestamp.", nextValue)];
  checks.push(check("xml_lote.dates.next_after_issue", "dates", issue && next && next > issue ? "pass" : "fail", issue && next && next > issue ? "info" : "error", "NextUpdate is after ListIssueDateTime.", issue && next ? { issue: issue.toISOString(), nextUpdate: next.toISOString() } : undefined));
  if (issue && next) checks.push(check("xml_lote.dates.update_period_days", "dates", Math.round((next.getTime() - issue.getTime()) / 86_400_000) <= 183 ? "pass" : "warn", "warning", "Update period is not longer than six months.", Math.round((next.getTime() - issue.getTime()) / 86_400_000)));
  return checks;
}

function parseDate(value: string | undefined): Date | undefined { if (!value) return undefined; const date = new Date(value); return Number.isNaN(date.getTime()) ? undefined : date; }
function names(document: Document, expression: string): string[] { const named = texts(document, `${expression}/*[local-name()='Name']`); return named.length > 0 ? named : texts(document, expression); }
function exists(checks: CheckResult[], context: Node, id: string, expression: string, message: string): void { const present = has(context, expression); checks.push(check(id, "structure", present ? "pass" : "fail", present ? "info" : "error", message)); }
function notApplicable(checks: CheckResult[]): TrustedListAuditResult["ts119612"] { return { applicable: false, conformanceLevel: "not_applicable", score: null, checks, mandatoryFailures: [], warnings: checks.filter((entry) => entry.status === "warn" || entry.status === "not_checked").map((entry) => `${entry.id}: ${entry.message}`) }; }
function check(id: string, category: CheckResult["category"], status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult { return { id, category, status, severity, message, evidence }; }
