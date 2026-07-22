import type { CertificateSummary, CheckResult, ConformanceLevel, TrustedListAuditResult } from "../types.js";
import { tryCertificateFromBase64 } from "../certs.js";
import {
  summarizeTs119612Requirements,
  TS119612_COMPATIBILITY_INPUTS,
  TS119612_SOURCE,
} from "../standards/ts119612Requirements.js";
import { parseXml } from "./parse.js";
import { assessSignature } from "./signature.js";
import { validateTs119612XmlSchema } from "./ts119612Xsd.js";
import type { XsdValidationDependencies } from "./xsd.js";
import { D, L, has, nodes, text, texts } from "./xpath.js";

export interface XmlAssessmentOptions {
  strict: boolean;
  xsdPath?: string;
  xsdDependencies?: XsdValidationDependencies;
  assessmentDate?: Date;
}

type ExtractedMetadata = NonNullable<TrustedListAuditResult["extracted"]>;

const CANONICAL_ETSI_NS = "http://uri.etsi.org/02231/v2#";
const EUDI_RI_ETSI_NS_VARIANT = "http://uri.etsi.org/19612/v2.4.1#";
const EU_APPROPRIATE = "http://uri.etsi.org/TrstSvc/TrustedList/StatusDetn/EUappropriate";

export async function assessTs119612Xml(
  xml: string,
  options: XmlAssessmentOptions,
): Promise<Pick<TrustedListAuditResult, "ts119612" | "extracted" | "detected">> {
  const assessmentDate = options.assessmentDate ?? new Date();
  const checks: CheckResult[] = [];
  const certificates: CertificateSummary[] = [];
  const parsed = parseXml(xml);
  if (!parsed.document || parsed.errors.some((e) => e.startsWith("fatal"))) {
    return {
      detected: { format: "xml", artifactKind: "unknown" },
      ts119612: {
        applicable: true,
        conformanceLevel: "parse_failed",
        score: 0,
        checks: [
          {
            id: "parse.xml",
            category: "parse",
            status: "fail",
            severity: "critical",
            message: "XML parse failed.",
            evidence: parsed.errors,
          },
        ],
        mandatoryFailures: ["XML parse failed."],
        warnings: [],
      },
    };
  }

  const document = parsed.document;
  const root = document.documentElement;
  const rootLocalName = root.localName || root.nodeName;
  const rootNs = root.namespaceURI ?? undefined;
  push(checks, "parse.xml", "parse", parsed.errors.length === 0 ? "pass" : "warn", parsed.errors.length === 0 ? "info" : "warning", parsed.errors.length === 0 ? "XML parsed successfully." : "XML parsed with parser warnings.", parsed.errors.length ? parsed.errors : undefined);
  push(checks, "parse.root_name", "parse", rootLocalName === "TrustServiceStatusList" ? "pass" : "fail", "critical", "Root element local name is TrustServiceStatusList.", rootLocalName);
  const namespaceStatus = rootNs === CANONICAL_ETSI_NS ? "pass" : rootNs === EUDI_RI_ETSI_NS_VARIANT ? "warn" : "fail";
  push(
    checks,
    "parse.root_namespace",
    "parse",
    namespaceStatus,
    namespaceStatus === "pass" ? "info" : namespaceStatus === "warn" ? "warning" : "error",
    namespaceStatus === "pass"
      ? "Root namespace matches the canonical ETSI TS 119 612 namespace."
      : namespaceStatus === "warn"
        ? "Root namespace is the observed EUDI RI/profile TS 119 612 variant; use an XSD whose target namespace matches this artifact."
        : "Root namespace does not identify a supported ETSI TS 119 612 namespace.",
    rootNs,
  );
  push(checks, "parse.root_id", "parse", root.hasAttribute("Id") ? "pass" : "fail", "error", "Root TrustServiceStatusList has Id attribute.", root.getAttribute("Id") ?? undefined);
  if (rootLocalName !== "TrustServiceStatusList" || !isTs119612Namespace(rootNs)) {
    return {
      detected: { format: "xml", artifactKind: rootLocalName === "TrustServiceStatusList" ? "xml_lotl_like" : "unknown" },
      ts119612: {
        applicable: false,
        conformanceLevel: "not_applicable",
        score: null,
        checks: [...checks, {
            id: "profile.ts119612_applicability",
            category: "profile",
            status: "not_applicable",
            severity: "info",
            message: "XML root element and namespace do not identify an ETSI TS 119 612 TrustServiceStatusList artifact.",
            evidence: { rootLocalName, rootNamespace: rootNs },
          }],
        mandatoryFailures: [],
        warnings: [],
      },
    };
  }
  const artifactKind = isLotlTslType(text(document, D("TSLType"))) ? "ts119612_xml_lotl" : "ts119612_xml_tsl";
  const extracted = extractMetadata(document);

  push(checks, "parse.schema_location", "parse", hasSchemaLocation(root) ? "pass" : "warn", "warning", "xsi:schemaLocation is present.", schemaLocation(root));

  const signature = await assessSignature(xml, document, assessmentDate, {}, {
    requireFirstListCertificateMatch: isLotlOrLoteType(text(document, D("TSLType"))),
  });
  checks.push(...signature.checks);
  certificates.push(...signature.certificates);
  checks.push(await validateTs119612XmlSchema(xml, {
    namespace: rootNs,
    tslVersionIdentifier: extracted.tslVersionIdentifier,
    xsdOverridePath: options.xsdPath,
  }, options.xsdDependencies));

  const scheme = text(document, `/*[local-name()='TrustServiceStatusList']/${L("SchemeInformation")}`);
  push(checks, "structure.scheme_information", "structure", scheme ? "pass" : "fail", "critical", "SchemeInformation element exists.");

  checks.push(bindingSelectionCheck(rootNs, extracted.tslVersionIdentifier));
  checkExists(checks, document, "structure.tsl_version_identifier", D("TSLVersionIdentifier"), "TSLVersionIdentifier exists.", "error");
  if (extracted.tslVersionIdentifier) {
    push(checks, "structure.tsl_version_identifier.value", "structure", extracted.tslVersionIdentifier === "6" ? "pass" : "warn", "warning", "TSLVersionIdentifier expected value is 6 for ETSI TS 119 612 v2.4.1 / TLv6.", extracted.tslVersionIdentifier);
  }
  checkExists(checks, document, "structure.tsl_sequence_number", D("TSLSequenceNumber"), "TSLSequenceNumber exists.", "error");
  checkExists(checks, document, "structure.tsl_type", D("TSLType"), "TSLType exists.", "error");
  checkExists(checks, document, "structure.scheme_operator_name", D("SchemeOperatorName"), "SchemeOperatorName exists.", "error");
  checkExists(checks, document, "structure.scheme_operator_address", D("SchemeOperatorAddress"), "SchemeOperatorAddress exists.", "error");
  checkExists(checks, document, "structure.scheme_name", D("SchemeName"), "SchemeName exists.", "error");
  checkExists(checks, document, "structure.scheme_information_uri", D("SchemeInformationURI"), "SchemeInformationURI exists.", "error");
  checkExists(checks, document, "structure.status_determination_approach", D("StatusDeterminationApproach"), "StatusDeterminationApproach exists.", "error");
  if (extracted.statusDeterminationApproach) {
    push(checks, "structure.status_determination_approach.value", "structure", extracted.statusDeterminationApproach === EU_APPROPRIATE ? "pass" : "warn", "warning", "StatusDeterminationApproach common expected value is EUappropriate.", extracted.statusDeterminationApproach);
  }
  checkExists(checks, document, "structure.scheme_type_community_rules", D("SchemeTypeCommunityRules"), "SchemeTypeCommunityRules exists.", "error");
  checkExists(checks, document, "structure.scheme_territory", D("SchemeTerritory"), "SchemeTerritory exists.", "error");
  checkExists(checks, document, "structure.list_issue_date_time", D("ListIssueDateTime"), "ListIssueDateTime exists.", "error");
  checkExists(checks, document, "structure.next_update", D("NextUpdate"), "NextUpdate exists.", "error");
  checkExists(checks, document, "structure.distribution_points", D("DistributionPoints"), "DistributionPoints exists.", "warning");
  if (artifactKind === "ts119612_xml_tsl") {
    checkExists(checks, document, "structure.trust_service_provider_list", D("TrustServiceProviderList"), "TrustServiceProviderList exists for a Trusted List artifact.", "error");
  } else {
    push(checks, "structure.trust_service_provider_list", "structure", "not_applicable", "info", "TrustServiceProviderList is not required by this implemented check for an XML LoTL artifact.");
  }

  checks.push(...dateChecks(extracted.listIssueDateTime, extracted.nextUpdate, assessmentDate));
  const serviceAssessment = assessServices(document, assessmentDate, artifactKind === "ts119612_xml_tsl");
  checks.push(...serviceAssessment.checks);
  certificates.push(...serviceAssessment.certificates);
  extracted.certificates = certificates;
  extracted.trustServiceProviderCount = serviceAssessment.tspCount;
  extracted.serviceCount = serviceAssessment.serviceCount;
  checks.push({
    id: "ts119612.coverage.complete",
    category: "profile",
    status: "not_checked",
    severity: "warning",
    message: "Complete ETSI TS 119 612 V2.4.1 normative coverage is not implemented; the assessment remains evidence-only.",
    evidence: summarizeTs119612Requirements(),
  });

  const mandatoryFailures = checks
    .filter((check) => check.status === "fail" && (check.severity === "critical" || check.severity === "error"))
    .map((check) => `${check.id}: ${check.message}`);
  const warnings = checks
    .filter((check) => ["warn", "not_checked", "unsupported", "inconclusive"].includes(check.status))
    .map((check) => `${check.id}: ${check.message}`);
  const score = scoreChecks(checks, options.strict);
  const conformanceLevel = determineLevel(checks, mandatoryFailures, options.strict, false);

  return {
    detected: { format: "xml", artifactKind },
    ts119612: {
      applicable: true,
      conformanceLevel,
      score,
      checks,
      mandatoryFailures,
      warnings,
    },
    extracted,
  };
}

function isTs119612Namespace(namespace: string | undefined): boolean {
  return namespace === CANONICAL_ETSI_NS || namespace === EUDI_RI_ETSI_NS_VARIANT;
}

function bindingSelectionCheck(namespace: string | undefined, versionIdentifier: string | undefined): CheckResult {
  const canonical = namespace === TS119612_SOURCE.canonicalNamespace;
  const versionMatches = versionIdentifier === String(TS119612_SOURCE.tslVersionIdentifier);
  const compatibilityInput = TS119612_COMPATIBILITY_INPUTS.find((entry) => entry.namespace === namespace);
  if (canonical && versionMatches) {
    return {
      id: "ts119612.binding.supported",
      category: "profile",
      status: "pass",
      severity: "info",
      message: "Artifact evidence selects the supported ETSI TS 119 612 V2.4.1 XML binding.",
      evidence: { standard: TS119612_SOURCE, observedNamespace: namespace, observedTslVersionIdentifier: versionIdentifier },
    };
  }
  return {
    id: "ts119612.binding.supported",
    category: "profile",
    status: canonical ? "fail" : "warn",
    severity: canonical ? "error" : "warning",
    message: canonical
      ? "The canonical namespace is present, but TSLVersionIdentifier does not select the supported V2.4.1 format version."
      : "The artifact uses an observed compatibility namespace whose normative TS 119 612 V2.4.1 status is not established.",
    evidence: {
      standard: TS119612_SOURCE,
      observedNamespace: namespace,
      observedTslVersionIdentifier: versionIdentifier,
      compatibilityInput,
    },
  };
}

function isLotlTslType(tslType: string | undefined): boolean {
  return /(?:listofthelists|listoflists|lotl)/i.test(tslType ?? "");
}

function isLotlOrLoteType(tslType: string | undefined): boolean {
  return /(?:listofthelists|listoflists|lotl|lote)/i.test(tslType ?? "");
}

function extractMetadata(document: Document): ExtractedMetadata {
  return {
    tslVersionIdentifier: text(document, D("TSLVersionIdentifier")),
    tslSequenceNumber: text(document, D("TSLSequenceNumber")),
    tslType: text(document, D("TSLType")),
    schemeOperatorName: texts(document, `${D("SchemeOperatorName")}//*[local-name()='Name'] | ${D("SchemeOperatorName")}`),
    schemeName: texts(document, `${D("SchemeName")}//*[local-name()='Name'] | ${D("SchemeName")}`),
    schemeTerritory: text(document, D("SchemeTerritory")),
    statusDeterminationApproach: text(document, D("StatusDeterminationApproach")),
    listIssueDateTime: text(document, D("ListIssueDateTime")),
    nextUpdate: text(document, `${D("NextUpdate")}//*[local-name()='dateTime'] | ${D("NextUpdate")}`),
    distributionPoints: texts(document, `${D("DistributionPoints")}//*[local-name()='URI']`),
  };
}

function assessServices(document: Document, assessmentDate: Date, expectTspContent: boolean): {
  checks: CheckResult[];
  certificates: CertificateSummary[];
  tspCount: number;
  serviceCount: number;
} {
  const checks: CheckResult[] = [];
  const certificates: CertificateSummary[] = [];
  const tsps = nodes(document, D("TrustServiceProvider"));
  const services = nodes(document, D("ServiceInformation"));
  if (!expectTspContent) {
    return { checks, certificates, tspCount: tsps.length, serviceCount: services.length };
  }
  push(checks, "services.tsp_count", "services", tsps.length > 0 ? "pass" : "warn", "warning", "TrustServiceProvider entries counted.", tsps.length);

  tsps.forEach((tsp, tspIndex) => {
    const prefix = `services.tsp.${tspIndex + 1}`;
    checkExists(checks, tsp, `${prefix}.information`, `.//*[local-name()='TSPInformation']`, "TSPInformation exists.", "error");
    checkExists(checks, tsp, `${prefix}.name`, `.//*[local-name()='TSPName']`, "TSPName exists.", "error");
    checkExists(checks, tsp, `${prefix}.address`, `.//*[local-name()='TSPAddress']`, "TSPAddress exists.", "error");
    const tspServices = nodes(tsp, `.//*[local-name()='TSPServices']/*[local-name()='TSPService']`);
    push(checks, `${prefix}.service_count`, "services", tspServices.length > 0 ? "pass" : "warn", "warning", "TSPServices/ServiceInformation entries counted.", tspServices.length);
    tspServices.forEach((service, serviceIndex) => {
      const servicePrefix = `${prefix}.service.${serviceIndex + 1}`;
      checkExists(checks, service, `${servicePrefix}.type_identifier`, `.//*[local-name()='ServiceTypeIdentifier']`, "ServiceTypeIdentifier exists.", "error");
      checkExists(checks, service, `${servicePrefix}.service_name`, `.//*[local-name()='ServiceName']`, "ServiceName exists.", "error");
      checkExists(checks, service, `${servicePrefix}.digital_identity`, `.//*[local-name()='ServiceDigitalIdentity']`, "ServiceDigitalIdentity exists.", "error");
      checkExists(checks, service, `${servicePrefix}.status`, `.//*[local-name()='ServiceStatus']`, "ServiceStatus exists.", "error");
      checkExists(checks, service, `${servicePrefix}.status_starting_time`, `.//*[local-name()='StatusStartingTime']`, "StatusStartingTime exists.", "error");
    });
  });

  const certTexts = texts(document, `${D("ServiceDigitalIdentity")}//*[local-name()='X509Certificate']`);
  certTexts.forEach((certText, index) => {
    const cert = tryCertificateFromBase64(certText, "service_digital_identity", assessmentDate);
    if (!cert) {
      checks.push({
        id: `certificates.service.${index + 1}.parse`,
        category: "certificates",
        status: "fail",
        severity: "error",
        message: "Service digital identity X.509 certificate could not be parsed.",
      });
      return;
    }
    certificates.push(cert);
    checks.push({
      id: `certificates.service.${index + 1}.parse`,
      category: "certificates",
      status: "pass",
      severity: "info",
      message: "Service digital identity X.509 certificate parsed.",
      evidence: { subject: cert.subject, fingerprintSha256: cert.fingerprintSha256 },
    });
    if (cert.validAtAssessmentTime === false) {
      checks.push({
        id: `certificates.service.${index + 1}.validity`,
        category: "certificates",
        status: "warn",
        severity: "warning",
        message: "Service digital identity certificate is expired or not yet valid at assessment time.",
        evidence: { notBefore: cert.notBefore, notAfter: cert.notAfter },
      });
    }
  });

  return { checks, certificates, tspCount: tsps.length, serviceCount: services.length };
}

function dateChecks(issueValue: string | undefined, nextValue: string | undefined, assessmentDate: Date): CheckResult[] {
  const checks: CheckResult[] = [];
  const issue = parseDate(issueValue);
  const next = parseDate(nextValue);
  push(checks, "dates.issue_valid", "dates", issue ? "pass" : "fail", "error", "ListIssueDateTime is a valid ISO timestamp.", issueValue);
  push(checks, "dates.next_update_valid", "dates", next ? "pass" : "fail", "error", "NextUpdate is a valid ISO timestamp.", nextValue);
  if (issue && next) {
    push(checks, "dates.next_after_issue", "dates", next > issue ? "pass" : "fail", "error", "NextUpdate is after ListIssueDateTime.", { issue: issue.toISOString(), nextUpdate: next.toISOString() });
    const days = Math.round((next.getTime() - issue.getTime()) / 86_400_000);
    push(checks, "dates.update_period_days", "dates", days <= 183 ? "pass" : "warn", "warning", "Update period is not longer than six months.", days);
    if (assessmentDate > next) {
      checks.push({
        id: "dates.next_update_expired",
        category: "dates",
        status: "warn",
        severity: "warning",
        message: "Current assessment date is after NextUpdate; trusted list appears expired.",
        evidence: { assessmentDate: assessmentDate.toISOString(), nextUpdate: next.toISOString() },
      });
    }
  }
  return checks;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function checkExists(checks: CheckResult[], context: Node, id: string, expression: string, message: string, severity: "critical" | "error" | "warning"): void {
  const present = has(context, expression);
  push(checks, id, severity === "warning" ? "profile" : "structure", present ? "pass" : severity === "warning" ? "warn" : "fail", severity, message);
}

function push(
  checks: CheckResult[],
  id: string,
  category: CheckResult["category"],
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): void {
  checks.push({ id, category, status, severity, message, evidence });
}

function hasSchemaLocation(root: Element): boolean {
  return Boolean(schemaLocation(root));
}

function schemaLocation(root: Element): string | undefined {
  return (
    root.getAttributeNS("http://www.w3.org/2001/XMLSchema-instance", "schemaLocation")
    ?? root.getAttribute("xsi:schemaLocation")
    ?? undefined
  );
}

function scoreChecks(checks: CheckResult[], strict: boolean): number {
  let score = 100;
  for (const check of checks) {
    if (check.status === "fail" && check.severity === "critical") score -= 30;
    else if (check.status === "fail" && check.severity === "error") score -= 15;
    else if (check.status === "warn") score -= 5;
    else if (strict && check.status === "not_checked") score -= 5;
  }
  return Math.max(0, score);
}

function determineLevel(checks: CheckResult[], mandatoryFailures: string[], strict: boolean, coverageComplete: boolean): ConformanceLevel {
  const criticalFailures = checks.filter((check) => check.status === "fail" && check.severity === "critical");
  if (criticalFailures.length > 0 || mandatoryFailures.length >= 3) return "non_conformant";
  if (mandatoryFailures.length > 0) return strict ? "non_conformant" : "partially_conformant";
  if (!coverageComplete) return "not_checked";
  const importantNotChecked = checks.some((check) => check.status === "not_checked" && ["schema", "signature"].includes(check.category));
  const warnings = checks.some((check) => check.status === "warn");
  if (importantNotChecked || warnings) return "partially_conformant";
  return "conformant";
}
