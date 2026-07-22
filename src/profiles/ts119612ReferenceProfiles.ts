import type {
  ArtifactKind,
  ArtifactReferenceProfiles,
  CheckResult,
  ReferenceProfileAssessment,
} from "../types.js";
import type { EudiTrustRole } from "../eudi/roles.js";
import { parseXml } from "../xml/parse.js";

const EUDI_RI_HOST = "trustedlist.serviceproviders.eudiw.dev";
const WE_BUILD_HOST = "webuild-consortium.github.io";
const WE_BUILD_PATH_PREFIX = "/wp4-trust-group/";
const CANONICAL_TS119612_NAMESPACE = "http://uri.etsi.org/02231/v2#";
const OBSERVED_REFERENCE_NAMESPACE = "http://uri.etsi.org/19612/v2.4.1#";
const EU_GENERIC_TYPE = "http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric";
const EU_LOTL_TYPE = "http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUlistofthelists";

const ROLE_BY_SERVICE_TYPE = new Map<string, EudiTrustRole>([
  ["http://uri.etsi.org/TrstSvc/Svctype/EAA/Q", "qeaa_provider"],
  ["http://uri.etsi.org/TrstSvc/Svctype/EAA/Pub-EAA", "pub_eaa_provider"],
  ["http://uri.etsi.org/Svc/Svctype/Provider/Wallet", "wallet_provider"],
  ["http://uri.etsi.org/Svc/Svctype/Provider/PID", "pid_provider"],
  ["http://uri.etsi.org/Svc/Svctype/CA/RPaccess", "access_ca_or_wrpac_provider"],
  ["http://uri.etsi.org/Svc/Svctype/CA/Registration", "registration_ca_or_wrprc_provider"],
  ["http://uri.etsi.org/Svc/Svctype/Provider/Registrar", "registrar_or_register"],
]);

interface ReferenceProfileInput {
  xml: string;
  source: string;
  artifactKind: Extract<ArtifactKind, "ts119612_xml_tsl" | "ts119612_xml_lotl">;
}

interface XmlObservations {
  namespace: string | null;
  tslType?: string;
  territory?: string;
  operatorAndSchemeText: string;
  urls: string[];
  distributionPoints: string[];
  pointerLocations: string[];
  services: ServiceObservation[];
}

interface ServiceObservation {
  serviceType?: string;
  role?: EudiTrustRole;
  certificateCount: number;
}

export function assessTs119612ReferenceProfiles(input: ReferenceProfileInput): ArtifactReferenceProfiles {
  const parsed = parseXml(input.xml);
  if (!parsed.document) return unknownProfiles("Reference-profile checks could not parse the XML input.");
  const observations = observe(parsed.document);
  return {
    eudiRiTs119612: assessEudiRi(input, observations),
    weBuildTs119612: assessWeBuild(input, observations),
  };
}

export function emptyReferenceProfiles(): ArtifactReferenceProfiles {
  return unknownProfiles("Artifact content was not available for reference-profile classification.");
}

function assessEudiRi(input: ReferenceProfileInput, observed: XmlObservations): ReferenceProfileAssessment {
  const recognitionReasons: string[] = [];
  if (sourceMatches(input.source, EUDI_RI_HOST)) recognitionReasons.push("Source uses the EUDI RI Trusted List Provider host.");
  if (observed.urls.some((value) => urlMatches(value, EUDI_RI_HOST))) recognitionReasons.push("Embedded URI evidence uses the EUDI RI Trusted List Provider host.");
  if (/EUDI(?:W| Wallet).*Reference Implementation/i.test(observed.operatorAndSchemeText)) recognitionReasons.push("Embedded text identifies the EUDI Wallet Reference Implementation.");
  if (recognitionReasons.length === 0) return notApplicable("eudi_ri.ts119612", "No explicit EUDI RI TS 119 612 reference-profile signal was found.");

  const checks: CheckResult[] = [
    profileCheck("eudi_ri.ts119612.applicability", "pass", "info", "Artifact is recognized as an EUDI RI TS 119 612 reference-profile input.", {
      recognitionReasons,
      normativeEffect: "none",
    }),
    profileCheck("eudi_ri.ts119612.reference_source_trust", "warn", "warning", "The EUDI RI Trusted List Provider is a reference/testing input; recognition does not make it a production trust source.", {
      source: input.source,
      normativeEffect: "none",
    }),
  ];

  const expectedKind = expectedEudiKind(input.source, observed.tslType);
  const kindMatches = expectedKind === undefined || expectedKind === input.artifactKind;
  checks.push(profileCheck(
    "eudi_ri.ts119612.endpoint_artifact_role",
    kindMatches ? "pass" : "warn",
    kindMatches ? "info" : "warning",
    kindMatches ? "EUDI RI endpoint/type evidence is consistent with the detected TL or LoTL role." : "EUDI RI endpoint/type evidence conflicts with the detected TL or LoTL role.",
    { source: input.source, tslType: observed.tslType, expectedKind, detectedKind: input.artifactKind },
  ));

  checks.push(roleClassificationCheck("eudi_ri.ts119612", observed.services, input.artifactKind));
  checks.push(roleIdentityCheck("eudi_ri.ts119612", observed.services, input.artifactKind));

  if (input.artifactKind === "ts119612_xml_lotl") {
    const insecure = observed.pointerLocations.filter((value) => !isHttps(value));
    checks.push(profileCheck(
      "eudi_ri.ts119612.pointer_transport_observation",
      observed.pointerLocations.length === 0 ? "warn" : insecure.length === 0 ? "pass" : "warn",
      observed.pointerLocations.length > 0 && insecure.length === 0 ? "info" : "warning",
      observed.pointerLocations.length === 0
        ? "No LoTL pointer location was observed in the EUDI RI reference artifact."
        : insecure.length === 0
          ? "Observed EUDI RI LoTL pointer locations use HTTPS."
          : "One or more observed EUDI RI LoTL pointer locations do not use HTTPS.",
      { pointerCount: observed.pointerLocations.length, insecureLocations: insecure },
    ));
  }

  return assessment(recognitionReasons, checks, observed.services);
}

function assessWeBuild(input: ReferenceProfileInput, observed: XmlObservations): ReferenceProfileAssessment {
  const recognitionReasons: string[] = [];
  if (sourceMatches(input.source, WE_BUILD_HOST, WE_BUILD_PATH_PREFIX)) recognitionReasons.push("Source uses the WE BUILD WP4 trust-group publication path.");
  if (observed.urls.some((value) => urlMatches(value, WE_BUILD_HOST, WE_BUILD_PATH_PREFIX))) recognitionReasons.push("Embedded URI evidence uses the WE BUILD WP4 trust-group publication path.");
  if (/WE\s*BUILD/i.test(observed.operatorAndSchemeText) && /WP\s*4|WP4/i.test(observed.operatorAndSchemeText)) recognitionReasons.push("Scheme/operator text identifies WE BUILD WP4.");
  if (recognitionReasons.length === 0) return notApplicable("we_build.ts119612", "No explicit WE BUILD WP4 TS 119 612 reference-profile signal was found.");

  const checks: CheckResult[] = [
    profileCheck("we_build.ts119612.applicability", "pass", "info", "Artifact is recognized as a WE BUILD WP4 TS 119 612 reference-profile input.", {
      recognitionReasons,
      normativeEffect: "none",
    }),
    profileCheck("we_build.ts119612.reference_source_trust", "warn", "warning", "WE BUILD WP4 publication behavior is reference-profile evidence and is not promoted to normative ETSI behavior or a trust decision.", {
      source: input.source,
      normativeEffect: "none",
    }),
  ];

  const namespaceStatus = observed.namespace === CANONICAL_TS119612_NAMESPACE
    ? "pass"
    : observed.namespace === OBSERVED_REFERENCE_NAMESPACE
      ? "warn"
      : "inconclusive";
  checks.push(profileCheck(
    "we_build.ts119612.namespace_binding",
    namespaceStatus,
    namespaceStatus === "pass" ? "info" : "warning",
    namespaceStatus === "pass"
      ? "WE BUILD artifact uses the canonical TS 119 612 namespace."
      : namespaceStatus === "warn"
        ? "WE BUILD artifact uses the observed 19612/v2.4.1 compatibility namespace; this is not treated as a normative ETSI namespace binding."
        : "WE BUILD artifact uses a namespace outside the implemented TS 119 612 bindings.",
    { namespace: observed.namespace, canonicalNamespace: CANONICAL_TS119612_NAMESPACE },
  ));

  const indexShape = observed.tslType === EU_GENERIC_TYPE
    && observed.services.length === 0
    && observed.distributionPoints.length > 0;
  const memberShape = observed.tslType === EU_GENERIC_TYPE && observed.services.length > 0;
  checks.push(profileCheck(
    "we_build.ts119612.artifact_shape",
    indexShape || memberShape ? "pass" : "warn",
    indexShape || memberShape ? "info" : "warning",
    indexShape
      ? "Artifact matches the observed WE BUILD XML distribution-index shape."
      : memberShape
        ? "Artifact matches a WE BUILD XML member trusted-list shape."
        : "Artifact does not match either implemented WE BUILD TS 119 612 reference shape.",
    {
      shape: indexShape ? "distribution_index" : memberShape ? "member_tl" : "unknown",
      tslType: observed.tslType,
      distributionPointCount: observed.distributionPoints.length,
      serviceCount: observed.services.length,
    },
  ));

  const invalidDistributionPoints = observed.distributionPoints.filter((value) => !isHttpUrl(value));
  const duplicateDistributionPoints = duplicates(observed.distributionPoints);
  checks.push(profileCheck(
    "we_build.ts119612.distribution_references",
    observed.distributionPoints.length === 0
      ? memberShape ? "not_applicable" : "warn"
      : invalidDistributionPoints.length === 0 && duplicateDistributionPoints.length === 0 ? "pass" : "warn",
    observed.distributionPoints.length > 0 && invalidDistributionPoints.length === 0 && duplicateDistributionPoints.length === 0 ? "info" : "warning",
    observed.distributionPoints.length === 0
      ? memberShape ? "Distribution-index checks are not applicable to this WE BUILD member TL." : "No WE BUILD distribution reference was observed."
      : invalidDistributionPoints.length === 0 && duplicateDistributionPoints.length === 0
        ? "WE BUILD distribution references are unique HTTP(S) URIs."
        : "WE BUILD distribution references include an invalid or duplicate location.",
    {
      count: observed.distributionPoints.length,
      invalid: invalidDistributionPoints,
      duplicates: duplicateDistributionPoints,
      formats: countFormats(observed.distributionPoints),
    },
  ));

  checks.push(roleClassificationCheck("we_build.ts119612", observed.services, input.artifactKind));
  checks.push(roleIdentityCheck("we_build.ts119612", observed.services, input.artifactKind));
  return assessment(recognitionReasons, checks, observed.services);
}

function assessment(recognitionReasons: string[], checks: CheckResult[], services: ServiceObservation[]): ReferenceProfileAssessment {
  return {
    applicability: "applicable",
    recognized: true,
    recognitionReasons,
    observedRoles: uniqueRoles(services),
    checks,
  };
}

function notApplicable(prefix: string, message: string): ReferenceProfileAssessment {
  return {
    applicability: "not_applicable",
    recognized: false,
    recognitionReasons: [],
    observedRoles: [],
    checks: [profileCheck(`${prefix}.applicability`, "not_applicable", "info", message, { normativeEffect: "none" })],
  };
}

function unknownProfiles(message: string): ArtifactReferenceProfiles {
  const profile = (prefix: string): ReferenceProfileAssessment => ({
    applicability: "unknown",
    recognized: false,
    recognitionReasons: [],
    observedRoles: [],
    checks: [profileCheck(`${prefix}.applicability`, "not_checked", "info", message)],
  });
  return { eudiRiTs119612: profile("eudi_ri.ts119612"), weBuildTs119612: profile("we_build.ts119612") };
}

function roleClassificationCheck(prefix: string, services: ServiceObservation[], artifactKind: ArtifactKind): CheckResult {
  if (artifactKind === "ts119612_xml_lotl" || services.length === 0) {
    return profileCheck(`${prefix}.service_role_classification`, "not_applicable", "info", "Service-role classification is not applicable because this reference artifact contains no current TSP services.", { serviceCount: services.length });
  }
  const unknown = services.filter((service) => !service.role).map((service) => service.serviceType ?? null);
  const roles = uniqueRoles(services);
  return profileCheck(
    `${prefix}.service_role_classification`,
    roles.length > 0 && unknown.length === 0 ? "pass" : "warn",
    roles.length > 0 && unknown.length === 0 ? "info" : "warning",
    roles.length > 0 && unknown.length === 0
      ? "Every observed reference-profile service type maps to an implemented EUDI trust role."
      : "One or more observed service types do not map to an implemented EUDI trust role.",
    { roles, unknownServiceTypes: unknown },
  );
}

function roleIdentityCheck(prefix: string, services: ServiceObservation[], artifactKind: ArtifactKind): CheckResult {
  const roleServices = services.filter((service) => service.role);
  if (artifactKind === "ts119612_xml_lotl" || roleServices.length === 0) {
    return profileCheck(`${prefix}.role_trust_anchor_evidence`, "not_applicable", "info", "Role trust-anchor evidence is not applicable because no role-bearing current service was identified.");
  }
  const missing = roleServices.filter((service) => service.certificateCount === 0);
  return profileCheck(
    `${prefix}.role_trust_anchor_evidence`,
    missing.length === 0 ? "pass" : "warn",
    missing.length === 0 ? "info" : "warning",
    missing.length === 0
      ? "Each role-bearing service contains X.509 identity material that may be assessed as trust-anchor evidence."
      : "One or more role-bearing services contain no X.509 identity material.",
    {
      roleServiceCount: roleServices.length,
      servicesMissingCertificates: missing.map((service) => ({ serviceType: service.serviceType, role: service.role })),
      embeddedCertificatesAreTrusted: false,
    },
  );
}

function observe(document: Document): XmlObservations {
  const root = document.documentElement;
  const scheme = direct(root, "SchemeInformation")[0];
  const operatorAndSchemeText = [
    ...descendants(direct(scheme, "SchemeOperatorName")[0], "Name"),
    ...descendants(direct(scheme, "SchemeName")[0], "Name"),
  ].map(value).filter(isString).join(" ");
  const urls = allElements(root)
    .map(value)
    .filter(isString)
    .filter((entry) => isHttpUrl(entry));
  const distributionPoints = descendants(direct(scheme, "DistributionPoints")[0], "URI").map(value).filter(isString);
  const pointerLocations = descendants(direct(scheme, "PointersToOtherTSL")[0], "TSLLocation").map(value).filter(isString);
  const services = descendants(root, "TSPService").map((service): ServiceObservation => {
    const information = direct(service, "ServiceInformation")[0];
    const serviceType = value(direct(information, "ServiceTypeIdentifier")[0]);
    return {
      serviceType,
      role: serviceType ? ROLE_BY_SERVICE_TYPE.get(serviceType) : undefined,
      certificateCount: descendants(direct(information, "ServiceDigitalIdentity")[0], "X509Certificate").filter((entry) => Boolean(value(entry))).length,
    };
  });
  return {
    namespace: root.namespaceURI,
    tslType: value(direct(scheme, "TSLType")[0]),
    territory: value(direct(scheme, "SchemeTerritory")[0]),
    operatorAndSchemeText,
    urls,
    distributionPoints,
    pointerLocations,
    services,
  };
}

function expectedEudiKind(source: string, tslType: string | undefined): ArtifactKind | undefined {
  const parsed = safeUrl(source);
  if (parsed?.hostname === EUDI_RI_HOST && parsed.pathname.startsWith("/LOTL/")) return "ts119612_xml_lotl";
  if (parsed?.hostname === EUDI_RI_HOST && parsed.pathname.startsWith("/TL/")) return "ts119612_xml_tsl";
  if (tslType === EU_LOTL_TYPE) return "ts119612_xml_lotl";
  if (tslType === EU_GENERIC_TYPE) return "ts119612_xml_tsl";
  return undefined;
}

function sourceMatches(source: string, host: string, pathPrefix?: string): boolean {
  const parsed = safeUrl(source);
  return Boolean(parsed && parsed.protocol === "https:" && parsed.hostname === host && (!pathPrefix || parsed.pathname.startsWith(pathPrefix)));
}

function urlMatches(value: string, host: string, pathPrefix?: string): boolean {
  const parsed = safeUrl(value);
  return Boolean(parsed && parsed.hostname === host && (!pathPrefix || parsed.pathname.startsWith(pathPrefix)));
}

function safeUrl(value: string): URL | undefined {
  try { return new URL(value); } catch { return undefined; }
}

function isHttpUrl(value: string): boolean {
  const parsed = safeUrl(value);
  return parsed?.protocol === "https:" || parsed?.protocol === "http:";
}

function isHttps(value: string): boolean {
  return safeUrl(value)?.protocol === "https:";
}

function countFormats(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of values) {
    const path = safeUrl(entry)?.pathname.toLowerCase() ?? "";
    const format = path.endsWith(".xml") ? "xml" : path.endsWith(".json") ? "json" : path.endsWith(".jwt") ? "jws" : "unknown";
    counts[format] = (counts[format] ?? 0) + 1;
  }
  return counts;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const entry of values) seen.has(entry) ? duplicate.add(entry) : seen.add(entry);
  return [...duplicate].sort();
}

function uniqueRoles(services: ServiceObservation[]): EudiTrustRole[] {
  return [...new Set(services.map((service) => service.role).filter((role): role is EudiTrustRole => Boolean(role)))].sort();
}

function allElements(root: Element): Element[] {
  return [root, ...Array.from(root.getElementsByTagName("*"))] as Element[];
}

function direct(parent: Element | undefined, localName: string): Element[] {
  if (!parent) return [];
  return Array.from(parent.childNodes)
    .filter((node): node is Element => node.nodeType === 1 && (((node as Element).localName || node.nodeName) === localName));
}

function descendants(parent: Element | undefined, localName: string): Element[] {
  if (!parent) return [];
  return Array.from(parent.getElementsByTagNameNS("*", localName)) as Element[];
}

function value(element: Element | undefined): string | undefined {
  const result = element?.textContent?.trim();
  return result || undefined;
}

function isString(value: string | undefined): value is string {
  return Boolean(value);
}

function profileCheck(id: string, status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult {
  return { id, category: "profile", status, severity, message, evidence };
}
