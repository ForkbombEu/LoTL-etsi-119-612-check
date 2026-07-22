import { createHash, createPublicKey, X509Certificate } from "node:crypto";
import {
  ADDITIONAL_INFORMATION_INAPPLICABLE_TYPES,
  CA_SERVICE_TYPES,
  CRL_SERVICE_TYPES,
  EXPIRED_CERT_SERVICE_TYPES,
  QUALIFIED_CA_SERVICE_TYPE,
  QUALIFIER_CONFLICTS,
  TS119612_ADDITIONAL_INFORMATION,
  TS119612_KEY_USAGE_NAMES,
  TS119612_QUALIFIERS,
  TS119612_SERVICE_STATUSES,
} from "../standards/ts119612ServiceSemantics.js";
import { classifyTs119612ServiceType } from "../standards/ts119612ServiceTypes.js";
import { validateTs119602MultilingualValues, validateTs119602Uri, validateTs119602UtcDateTime } from "../standards/ts119602Syntax.js";
import type { CheckResult } from "../types.js";

const TSL_NS = "http://uri.etsi.org/02231/v2#";
const QUALIFICATIONS_NS = "http://uri.etsi.org/TrstSvc/SvcInfoExt/eSigDir-1999-93-EC-TrustedList/#";
const ADDITIONAL_TYPES_NS = "http://uri.etsi.org/02231/v2/additionaltypes#";
const XML_LANG = "http://www.w3.org/XML/1998/namespace";

export interface Ts119612CertificateIdentityEvidence {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  fingerprintSha256: string;
  publicKeySha256: string;
  subjectKeyIdentifier?: string;
  keyUsage: string[];
  isCertificateAuthority: boolean;
  selfSigned: boolean;
  subjectDn: Map<string, string[]>;
}

export interface Ts119612DigitalIdentityEvidence {
  certificates: Ts119612CertificateIdentityEvidence[];
  certificateValues: string[];
  subjects: string[];
  skis: string[];
  keyHashes: string[];
  diagnostics: string[];
}

export function assessTs119612ServiceSemantics(document: Document): CheckResult[] {
  const checks: CheckResult[] = [];
  const seen = new Map<string, string>();
  const services = descendants(document.documentElement, "TSPService", TSL_NS);
  services.forEach((service, serviceIndex) => {
    const prefix = `ts119612.service.${providerNumber(service)}.${serviceNumber(service)}`;
    const information = child(service, "ServiceInformation", TSL_NS);
    if (!information) return;
    const serviceType = value(child(information, "ServiceTypeIdentifier", TSL_NS));
    const status = value(child(information, "ServiceStatus", TSL_NS));
    const statusStart = strictDate(value(child(information, "StatusStartingTime", TSL_NS)));
    const tsp = ancestor(service, "TrustServiceProvider");
    const tspNames = tsp ? descendants(child(tsp, "TSPInformation", TSL_NS), "Name", TSL_NS).map(value).filter(isString) : [];
    const identity = inspectTs119612DigitalIdentity(child(information, "ServiceDigitalIdentity", TSL_NS));

    checks.push(identityResult(`${prefix}.identity_equivalence`, identity));
    checks.push(certificateRoleResult(`${prefix}.certificate_role`, serviceType, identity.certificates));
    checks.push(subjectMatchResult(`${prefix}.certificate_subject_tsp_name`, identity.certificates, tspNames,
      Boolean(child(information, "SchemeServiceDefinitionURI", TSL_NS))));

    new Set(identity.keyHashes).forEach((hash) => {
      const key = `${serviceType ?? ""}\0${hash}`;
      const prior = seen.get(key);
      if (prior) {
        checks.push(check("ts119612.service.identity_uniqueness", "certificates", "fail", "critical",
          "The same public key is used by separate services with the same ServiceTypeIdentifier.",
          { firstService: prior, duplicateService: prefix, serviceType, publicKeySha256: hash }));
      } else {
        seen.set(key, prefix);
      }
    });

    const extensions = child(information, "ServiceInformationExtensions", TSL_NS);
    if (extensions) assessExtensions(extensions, serviceType, prefix, checks);
    assessHistory(service, serviceType, status, statusStart, identity, prefix, checks);
    if (serviceIndex === services.length - 1 && !checks.some((item) => item.id === "ts119612.service.identity_uniqueness")) {
      checks.push(check("ts119612.service.identity_uniqueness", "certificates", "pass", "info",
        "No public key is duplicated across separate services with the same service type.",
        { assessedServiceCount: services.length, comparedPublicKeyCount: [...seen.keys()].length }));
    }
  });
  return checks;
}

function assessHistory(
  service: Element,
  currentType: string | undefined,
  currentStatus: string | undefined,
  currentStart: Date | undefined,
  currentIdentity: Ts119612DigitalIdentityEvidence,
  prefix: string,
  checks: CheckResult[],
): void {
  const history = child(service, "ServiceHistory", TSL_NS);
  if (!history) {
    checks.push(check(`${prefix}.history.structure`, "services", "not_checked", "warning",
      "ServiceHistory is absent; local evidence cannot establish whether a previous state should have been retained.",
      { historyPresent: false, previousStatesKnown: false }));
    return;
  }
  const instances = children(history, "ServiceHistoryInstance", TSL_NS);
  checks.push(result(`${prefix}.history.structure`, "services",
    instances.length > 0 && elementChildren(history).length === instances.length,
    "ServiceHistory is a non-empty sequence of history instances.",
    "ServiceHistory shall contain only a non-empty sequence of ServiceHistoryInstance elements.",
    { instanceCount: instances.length }, "critical"));

  let newerStart = currentStart;
  let newerStatus = currentStatus;
  instances.forEach((instance, index) => {
    const itemPrefix = `${prefix}.history.${index + 1}`;
    const direct = elementChildren(instance);
    const names = direct.map(local);
    const expected = ["ServiceTypeIdentifier", "ServiceName", "ServiceDigitalIdentity", "ServiceStatus", "StatusStartingTime", "ServiceInformationExtensions"];
    const counts = expected.map((name) => children(instance, name, TSL_NS).length);
    const structureValid = counts.slice(0, 5).every((count) => count === 1)
      && counts[5] <= 1 && orderedNames(names, expected) && direct.length === counts.reduce((sum, count) => sum + count, 0);
    checks.push(result(`${itemPrefix}.structure`, "structure", structureValid,
      "Historical service instance has exact ordered mandatory content.",
      "Historical service instance has invalid direct order or cardinality.", { observedChildren: names }, "critical"));

    const typeValue = value(child(instance, "ServiceTypeIdentifier", TSL_NS));
    const classification = classifyTs119612ServiceType(typeValue);
    checks.push(classification === "custom"
      ? check(`${itemPrefix}.type`, "services", "inconclusive", "warning",
        "Historical service type is an absolute custom URI whose registration cannot be established locally.", { value: typeValue })
      : result(`${itemPrefix}.type`, "services", Boolean(typeValue) && typeValue === currentType,
        "Historical service type is registered and matches the current service.",
        "Historical service type shall be registered and identify the same service type.",
        { value: typeValue, currentType }, "error"));

    const nameElement = child(instance, "ServiceName", TSL_NS);
    const namesValues = nameElement ? children(nameElement, "Name", TSL_NS) : [];
    const multilingual = validateTs119602MultilingualValues(namesValues.map((entry) => ({
      language: entry.getAttributeNS(XML_LANG, "lang") ?? entry.getAttribute("xml:lang"), value: value(entry),
    })));
    checks.push(result(`${itemPrefix}.name`, "services", namesValues.length > 0 && multilingual.outcome === "valid",
      "Historical ServiceName has valid multilingual local syntax.",
      "Historical ServiceName shall be a non-empty valid multilingual name.", multilingual.diagnostics));

    const historyIdentity = inspectTs119612DigitalIdentity(child(instance, "ServiceDigitalIdentity", TSL_NS));
    const currentSkis = new Set(currentIdentity.certificates.map((cert) => cert.subjectKeyIdentifier).filter(isString));
    const identityValid = historyIdentity.certificateValues.length === 0 && historyIdentity.skis.length > 0
      && historyIdentity.skis.every((ski) => currentSkis.size === 0 || currentSkis.has(ski));
    checks.push(result(`${itemPrefix}.digital_identity`, "certificates", identityValid,
      "Historical identity omits certificates, retains X509SKI, and matches the current certificate where comparable.",
      "Historical identity shall contain X509SKI, shall not contain X509Certificate, and shall remain equivalent to the service identity.",
      { certificateCount: historyIdentity.certificateValues.length, skis: historyIdentity.skis, currentCertificateSkis: [...currentSkis] }, "critical"));

    const previousStatus = value(child(instance, "ServiceStatus", TSL_NS));
    checks.push(result(`${itemPrefix}.status`, "services", Boolean(previousStatus && TS119612_SERVICE_STATUSES.has(previousStatus)),
      "Historical ServiceStatus is registered.", "Historical ServiceStatus is not in the registered vocabulary.",
      { value: previousStatus }, "error"));
    const previousStartValue = value(child(instance, "StatusStartingTime", TSL_NS));
    const previousStart = strictDate(previousStartValue);
    checks.push(result(`${itemPrefix}.status_start`, "dates", Boolean(previousStart && newerStart && previousStart < newerStart),
      "Historical status time is strict UTC and precedes the next newer state.",
      "Historical status times shall be strict UTC and ordered newest-to-oldest before the current state.",
      { value: previousStartValue, nextNewerStatusStart: newerStart?.toISOString() }, "error"));
    checks.push(transitionResult(`${itemPrefix}.status_transition`, currentType, previousStatus, newerStatus));

    const historyExtensions = child(instance, "ServiceInformationExtensions", TSL_NS);
    if (historyExtensions) assessExtensions(historyExtensions, typeValue, itemPrefix, checks);
    else checks.push(check(`${itemPrefix}.extensions`, "services", "not_applicable", "info",
      "Historical service extensions are optional and absent."));
    newerStart = previousStart;
    newerStatus = previousStatus;
  });
  checks.push(check(`${prefix}.history.retention`, "services", "inconclusive", "warning",
    "Presented history is locally ordered, but a single TL cannot prove that every prior state was retained.",
    { observedInstanceCount: instances.length, priorTrustedListsCompared: false,
      historicalInformationPeriod: value(descendants(service.ownerDocument, "HistoricalInformationPeriod", TSL_NS)[0]) ?? null }));
}

function transitionResult(id: string, serviceType: string | undefined, older: string | undefined, newer: string | undefined): CheckResult {
  if (!older || !newer || !TS119612_SERVICE_STATUSES.has(older) || !TS119612_SERVICE_STATUSES.has(newer)) {
    return check(id, "services", "inconclusive", "warning", "Status transition cannot be assessed because a status is absent or unregistered.", { older, newer });
  }
  if (older === newer) return check(id, "services", "fail", "error", "Adjacent historical states shall represent an actual status change.", { older, newer });
  const family = classifyTs119612ServiceType(serviceType);
  const expected = family === "qualified"
    ? ["granted", "withdrawn"]
    : family === "non_qualified" || family === "national"
      ? ["recognisedatnationallevel", "deprecatedatnationallevel"] : undefined;
  if (!expected) return check(id, "services", "inconclusive", "warning", "Custom service-type transition policy is not available locally.", { older, newer });
  const suffix = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);
  const pair = [suffix(older), suffix(newer)];
  if (pair[0] === expected[0] && pair[1] === expected[1]) {
    return check(id, "services", "pass", "info", "Status transition follows the registered current service-family progression.", { older, newer });
  }
  return check(id, "services", "inconclusive", "warning",
    "Statuses are registered but this transition may depend on legacy EU migration or scheme context not inferred locally.",
    { older, newer, expectedModernProgression: expected, annexJMigrationChecked: false });
}

function assessExtensions(container: Element, serviceType: string | undefined, prefix: string, checks: CheckResult[]): void {
  children(container, "Extension", TSL_NS).forEach((extension, index) => {
    const content = elementChildren(extension)[0];
    if (!content) return;
    const id = `${prefix}.extension.${index + 1}`;
    const critical = ["true", "1"].includes(extension.getAttribute("Critical") ?? "");
    if (content.namespaceURI === TSL_NS && local(content) === "ExpiredCertsRevocationInfo") {
      const date = value(content);
      const localSyntaxValid = !critical && Boolean(strictDate(date));
      const typeClassification = classifyTs119612ServiceType(serviceType);
      if (localSyntaxValid && typeClassification === "custom") {
        checks.push(check(`${id}.expired_certs`, "services", "inconclusive", "warning",
          "ExpiredCertsRevocationInfo is non-critical with valid UTC syntax, but custom service-type applicability requires its registered definition.",
          { serviceType, critical, value: date, customApplicabilityDefinitionChecked: false }));
      } else {
        checks.push(result(`${id}.expired_certs`, "services",
          localSyntaxValid && Boolean(serviceType && EXPIRED_CERT_SERVICE_TYPES.has(serviceType)),
          "ExpiredCertsRevocationInfo has valid applicability, non-criticality and UTC time.",
          "ExpiredCertsRevocationInfo has invalid applicability, criticality or UTC time.",
          { serviceType, critical, value: date, customApplicabilityDefinitionChecked: false }));
      }
    } else if (content.namespaceURI === QUALIFICATIONS_NS && local(content) === "Qualifications") {
      checks.push(qualificationsResult(`${id}.qualifications`, content, serviceType));
    } else if (content.namespaceURI === ADDITIONAL_TYPES_NS && local(content) === "TakenOverBy") {
      checks.push(takenOverResult(`${id}.taken_over_by`, content, critical));
    } else if (content.namespaceURI === TSL_NS && local(content) === "AdditionalServiceInformation") {
      checks.push(additionalInformationResult(`${id}.additional_information`, content, serviceType));
    }
  });
}

function qualificationsResult(id: string, qualifications: Element, serviceType: string | undefined): CheckResult {
  const diagnostics: string[] = [];
  const elements = children(qualifications, "QualificationElement", QUALIFICATIONS_NS);
  if (serviceType !== QUALIFIED_CA_SERVICE_TYPE) diagnostics.push("Qualifications is only applicable to CA/QC services.");
  if (elements.length === 0 || elementChildren(qualifications).length !== elements.length) diagnostics.push("Qualifications requires a non-empty QualificationElement sequence.");
  const observedQualifiers: string[] = [];
  elements.forEach((element, index) => {
    const direct = elementChildren(element);
    if (direct.length !== 2 || local(direct[0]) !== "Qualifiers" || local(direct[1]) !== "CriteriaList") diagnostics.push(`QualificationElement ${index + 1} shall contain Qualifiers followed by CriteriaList.`);
    const qualifiers = direct[0] ? descendants(direct[0], "Qualifier", QUALIFICATIONS_NS)
      .map((qualifier) => qualifier.getAttribute("uri") ?? undefined).filter(isString) : [];
    if (qualifiers.length === 0) diagnostics.push(`QualificationElement ${index + 1} has no qualifier.`);
    qualifiers.forEach((qualifier) => { observedQualifiers.push(qualifier); if (!TS119612_QUALIFIERS.has(qualifier)) diagnostics.push(`Qualifier ${qualifier} is not registered.`); });
    const criteria = direct[1];
    const assertion = criteria?.getAttribute("assert");
    if (!criteria || !["all", "atLeastOne", "none"].includes(assertion ?? "")) diagnostics.push(`QualificationElement ${index + 1} CriteriaList has invalid assert.`);
    if (criteria && elementChildren(criteria).filter((entry) => local(entry) !== "Description").length === 0) diagnostics.push(`QualificationElement ${index + 1} CriteriaList has no assertion criterion.`);
    descendants(criteria, "KeyUsage", QUALIFICATIONS_NS).forEach((keyUsage) => {
      const bits = elementChildren(keyUsage);
      if (bits.length === 0 || bits.length > 9) diagnostics.push("KeyUsage shall contain one to nine bits.");
      bits.forEach((bit) => {
        const name = bit.getAttribute("name") ?? undefined;
        const bitValue = value(bit);
        if (!name || !TS119612_KEY_USAGE_NAMES.has(name) || !["true", "false", "1", "0"].includes(bitValue ?? "")) diagnostics.push("KeyUsage contains an invalid name or boolean value.");
      });
    });
    descendants(criteria, "PolicySet", QUALIFICATIONS_NS).forEach((set) => {
      if (elementChildren(set).length === 0) diagnostics.push("PolicySet shall contain at least one policy identifier.");
    });
  });
  QUALIFIER_CONFLICTS.forEach(([left, right]) => {
    if (observedQualifiers.includes(left) && observedQualifiers.includes(right)) diagnostics.push(`Conflicting qualifiers ${left} and ${right} are both present.`);
  });
  return result(id, "services", diagnostics.length === 0,
    "Qualifications uses the registered CA/QC vocabulary and valid criteria structure.",
    "Qualifications violates CA/QC applicability, qualifier vocabulary or criteria structure.",
    { serviceType, qualifiers: observedQualifiers, diagnostics, certificateQualificationNecessityChecked: false, customCriteriaSemanticsChecked: false });
}

function takenOverResult(id: string, takenOver: Element, critical: boolean): CheckResult {
  const uri = child(takenOver, "URI", ADDITIONAL_TYPES_NS);
  const tspName = child(takenOver, "TSPName", ADDITIONAL_TYPES_NS);
  const operator = child(takenOver, "SchemeOperatorName", TSL_NS);
  const territory = value(child(takenOver, "SchemeTerritory", TSL_NS));
  const uriSyntax = validateTs119602Uri(value(uri));
  const valid = Boolean(uri && tspName && operator && territory && /^[A-Z]{2}$/.test(territory)) && uriSyntax.outcome === "valid";
  return valid
    ? check(id, "services", "inconclusive", "warning",
      "TakenOverBy has valid local identity and URI structure; takeover authorization and target-list consistency require external evidence.",
      { critical, targetUri: value(uri), territory, targetFetched: false, takeoverAuthorizationChecked: false })
    : check(id, "services", "fail", "error", "TakenOverBy has invalid mandatory local structure.",
      { critical, targetUri: value(uri), territory, diagnostics: uriSyntax.diagnostics });
}

function additionalInformationResult(id: string, info: Element, serviceType: string | undefined): CheckResult {
  const direct = elementChildren(info);
  const uri = value(direct[0]);
  const validStructure = direct.length >= 1 && direct.length <= 3 && local(direct[0]) === "URI"
    && (direct[1] === undefined || local(direct[1]) === "InformationValue")
    && (direct[2] === undefined || local(direct[2]) === "OtherInformation")
    && validateTs119602Uri(uri).outcome === "valid";
  const registered = Boolean(uri && TS119612_ADDITIONAL_INFORMATION.has(uri));
  const rootCaValid = !uri?.endsWith("RootCA-QC") || serviceType === QUALIFIED_CA_SERVICE_TYPE;
  const prohibited = Boolean(serviceType && ADDITIONAL_INFORMATION_INAPPLICABLE_TYPES.has(serviceType)
    && uri && TS119612_ADDITIONAL_INFORMATION.has(uri) && !uri.endsWith("RootCA-QC"));
  if (!validStructure || !rootCaValid || prohibited) return check(id, "services", "fail", "error",
    "AdditionalServiceInformation violates structure or registered service-type dependencies.", { uri, serviceType, registered, validStructure });
  return check(id, "services", registered ? "pass" : "inconclusive", registered ? "info" : "warning",
    registered ? "AdditionalServiceInformation uses a registered identifier with valid service-type dependencies."
      : "AdditionalServiceInformation URI is absolute, but custom registration and meaning cannot be established locally.",
    { uri, serviceType, registered, customRegistrationChecked: false });
}

export function inspectTs119612DigitalIdentity(
  identity: Element | undefined,
  namespace = TSL_NS,
): Ts119612DigitalIdentityEvidence {
  const digitalIds = identity ? children(identity, "DigitalId", namespace) : [];
  const certificateValues = digitalIds.flatMap((digitalId) => children(digitalId, "X509Certificate").map(value).filter(isString));
  const subjects = digitalIds.flatMap((digitalId) => children(digitalId, "X509SubjectName").map(value).filter(isString));
  const skis = digitalIds.flatMap((digitalId) => children(digitalId, "X509SKI").map(value).filter(isString).map(normalizeBinary));
  const certificates: Ts119612CertificateIdentityEvidence[] = [];
  const diagnostics: string[] = [];
  certificateValues.forEach((encoded, index) => {
    try { certificates.push(certificateEvidence(encoded)); } catch { diagnostics.push(`X509Certificate ${index + 1} could not be parsed.`); }
  });
  const keyHashes = digitalIds.flatMap((digitalId, index) => {
    const keyValue = children(digitalId, "KeyValue").at(0);
    if (!keyValue) return [];
    try { return [rsaKeyHash(keyValue)]; } catch { diagnostics.push(`KeyValue ${index + 1} could not be compared as an RSA public key.`); return []; }
  });
  if (certificates.length > 0) {
    const primary = certificates[0];
    certificates.slice(1).forEach((cert) => {
      if (cert.publicKeySha256 !== primary.publicKeySha256 || normalizeDn(cert.subject) !== normalizeDn(primary.subject)) diagnostics.push("Multiple certificates do not have the same public key and subject.");
    });
    subjects.forEach((subject) => { if (normalizeDn(subject) !== normalizeDn(primary.subject)) diagnostics.push("X509SubjectName does not match the certificate subject."); });
    skis.forEach((ski) => { if (!primary.subjectKeyIdentifier || ski !== primary.subjectKeyIdentifier) diagnostics.push("X509SKI does not match the certificate SubjectKeyIdentifier."); });
    keyHashes.forEach((hash) => { if (hash !== primary.publicKeySha256) diagnostics.push("KeyValue does not match the certificate public key."); });
  }
  return { certificates, certificateValues, subjects, skis, keyHashes: [...certificates.map((cert) => cert.publicKeySha256), ...keyHashes], diagnostics };
}

function identityResult(id: string, identity: Ts119612DigitalIdentityEvidence): CheckResult {
  return result(id, "certificates", identity.diagnostics.length === 0,
    "Service identity representations are mutually equivalent where locally comparable.",
    "Service identity representations are not mutually equivalent.",
    { certificateCount: identity.certificates.length, subjectCount: identity.subjects.length, skiCount: identity.skis.length,
      publicKeySha256: [...new Set(identity.keyHashes)], certificates: identity.certificates.map(publicCertificateEvidence), diagnostics: identity.diagnostics }, "critical");
}

function certificateRoleResult(id: string, serviceType: string | undefined, certificates: Ts119612CertificateIdentityEvidence[]): CheckResult {
  if (certificates.length === 0) return check(id, "certificates", "not_applicable", "info", "No X.509 certificate is present for certificate-role assessment.", { serviceType });
  const required = CA_SERVICE_TYPES.has(serviceType ?? "") ? "keyCertSign" : CRL_SERVICE_TYPES.has(serviceType ?? "") ? "crlSign" : undefined;
  if (!required) return check(id, "certificates", "inconclusive", "warning", "Certificate evidence was extracted, but this service type has no locally asserted certificate-purpose rule.",
    { serviceType, certificates: certificates.map(publicCertificateEvidence), chainValidationChecked: false, revocationChecked: false });
  const valid = certificates.every((cert) => (required !== "keyCertSign" || cert.isCertificateAuthority) && cert.keyUsage.includes(required));
  return result(id, "certificates", valid,
    "Certificate basic constraints and key usage support the registered service role.",
    "Certificate basic constraints or key usage do not support the registered service role.",
    { serviceType, requiredKeyUsage: required, certificates: certificates.map(publicCertificateEvidence), chainValidationChecked: false, revocationChecked: false }, "critical");
}

function subjectMatchResult(id: string, certificates: Ts119612CertificateIdentityEvidence[], tspNames: string[], hasSchemeDefinition: boolean): CheckResult {
  if (certificates.length === 0) return check(id, "certificates", "not_applicable", "info", "No certificate subject organization is present for TSP-name comparison.");
  const organizations = certificates.flatMap((cert) => cert.subjectDn.get("O") ?? []);
  const matches = organizations.some((org) => tspNames.some((name) => normalizeText(org) === normalizeText(name)));
  if (matches) return check(id, "certificates", "pass", "info", "Certificate subject organization matches a TSPName value.", { organizations, tspNames });
  return check(id, "certificates", hasSchemeDefinition ? "inconclusive" : "fail", hasSchemeDefinition ? "warning" : "error",
    hasSchemeDefinition
      ? "Certificate organization differs from TSPName; the referenced scheme definition was not fetched to check an allowed formal statement."
      : "Certificate subject organization does not match TSPName and no SchemeServiceDefinitionURI fallback is present.",
    { organizations, tspNames, hasSchemeDefinition, schemeDefinitionFetched: false });
}

function certificateEvidence(encoded: string): Ts119612CertificateIdentityEvidence {
  const raw = Buffer.from(encoded.replace(/\s+/g, ""), "base64");
  const certificate = new X509Certificate(raw);
  const publicKey = certificate.publicKey.export({ type: "spki", format: "der" });
  const extensions = certificateExtensions(raw);
  return {
    subject: certificate.subject, issuer: certificate.issuer, serialNumber: certificate.serialNumber,
    notBefore: new Date(certificate.validFrom).toISOString(), notAfter: new Date(certificate.validTo).toISOString(),
    fingerprintSha256: certificate.fingerprint256.replaceAll(":", "").toLowerCase(),
    publicKeySha256: sha256(publicKey), subjectKeyIdentifier: extensions.ski,
    keyUsage: extensions.keyUsage, isCertificateAuthority: certificate.ca,
    selfSigned: normalizeDn(certificate.subject) === normalizeDn(certificate.issuer) && certificate.verify(certificate.publicKey),
    subjectDn: dnMap(certificate.subject),
  };
}

function publicCertificateEvidence(cert: Ts119612CertificateIdentityEvidence): Record<string, unknown> {
  return { subject: cert.subject, issuer: cert.issuer, serialNumber: cert.serialNumber, notBefore: cert.notBefore, notAfter: cert.notAfter,
    fingerprintSha256: cert.fingerprintSha256, publicKeySha256: cert.publicKeySha256, subjectKeyIdentifier: cert.subjectKeyIdentifier,
    keyUsage: cert.keyUsage, isCertificateAuthority: cert.isCertificateAuthority, selfSigned: cert.selfSigned };
}

function rsaKeyHash(keyValue: Element): string {
  const modulus = value(descendants(keyValue, "Modulus")[0]);
  const exponent = value(descendants(keyValue, "Exponent")[0]);
  if (!modulus || !exponent) throw new Error("Only RSA KeyValue is supported.");
  const key = createPublicKey({ key: { kty: "RSA", n: base64Url(modulus), e: base64Url(exponent) }, format: "jwk" });
  return sha256(key.export({ type: "spki", format: "der" }));
}

function certificateExtensions(raw: Buffer): { ski?: string; keyUsage: string[] } {
  const certificate = tlv(raw, 0);
  const tbs = tlv(raw, certificate.contentStart);
  let offset = tbs.contentStart;
  let ski: string | undefined;
  let keyUsage: string[] = [];
  while (offset < tbs.end) {
    const item = tlv(raw, offset);
    if (item.tag === 0xa3) {
      const sequence = tlv(raw, item.contentStart);
      let extensionOffset = sequence.contentStart;
      while (extensionOffset < sequence.end) {
        const extension = tlv(raw, extensionOffset);
        const oid = tlv(raw, extension.contentStart);
        let valueOffset = oid.end;
        const maybeCritical = tlv(raw, valueOffset);
        if (maybeCritical.tag === 0x01) valueOffset = maybeCritical.end;
        const octets = tlv(raw, valueOffset);
        const oidHex = raw.subarray(oid.contentStart, oid.end).toString("hex");
        if (oidHex === "551d0e") {
          const inner = tlv(raw, octets.contentStart);
          ski = raw.subarray(inner.contentStart, inner.end).toString("hex");
        } else if (oidHex === "551d0f") {
          const bits = tlv(raw, octets.contentStart);
          keyUsage = decodeKeyUsage(raw.subarray(bits.contentStart + 1, bits.end));
        }
        extensionOffset = extension.end;
      }
    }
    offset = item.end;
  }
  return { ski, keyUsage };
}

function decodeKeyUsage(bits: Buffer): string[] {
  const names = ["digitalSignature", "nonRepudiation", "keyEncipherment", "dataEncipherment", "keyAgreement", "keyCertSign", "crlSign", "encipherOnly", "decipherOnly"];
  return names.filter((_name, index) => Boolean(bits[Math.floor(index / 8)] & (0x80 >> (index % 8))));
}

function tlv(data: Buffer, offset: number): { tag: number; contentStart: number; end: number } {
  if (offset + 2 > data.length) throw new Error("Invalid DER.");
  const tag = data[offset];
  const firstLength = data[offset + 1];
  let length = firstLength;
  let contentStart = offset + 2;
  if (firstLength & 0x80) {
    const octets = firstLength & 0x7f;
    if (octets === 0 || octets > 4 || contentStart + octets > data.length) throw new Error("Invalid DER length.");
    length = 0;
    for (let index = 0; index < octets; index += 1) length = (length * 256) + data[contentStart + index];
    contentStart += octets;
  }
  if (contentStart + length > data.length) throw new Error("Invalid DER bounds.");
  return { tag, contentStart, end: contentStart + length };
}

function dnMap(dn: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  dn.split(/\n|,(?=[A-Za-z][A-Za-z0-9.]*=)/).forEach((part) => {
    const match = /^\s*([^=]+)=(.*)\s*$/.exec(part);
    if (!match) return;
    const values = result.get(match[1].trim()) ?? [];
    values.push(match[2].trim()); result.set(match[1].trim(), values);
  });
  return result;
}

function normalizeDn(dn: string): string {
  return [...dnMap(dn)].flatMap(([key, values]) => values.map((entry) => `${key.toUpperCase()}=${normalizeText(entry)}`)).sort().join(",");
}
function normalizeText(text: string): string { return text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en"); }
function normalizeBinary(text: string): string { return Buffer.from(text.replace(/\s+/g, ""), "base64").toString("hex"); }
function base64Url(text: string): string { return Buffer.from(text.replace(/\s+/g, ""), "base64").toString("base64url"); }
function sha256(data: NodeJS.ArrayBufferView): string { return createHash("sha256").update(data).digest("hex"); }
function strictDate(text: string | undefined): Date | undefined { return validateTs119602UtcDateTime(text).outcome === "valid" ? new Date(text as string) : undefined; }
function providerNumber(service: Element): number { const tsp = ancestor(service, "TrustServiceProvider"); return tsp ? siblings(tsp, "TrustServiceProvider").indexOf(tsp) + 1 : 1; }
function serviceNumber(service: Element): number { return siblings(service, "TSPService").indexOf(service) + 1; }
function siblings(element: Element, name: string): Element[] { return element.parentElement ? children(element.parentElement, name, element.namespaceURI ?? undefined) : [element]; }
function ancestor(element: Element, name: string): Element | undefined { let current = element.parentElement; while (current) { if (local(current) === name) return current; current = current.parentElement; } return undefined; }
function orderedNames(observed: string[], expected: string[]): boolean { const positions = observed.map((name) => expected.indexOf(name)); return positions.every((position, index) => position >= 0 && (index === 0 || position >= positions[index - 1])); }
function descendants(parent: Node | undefined, name: string, namespace?: string): Element[] { if (!parent) return []; return Array.from((parent as Element).getElementsByTagNameNS(namespace ?? "*", name)); }
function elementChildren(parent: Node): Element[] { return Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1); }
function children(parent: Element, name: string, namespace?: string): Element[] { return elementChildren(parent).filter((element) => local(element) === name && (!namespace || element.namespaceURI === namespace)); }
function child(parent: Element | undefined, name: string, namespace?: string): Element | undefined { return parent ? children(parent, name, namespace)[0] : undefined; }
function local(element: Element): string { return element.localName || element.nodeName.split(":").at(-1) as string; }
function value(element: Element | undefined): string | undefined { const text = element?.textContent?.trim(); return text || undefined; }
function isString(value: string | undefined): value is string { return Boolean(value); }
function result(id: string, category: CheckResult["category"], valid: boolean, passMessage: string, failMessage: string, evidence?: unknown, severity: "error" | "critical" = "error"): CheckResult {
  return check(id, category, valid ? "pass" : "fail", valid ? "info" : severity, valid ? passMessage : failMessage, evidence);
}
function check(id: string, category: CheckResult["category"], status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult {
  return { id, category, status, severity, message, evidence };
}
