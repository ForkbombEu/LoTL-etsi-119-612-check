import { createHash, X509Certificate } from "node:crypto";
import { tryCertificateFromBase64 } from "../certs.js";
import {
  validateTs119602CountryCode,
  validateTs119602MultilingualValues,
  validateTs119602Uri,
} from "../standards/ts119602Syntax.js";
import type { ArtifactKind, CertificateSummary, CheckResult } from "../types.js";
import { inspectTs119612DigitalIdentity } from "./ts119612ServiceSemantics.js";

const CANONICAL_TSL_NAMESPACE = "http://uri.etsi.org/02231/v2#";
const ADDITIONAL_TYPES_NAMESPACE = "http://uri.etsi.org/02231/v2/additionaltypes#";
const XMLDSIG_NAMESPACE = "http://www.w3.org/2000/09/xmldsig#";
const XML_LANGUAGE_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const ETSI_TSL_MIME_TYPE = "application/vnd.etsi.tsl+xml";
const EU_GENERIC = "http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric";
const EU_LIST_OF_LISTS = "http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUlistofthelists";

type TslArtifact = Extract<ArtifactKind, "ts119612_xml_tsl" | "ts119612_xml_lotl">;

interface ParsedCertificate {
  encoded: string;
  certificate: X509Certificate;
  summary: CertificateSummary;
  publicKeySha256: string;
  subject: Map<string, string[]>;
}

interface IdentityAssessment {
  certificates: ParsedCertificate[];
  diagnostics: string[];
  representationCounts: Record<string, number>;
}

export interface Ts119612PointerAssessment {
  checks: CheckResult[];
  certificates: CertificateSummary[];
  pointerCount: number;
}

/** Assess locally decidable clause 5.3.13 and Annex A pointer evidence without dereferencing. */
export function assessTs119612Pointers(
  document: Document,
  artifactKind: TslArtifact,
  assessmentDate: Date,
): Ts119612PointerAssessment {
  const checks: CheckResult[] = [];
  const certificates: CertificateSummary[] = [];
  const root = document.documentElement;
  const namespace = root.namespaceURI;
  const scheme = namedChild(root, "SchemeInformation");
  const containers = scheme ? namedChildren(scheme, "PointersToOtherTSL") : [];
  const sourceType = text(scheme && namedChild(scheme, "TSLType"));
  const required = sourceType === EU_GENERIC || sourceType === EU_LIST_OF_LISTS;
  const pointers = containers.flatMap((container) => namedChildren(container, "OtherTSLPointer"));
  const unexpected = containers.flatMap((container) => directChildren(container).filter((item) => (
    item.namespaceURI !== namespace || local(item) !== "OtherTSLPointer"
  )));
  const containerValid = containers.length === 1 && pointers.length > 0 && unexpected.length === 0
    && directChildren(containers[0]).length === pointers.length;

  if (containers.length === 0 && !required) {
    checks.push(check("ts119612.scheme.pointers.structure", "structure", "not_applicable", "info",
      "PointersToOtherTSL is optional for this locally classified scheme and is absent.",
      { artifactKind, sourceType: sourceType ?? null, required: false }));
    checks.push(authenticationCheck(0));
    return { checks, certificates, pointerCount: 0 };
  }

  checks.push(result(
    "ts119612.scheme.pointers.structure", "structure", containerValid,
    "PointersToOtherTSL is one direct non-empty sequence containing only OtherTSLPointer elements.",
    required
      ? "The applicable scheme requires one non-empty PointersToOtherTSL sequence containing only OtherTSLPointer elements."
      : "When present, PointersToOtherTSL shall be one non-empty sequence containing only OtherTSLPointer elements.",
    {
      artifactKind,
      sourceType: sourceType ?? null,
      required,
      containerCount: containers.length,
      pointerCount: pointers.length,
      unexpectedChildren: unexpected.map(qname),
    },
    "critical",
  ));

  pointers.forEach((pointer, pointerIndex) => {
    const number = pointerIndex + 1;
    const prefix = `ts119612.pointer.${number}`;
    const children = directChildren(pointer);
    const identitiesContainers = namedChildren(pointer, "ServiceDigitalIdentities");
    const locations = namedChildren(pointer, "TSLLocation");
    const additionalContainers = namedChildren(pointer, "AdditionalInformation");
    const expectedNames = ["ServiceDigitalIdentities", "TSLLocation", "AdditionalInformation"];
    const observedNames = children.map(local);
    const structureValid = identitiesContainers.length === 1 && locations.length === 1
      && additionalContainers.length === 1 && children.length === 3
      && children.every((item) => item.namespaceURI === namespace && expectedNames.includes(local(item)))
      && observedNames.join(",") === expectedNames.join(",");
    checks.push(result(`${prefix}.structure`, "structure", structureValid,
      "OtherTSLPointer has the exact identity, location and qualifier tuple in schema order.",
      "OtherTSLPointer shall contain ServiceDigitalIdentities, TSLLocation and AdditionalInformation exactly once in that order.",
      { observedChildren: children.map(qname) }, "critical"));

    const location = text(locations[0]);
    const uri = validateTs119602Uri(location);
    checks.push(result(`${prefix}.location`, "structure",
      locations.length === 1 && directChildren(locations[0] as Element).length === 0 && uri.outcome === "valid",
      "TSLLocation is one simple absolute URI.",
      "TSLLocation shall be one non-empty simple absolute RFC 3986 URI.",
      { value: location ?? null, diagnostics: uri.diagnostics }));

    const identityAssessments = assessIdentities(
      identitiesContainers[0], namespace, assessmentDate, number, checks, certificates,
    );
    const identityDiagnostics = identityAssessments.flatMap((identity) => identity.diagnostics);
    checks.push(result(`${prefix}.identities`, "certificates",
      identitiesContainers.length === 1 && identityAssessments.length > 0 && identityDiagnostics.length === 0,
      "Pointer service identities are a non-empty sequence of locally valid signing-certificate identities.",
      "Pointer service identities shall contain one or more locally valid and internally equivalent signing-certificate identities.",
      {
        identityCount: identityAssessments.length,
        representations: identityAssessments.map((identity) => identity.representationCounts),
        diagnostics: identityDiagnostics,
      }, "critical"));

    const qualifiers = assessQualifiers(additionalContainers[0], namespace);
    checks.push(result(`${prefix}.qualifiers`, "profile", qualifiers.diagnostics.length === 0,
      "Pointer qualifiers contain exactly the required type, operator, community-rules, territory and MIME evidence.",
      "Pointer AdditionalInformation shall contain exactly the required qualified values with their prescribed namespaces and structures.",
      { values: qualifiers.values, diagnostics: qualifiers.diagnostics }, "critical"));

    checks.push(dispatchCheck(`${prefix}.dispatch`, qualifiers.values.type, namespace));
    const parsedCertificates = identityAssessments.flatMap((identity) => identity.certificates);
    checks.push(signingCertificateCheck(`${prefix}.signing_certificates`, parsedCertificates, qualifiers.values));
    checks.push(rolloverCheck(`${prefix}.rollover`, parsedCertificates, assessmentDate));
  });

  checks.push(authenticationCheck(pointers.length));
  return { checks, certificates, pointerCount: pointers.length };
}

function assessIdentities(
  container: Element | undefined,
  namespace: string | null,
  assessmentDate: Date,
  pointerNumber: number,
  checks: CheckResult[],
  summaries: CertificateSummary[],
): IdentityAssessment[] {
  if (!container) return [];
  const identities = namedChildren(container, "ServiceDigitalIdentity");
  if (directChildren(container).length !== identities.length) return [{
    certificates: [],
    diagnostics: ["ServiceDigitalIdentities contains unexpected or foreign-namespace children."],
    representationCounts: {},
  }];
  let certificateNumber = 0;
  return identities.map((identity, identityIndex) => {
    const diagnostics: string[] = [];
    const equivalence = inspectTs119612DigitalIdentity(identity, namespace ?? undefined);
    const digitalIds = namedChildren(identity, "DigitalId");
    if (digitalIds.length === 0 || directChildren(identity).length !== digitalIds.length) {
      diagnostics.push(`ServiceDigitalIdentity ${identityIndex + 1} shall contain only a non-empty DigitalId sequence.`);
    }
    const representations = digitalIds.map((digitalId, digitalIdIndex) => {
      const content = directChildren(digitalId);
      if (content.length !== 1) diagnostics.push(`Identity ${identityIndex + 1} DigitalId ${digitalIdIndex + 1} shall contain exactly one representation.`);
      const representation = content[0];
      const name = representation ? local(representation) : "missing";
      const allowed = ["X509Certificate", "X509SubjectName", "KeyValue", "X509SKI"];
      const expectedNamespace = name === "KeyValue" ? XMLDSIG_NAMESPACE : namespace;
      if (!representation || !allowed.includes(name) || representation.namespaceURI !== expectedNamespace) {
        diagnostics.push(`Identity ${identityIndex + 1} DigitalId ${digitalIdIndex + 1} has an unsupported representation or namespace.`);
      }
      return { name, element: representation };
    });
    const representationCounts = Object.fromEntries(
      ["X509Certificate", "X509SubjectName", "KeyValue", "X509SKI", "Other"]
        .map((name) => [name, representations.filter((entry) => entry.name === name).length]),
    );
    if ((representationCounts.X509Certificate ?? 0) < 1) {
      diagnostics.push(`ServiceDigitalIdentity ${identityIndex + 1} has no X509Certificate usable for pointed-list signature authentication.`);
    }
    if ((representationCounts.X509SubjectName ?? 0) > 1 || (representationCounts.KeyValue ?? 0) > 1
      || (representationCounts.X509SKI ?? 0) > 1 || (representationCounts.Other ?? 0) > 0) {
      diagnostics.push(`ServiceDigitalIdentity ${identityIndex + 1} does not use the supported clause 5.5.3 PKI tuple cardinalities.`);
    }
    diagnostics.push(...equivalence.diagnostics.map((diagnostic) => (
      `ServiceDigitalIdentity ${identityIndex + 1}: ${diagnostic}`
    )));

    const certificates: ParsedCertificate[] = [];
    representations.filter((entry) => entry.name === "X509Certificate").forEach((entry) => {
      certificateNumber += 1;
      const encoded = text(entry.element);
      const id = `certificates.pointer.${pointerNumber}.${certificateNumber}`;
      if (!encoded) {
        diagnostics.push(`Pointer certificate ${certificateNumber} is empty.`);
        checks.push(check(`${id}.parse`, "certificates", "fail", "critical", "Pointer X.509 certificate is empty."));
        return;
      }
      try {
        const certificate = new X509Certificate(Buffer.from(encoded.replace(/\s+/g, ""), "base64"));
        const summary = tryCertificateFromBase64(encoded, "pointer", assessmentDate);
        if (!summary) throw new Error("Certificate summary failed.");
        const publicKeySha256 = createHash("sha256")
          .update(certificate.publicKey.export({ type: "spki", format: "der" }))
          .digest("hex");
        certificates.push({ encoded, certificate, summary, publicKeySha256, subject: dnMap(certificate.subject) });
        summaries.push(summary);
        checks.push(check(`${id}.parse`, "certificates", "pass", "info", "Pointer X.509 certificate parsed.",
          { subject: summary.subject, issuer: summary.issuer, serialNumber: summary.serialNumber, fingerprintSha256: summary.fingerprintSha256 }));
        checks.push(check(`${id}.validity`, "certificates",
          summary.validAtAssessmentTime ? "pass" : "warn", summary.validAtAssessmentTime ? "info" : "warning",
          summary.validAtAssessmentTime
            ? "Pointer signing certificate is valid at the assessment time."
            : "Pointer signing certificate is expired or not yet valid at the assessment time.",
          { assessmentDate: assessmentDate.toISOString(), notBefore: summary.notBefore, notAfter: summary.notAfter }));
      } catch {
        diagnostics.push(`Pointer certificate ${certificateNumber} could not be parsed.`);
        checks.push(check(`${id}.parse`, "certificates", "fail", "critical", "Pointer X.509 certificate could not be parsed."));
      }
    });

    if (certificates.length > 1) {
      const first = certificates[0];
      certificates.slice(1).forEach((certificate) => {
        if (certificate.publicKeySha256 !== first.publicKeySha256 || normalizeDn(certificate.certificate.subject) !== normalizeDn(first.certificate.subject)) {
          diagnostics.push(`Certificates within ServiceDigitalIdentity ${identityIndex + 1} do not represent the same subject and public key.`);
        }
      });
    }
    const primary = certificates[0];
    if (primary) {
      representations.filter((entry) => entry.name === "X509SubjectName").forEach((entry) => {
        if (normalizeDn(text(entry.element) ?? "") !== normalizeDn(primary.certificate.subject)) {
          diagnostics.push(`ServiceDigitalIdentity ${identityIndex + 1} X509SubjectName does not match its certificate subject.`);
        }
      });
    }
    return { certificates, diagnostics, representationCounts };
  });
}

function assessQualifiers(container: Element | undefined, namespace: string | null): {
  diagnostics: string[];
  values: {
    type?: string;
    operatorNames: string[];
    communityRules: string[];
    territory?: string;
    mimeType?: string;
  };
} {
  const diagnostics: string[] = [];
  const values = { operatorNames: [] as string[], communityRules: [] as string[], type: undefined as string | undefined,
    territory: undefined as string | undefined, mimeType: undefined as string | undefined };
  if (!container) return { diagnostics: ["AdditionalInformation is missing."], values };
  const wrappers = namedChildren(container, "OtherInformation");
  if (wrappers.length !== directChildren(container).length || wrappers.length !== 5) {
    diagnostics.push("AdditionalInformation shall contain exactly five direct OtherInformation qualifier wrappers and no TextualInformation.");
  }
  const qualifierElements = wrappers.flatMap((wrapper, index) => {
    const content = directChildren(wrapper);
    if (content.length !== 1) diagnostics.push(`OtherInformation ${index + 1} shall wrap exactly one qualifier element.`);
    return content;
  });
  const specifications = [
    { name: "TSLType", namespace },
    { name: "SchemeOperatorName", namespace },
    { name: "SchemeTypeCommunityRules", namespace },
    { name: "SchemeTerritory", namespace },
    { name: "MimeType", namespace: ADDITIONAL_TYPES_NAMESPACE },
  ];
  specifications.forEach((specification) => {
    const matches = qualifierElements.filter((element) => local(element) === specification.name
      && element.namespaceURI === specification.namespace);
    if (matches.length !== 1) diagnostics.push(`${specification.name} qualifier shall occur exactly once in its prescribed namespace.`);
  });
  const recognized = qualifierElements.filter((element) => specifications.some((specification) => (
    specification.name === local(element) && specification.namespace === element.namespaceURI
  )));
  if (recognized.length !== qualifierElements.length) diagnostics.push("AdditionalInformation contains an unknown or wrong-namespace qualifier.");

  const typeElement = recognized.find((element) => local(element) === "TSLType");
  values.type = text(typeElement);
  const typeSyntax = validateTs119602Uri(values.type);
  if (typeSyntax.outcome !== "valid" || (typeElement && directChildren(typeElement).length > 0)) diagnostics.push("TSLType qualifier shall be one simple absolute URI.");

  const operator = recognized.find((element) => local(element) === "SchemeOperatorName");
  const names = operator ? namedChildren(operator, "Name") : [];
  const multilingual = validateTs119602MultilingualValues(names.map((name) => ({
    language: name.getAttributeNS(XML_LANGUAGE_NAMESPACE, "lang") || name.getAttribute("xml:lang"), value: text(name),
  })));
  values.operatorNames = names.map(text).filter(isString);
  if (!operator || names.length !== directChildren(operator).length || multilingual.outcome !== "valid") {
    diagnostics.push("SchemeOperatorName qualifier shall be a non-empty English-capable multilingual name sequence.");
  }

  const rules = recognized.find((element) => local(element) === "SchemeTypeCommunityRules");
  const uris = rules ? namedChildren(rules, "URI") : [];
  const rulesMultilingual = validateTs119602MultilingualValues(uris.map((uri) => ({
    language: uri.getAttributeNS(XML_LANGUAGE_NAMESPACE, "lang") || uri.getAttribute("xml:lang"), value: text(uri),
  })));
  values.communityRules = uris.map(text).filter(isString);
  const invalidRuleUri = values.communityRules.some((uri) => validateTs119602Uri(uri).outcome !== "valid");
  if (!rules || uris.length !== directChildren(rules).length || rulesMultilingual.outcome !== "valid" || invalidRuleUri) {
    diagnostics.push("SchemeTypeCommunityRules qualifier shall contain non-empty English-capable multilingual absolute URIs.");
  }

  const territoryElement = recognized.find((element) => local(element) === "SchemeTerritory");
  values.territory = text(territoryElement);
  if (validateTs119602CountryCode(values.territory).outcome !== "valid"
    || (territoryElement && directChildren(territoryElement).length > 0)) {
    diagnostics.push("SchemeTerritory qualifier shall be a locally recognized simple country or grouping code.");
  }

  const mimeElement = recognized.find((element) => local(element) === "MimeType");
  values.mimeType = text(mimeElement);
  if (values.mimeType !== ETSI_TSL_MIME_TYPE || (mimeElement && directChildren(mimeElement).length > 0)) {
    diagnostics.push(`MimeType qualifier shall be the exact registered value ${ETSI_TSL_MIME_TYPE}.`);
  }
  return { diagnostics, values };
}

function dispatchCheck(id: string, pointerType: string | undefined, sourceNamespace: string | null): CheckResult {
  const expectedArtifactKind = pointerType === EU_GENERIC
    ? "ts119612_xml_tsl"
    : pointerType === EU_LIST_OF_LISTS ? "ts119612_xml_lotl" : undefined;
  if (!expectedArtifactKind) {
    const syntax = validateTs119602Uri(pointerType);
    return check(id, "profile", syntax.outcome === "valid" ? "inconclusive" : "fail",
      syntax.outcome === "valid" ? "warning" : "error",
      syntax.outcome === "valid"
        ? "Pointer TSLType is absolute, but no locally supported target profile dispatch is registered for it."
        : "Pointer TSLType cannot select a target profile because it is not a valid absolute URI.",
      { pointerType: pointerType ?? null, supportedTypes: [EU_GENERIC, EU_LIST_OF_LISTS], targetDereferenced: false });
  }
  if (sourceNamespace !== CANONICAL_TSL_NAMESPACE) {
    return check(id, "profile", "warn", "warning",
      "Pointer type is recognized, but the source uses a compatibility namespace whose normative target binding is not established.",
      { pointerType, expectedArtifactKind, sourceNamespace, canonicalNamespace: CANONICAL_TSL_NAMESPACE, targetDereferenced: false });
  }
  return check(id, "profile", "pass", "info",
    "Pointer type and canonical namespace select a supported target artifact profile.",
    { pointerType, expectedArtifactKind, expectedRoot: "TrustServiceStatusList", expectedNamespace: CANONICAL_TSL_NAMESPACE, targetDereferenced: false });
}

function signingCertificateCheck(
  id: string,
  certificates: ParsedCertificate[],
  qualifiers: { operatorNames: string[]; territory?: string },
): CheckResult {
  if (certificates.length === 0) return check(id, "certificates", "fail", "critical",
    "No parsed pointer certificate is available to authenticate the pointed-list signer.",
    { certificateCount: 0, targetSignatureChecked: false });
  const operatorMatches = certificates.map((certificate) => {
    const organizations = certificate.subject.get("O") ?? [];
    return {
      fingerprintSha256: certificate.summary.fingerprintSha256,
      organizations,
      matches: organizations.some((organization) => qualifiers.operatorNames.some((name) => normalizeText(organization) === normalizeText(name))),
    };
  });
  const territoryMatches = qualifiers.territory && qualifiers.territory !== "EU"
    ? certificates.map((certificate) => ({
      fingerprintSha256: certificate.summary.fingerprintSha256,
      countries: certificate.subject.get("C") ?? [],
      matches: (certificate.subject.get("C") ?? []).includes(qualifiers.territory as string),
    }))
    : [];
  const valid = operatorMatches.every((entry) => entry.matches) && territoryMatches.every((entry) => entry.matches);
  return result(id, "certificates", valid,
    "Pointer signing certificates match the declared scheme operator and locally comparable territory metadata.",
    "Every pointer signing certificate shall match the declared pointed-list scheme operator and locally comparable territory metadata.",
    { operatorNames: qualifiers.operatorNames, territory: qualifiers.territory ?? null, operatorMatches, territoryMatches, targetSignatureChecked: false },
    "critical");
}

function rolloverCheck(id: string, certificates: ParsedCertificate[], assessmentDate: Date): CheckResult {
  const distinctKeys = new Set(certificates.map((certificate) => certificate.publicKeySha256));
  const intervals = new Set(certificates.map((certificate) => `${certificate.summary.notBefore}/${certificate.summary.notAfter}`));
  const validNow = certificates.filter((certificate) => certificate.summary.validAtAssessmentTime).length;
  const evidence = {
    annexAInformativeProcedure: true,
    certificateCount: certificates.length,
    distinctPublicKeyCount: distinctKeys.size,
    distinctValidityIntervalCount: intervals.size,
    validAtAssessmentCount: validNow,
    assessmentDate: assessmentDate.toISOString(),
    minimumTemporalSeparationNotQuantifiedByStandard: true,
  };
  if (certificates.length >= 2 && distinctKeys.size >= 2 && intervals.size >= 2 && validNow > 0) {
    return check(id, "certificates", "pass", "info",
      "Pointer contains at least two distinct signing keys with shifted validity evidence and a currently valid certificate.", evidence);
  }
  return check(id, "certificates", "warn", "warning",
    "Annex A rollover continuity evidence is incomplete: use at least two distinct key pairs with shifted validity and keep a currently valid certificate.", evidence);
}

function authenticationCheck(pointerCount: number): CheckResult {
  return check("ts119612.scheme.pointers.authentication", "certificates", pointerCount > 0 ? "not_checked" : "not_applicable",
    pointerCount > 0 ? "warning" : "info",
    pointerCount > 0
      ? "Pointed-list signer authentication was not checked because no dereferenced target artifact was supplied to this local assessment."
      : "Pointed-list authentication is not applicable because no pointer is present.",
    { pointerCount, targetDereferenced: false, requiredMatch: "SHA-256 digest of the actual signing certificate against a declared pointer certificate" });
}

function dnMap(dn: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  dn.split(/\n|,(?=[A-Za-z][A-Za-z0-9.]*=)/).forEach((part) => {
    const match = /^\s*([^=]+)=(.*)\s*$/.exec(part);
    if (!match) return;
    const key = match[1].trim().toUpperCase();
    const current = result.get(key) ?? [];
    current.push(match[2].trim());
    result.set(key, current);
  });
  return result;
}

function normalizeDn(dn: string): string {
  return [...dnMap(dn)].flatMap(([key, values]) => values.map((value) => `${key}=${normalizeText(value)}`)).sort().join(",");
}
function normalizeText(value: string): string { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en"); }
function directChildren(parent: Node): Element[] { return Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1); }
function namedChildren(parent: Element, name: string): Element[] { return directChildren(parent).filter((element) => local(element) === name && element.namespaceURI === parent.namespaceURI); }
function namedChild(parent: Element, name: string): Element | undefined { return namedChildren(parent, name)[0]; }
function local(element: Element): string { return element.localName || element.nodeName.split(":").at(-1) as string; }
function qname(element: Element): string { return `{${element.namespaceURI ?? ""}}${local(element)}`; }
function text(element: Element | undefined): string | undefined { const value = element?.textContent?.trim(); return value || undefined; }
function isString(value: string | undefined): value is string { return Boolean(value); }
function result(id: string, category: CheckResult["category"], valid: boolean, passMessage: string, failMessage: string, evidence?: unknown, severity: "error" | "critical" = "error"): CheckResult {
  return check(id, category, valid ? "pass" : "fail", valid ? "info" : severity, valid ? passMessage : failMessage, evidence);
}
function check(id: string, category: CheckResult["category"], status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult {
  return { id, category, status, severity, message, evidence };
}
