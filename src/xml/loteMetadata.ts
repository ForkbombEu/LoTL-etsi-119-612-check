import type { CheckResult, TrustedListAuditResult } from "../types.js";
import { parseXml } from "./parse.js";
import { text, texts } from "./xpath.js";

const XML_LOTE_REASON =
  "Artifact is an ETSI TS 119 602 XML Trusted Entities List (LoTE), not an ETSI TS 119 612 XML Trusted List.";

/** Extract common metadata from an ETSI TS 119 602 XML TrustedEntitiesList. */
export function assessXmlLoteMetadata(xml: string): Pick<TrustedListAuditResult, "ts119612" | "extracted" | "detected"> {
  const parsed = parseXml(xml);
  if (!parsed.document || parsed.errors.some((error) => error.startsWith("fatal"))) {
    return {
      detected: { format: "xml", artifactKind: "xml_lote" },
      ts119612: notApplicable([check("parse.xml", "fail", "critical", "XML LoTE parse failed.", parsed.errors)]),
    };
  }

  const document = parsed.document;
  const root = document.documentElement;
  const info = "/*[local-name()='TrustedEntitiesList']/*[local-name()='ListAndSchemeInformation']";
  const checks = [
    check("parse.xml", parsed.errors.length === 0 ? "pass" : "warn", parsed.errors.length === 0 ? "info" : "warning", parsed.errors.length === 0 ? "XML LoTE parsed successfully." : "XML LoTE parsed with parser warnings.", parsed.errors.length ? parsed.errors : undefined),
    check("profile.ts119612_applicability", "not_applicable", "info", XML_LOTE_REASON, { rootLocalName: root.localName || root.nodeName, rootNamespace: root.namespaceURI ?? undefined }),
  ];

  return {
    detected: { format: "xml", artifactKind: "xml_lote" },
    ts119612: notApplicable(checks),
    extracted: {
      schemeOperatorName: names(document, `${info}/*[local-name()='SchemeOperatorName']`),
      schemeName: names(document, `${info}/*[local-name()='SchemeName']`),
      schemeTerritory: text(document, `${info}/*[local-name()='SchemeTerritory']`),
      statusDeterminationApproach: text(document, `${info}/*[local-name()='StatusDeterminationApproach']`),
      listIssueDateTime: text(document, `${info}/*[local-name()='ListIssueDateTime']`),
      nextUpdate: text(document, `${info}/*[local-name()='NextUpdate']/*[local-name()='dateTime'] | ${info}/*[local-name()='NextUpdate']`),
      distributionPoints: texts(document, `${info}/*[local-name()='DistributionPoints']//*[local-name()='URI']`),
      jsonLote: {
        assessmentProfile: "TS 119 602 XML LoTE metadata extraction (not full normative conformance)",
        LoTEVersionIdentifier: text(document, `${info}/*[local-name()='LoTEVersionIdentifier']`),
        LoTESequenceNumber: text(document, `${info}/*[local-name()='LoTESequenceNumber']`),
        LoTEType: text(document, `${info}/*[local-name()='LoTEType']`),
      },
    },
  };
}

function names(document: Document, expression: string): string[] {
  const named = texts(document, `${expression}/*[local-name()='Name']`);
  return named.length > 0 ? named : texts(document, expression);
}

function notApplicable(checks: CheckResult[]): TrustedListAuditResult["ts119612"] {
  return {
    applicable: false, conformanceLevel: "not_applicable", score: null, checks, mandatoryFailures: [],
    warnings: checks.filter((check) => check.status === "warn" || check.status === "not_checked").map((check) => `${check.id}: ${check.message}`),
  };
}

function check(id: string, status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult {
  return { id, category: id === "parse.xml" ? "parse" : "profile", status, severity, message, evidence };
}
