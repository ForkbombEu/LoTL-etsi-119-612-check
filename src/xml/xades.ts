import { createHash } from "node:crypto";
import { normalizeBase64Certificate } from "../certs.js";
import type { CertificateSummary, CheckResult } from "../types.js";
import { nodes } from "./xpath.js";

const XMLDSIG = "http://www.w3.org/2000/09/xmldsig#";
const XADES = "http://uri.etsi.org/01903/v1.3.2#";
const SIGNED_PROPERTIES_TYPE = "http://uri.etsi.org/01903#SignedProperties";
const ENVELOPED_TRANSFORM = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const EXCLUSIVE_CANONICALIZATION = "http://www.w3.org/2001/10/xml-exc-c14n#";
const BASELINE_CANONICALIZATION_METHODS = new Set([
  "http://www.w3.org/2006/12/xml-c14n11",
  EXCLUSIVE_CANONICALIZATION,
  "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  "http://www.w3.org/2006/12/xml-c14n11#WithComments",
  "http://www.w3.org/2001/10/xml-exc-c14n#WithComments",
  "http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments",
]);

const DIGEST_ALGORITHMS: Readonly<Record<string, string>> = Object.freeze({
  "http://www.w3.org/2000/09/xmldsig#sha1": "sha1",
  "http://www.w3.org/2001/04/xmlenc#sha256": "sha256",
  "http://www.w3.org/2001/04/xmldsig-more#sha256": "sha256",
  "http://www.w3.org/2001/04/xmldsig-more#sha384": "sha384",
  "http://www.w3.org/2001/04/xmlenc#sha512": "sha512",
});

export interface XadesAssessmentOptions {
  /** Apply EN 319 132-1 Baseline B checks. */
  requireBaselineB?: boolean;
  /** Apply the Pub-EAA XML constraints from ETSI TS 119 602 Annex H.4. */
  requireAnnexH4?: boolean;
  schemeTerritory?: string;
  schemeOperatorNames?: readonly string[];
  /** Explicitly trusted signer certificate fingerprints. No value means trust is not checked. */
  trustedSignerFingerprintsSha256?: readonly string[];
}

export function assessXadesSignature(
  document: Document,
  signatureNode: Element | undefined,
  signingCertificate: string | undefined,
  certificate: CertificateSummary | undefined,
  options: XadesAssessmentOptions,
): CheckResult[] {
  if (!options.requireBaselineB && !options.requireAnnexH4) return [];

  if (!signatureNode) {
    return [
      profileCheck("signature.xades_baseline_b.structure", options.requireBaselineB, "A signature is required before XAdES Baseline B structure can be assessed."),
      profileCheck("signature.xades_baseline_b.mandatory_elements", options.requireBaselineB, "A signature is required before XAdES Baseline B mandatory elements can be assessed."),
      profileCheck("signature.xades_baseline_b.signing_time", options.requireBaselineB, "A signature is required before the XAdES SigningTime can be assessed."),
      profileCheck("signature.xades_baseline_b.signing_certificate_reference", options.requireBaselineB, "A signature is required before SigningCertificateV2 can be assessed."),
      profileCheck("signature.xades_baseline_b.data_object_formats", options.requireBaselineB, "A signature is required before DataObjectFormat properties can be assessed."),
      profileCheck("signature.xades_baseline_b.reference_digests", options.requireBaselineB, "A signature is required before XMLDSig reference digests can be assessed."),
      profileCheck("signature.xades_baseline_b.prohibited_legacy_properties", options.requireBaselineB, "A signature is required before prohibited legacy XAdES properties can be assessed."),
      profileCheck("signature.annex_h4.enveloped", options.requireAnnexH4, "A signature is required before the Annex H.4 enveloped-signature constraint can be assessed."),
      profileCheck("signature.annex_h4.document_reference", options.requireAnnexH4, "A signature is required before the Annex H.4 document reference can be assessed."),
      profileCheck("signature.annex_h4.transforms", options.requireAnnexH4, "A signature is required before the Annex H.4 transform sequence can be assessed."),
      profileCheck("signature.annex_h4.canonicalization", options.requireAnnexH4, "A signature is required before the Annex H.4 canonicalization method can be assessed."),
      check("signature.signing_certificate_validity", "not_checked", "info", "Signing-certificate validity was not checked because no signature certificate is available.", undefined, "certificates"),
      check("signature.signer_subject.country", "not_checked", "info", "Signer country matching was not checked because no signature certificate is available."),
      check("signature.signer_subject.organization", "not_checked", "info", "Signer organization matching was not checked because no signature certificate is available."),
      signerTrustCheck(undefined, options.trustedSignerFingerprintsSha256),
    ];
  }

  const signedInfos = directChildren(signatureNode, "SignedInfo", XMLDSIG);
  const signedInfo = signedInfos[0];
  const references = signedInfo ? directChildren(signedInfo, "Reference", XMLDSIG) : [];
  const qualifyingProperties = nodes(
    signatureNode,
    `./*[local-name()='Object' and namespace-uri()='${XMLDSIG}']/*[local-name()='QualifyingProperties' and namespace-uri()='${XADES}']`,
  ) as Element[];
  const qualifyingProperty = qualifyingProperties[0];
  const signedProperties = qualifyingProperty ? directChildren(qualifyingProperty, "SignedProperties", XADES) : [];
  const signedProperty = signedProperties[0];
  const signatureId = signatureNode.getAttribute("Id") || undefined;
  const signedPropertiesId = signedProperty?.getAttribute("Id") || undefined;
  const signedPropertiesReferences = references.filter((reference) => reference.getAttribute("Type") === SIGNED_PROPERTIES_TYPE);
  const associatedSignedPropertiesReference = signedPropertiesReferences.find(
    (reference) => signedPropertiesId && reference.getAttribute("URI") === `#${signedPropertiesId}`,
  );
  const structureValid = Boolean(
    signedInfos.length === 1
    && qualifyingProperties.length === 1
    && qualifyingProperty
    && signatureId
    && qualifyingProperty.getAttribute("Target") === `#${signatureId}`
    && signedProperties.length === 1
    && signedPropertiesId
    && signedPropertiesReferences.length === 1
    && associatedSignedPropertiesReference,
  );
  const checks: CheckResult[] = [
    requiredCheck(
      "signature.xades_baseline_b.structure",
      options.requireBaselineB,
      structureValid,
      "XAdES qualifying properties are directly incorporated, target this signature, and SignedProperties is covered by the required typed reference.",
      "XAdES Baseline B structure is incomplete or the SignedProperties association is invalid.",
      {
        signedInfoCount: signedInfos.length,
        signatureId,
        qualifyingProperties: qualifyingProperties.length,
        qualifyingPropertiesTarget: qualifyingProperty?.getAttribute("Target") || undefined,
        signedProperties: signedProperties.length,
        signedPropertiesId,
        signedPropertiesReferences: signedPropertiesReferences.map(referenceEvidence),
      },
    ),
  ];

  const keyInfos = directChildren(signatureNode, "KeyInfo", XMLDSIG);
  const x509Data = keyInfos.flatMap((keyInfo) => directChildren(keyInfo, "X509Data", XMLDSIG));
  const canonicalizationMethods = signedInfo ? directChildren(signedInfo, "CanonicalizationMethod", XMLDSIG) : [];
  const canonicalizationAlgorithm = canonicalizationMethods[0]?.getAttribute("Algorithm") || undefined;
  const transformContainerCounts = references.map((reference) => directChildren(reference, "Transforms", XMLDSIG).length);
  const mandatoryElementsValid = keyInfos.length === 1
    && x509Data.length === 1
    && canonicalizationMethods.length === 1
    && Boolean(canonicalizationAlgorithm && BASELINE_CANONICALIZATION_METHODS.has(canonicalizationAlgorithm))
    && references.length >= 2
    && transformContainerCounts.every((count) => count <= 1);
  checks.push(requiredCheck(
    "signature.xades_baseline_b.mandatory_elements",
    options.requireBaselineB,
    mandatoryElementsValid,
    "The mandatory Baseline B XMLDSig containers, reference cardinality, and canonicalization method are present.",
    "XAdES Baseline B requires one KeyInfo/X509Data, one supported CanonicalizationMethod, at least two references, and at most one Transforms container per reference.",
    {
      keyInfoCount: keyInfos.length,
      x509DataCount: x509Data.length,
      canonicalizationMethodCount: canonicalizationMethods.length,
      canonicalizationAlgorithm,
      referenceCount: references.length,
      transformContainerCounts,
    },
  ));

  const signingTimes = signedProperty
    ? nodes(signedProperty, `./*[local-name()='SignedSignatureProperties' and namespace-uri()='${XADES}']/*[local-name()='SigningTime' and namespace-uri()='${XADES}']`) as Element[]
    : [];
  const signingTime = signingTimes[0]?.textContent?.trim();
  const signingTimeValid = signingTimes.length === 1 && Boolean(signingTime) && isUtcXsdDateTime(signingTime!);
  checks.push(requiredCheck(
    "signature.xades_baseline_b.signing_time",
    options.requireBaselineB,
    signingTimeValid,
    "Exactly one parseable UTC XAdES SigningTime is present.",
    "XAdES Baseline B requires exactly one parseable SigningTime containing the claimed UTC signing time.",
    { count: signingTimes.length, value: signingTime },
  ));

  const signingCertificateV2 = signedProperty
    ? nodes(signedProperty, `./*[local-name()='SignedSignatureProperties' and namespace-uri()='${XADES}']/*[local-name()='SigningCertificateV2' and namespace-uri()='${XADES}']`) as Element[]
    : [];
  const obsoleteSigningCertificates = signedProperty
    ? nodes(signedProperty, `./*[local-name()='SignedSignatureProperties' and namespace-uri()='${XADES}']/*[local-name()='SigningCertificate' and namespace-uri()='${XADES}']`)
    : [];
  const certificateReference = signingCertificateV2[0]
    ? assessSigningCertificateReference(signingCertificateV2[0], signingCertificate)
    : { valid: false, evidence: { reason: "SigningCertificateV2 is absent." } };
  const signingCertificateReferenceValid = signingCertificateV2.length === 1
    && obsoleteSigningCertificates.length === 0
    && certificateReference.valid;
  checks.push(requiredCheck(
    "signature.xades_baseline_b.signing_certificate_reference",
    options.requireBaselineB,
    signingCertificateReferenceValid,
    "SigningCertificateV2 identifies the embedded signer certificate by a matching digest.",
    "SigningCertificateV2 is absent, duplicated, obsolete, malformed, unsupported, or does not identify the embedded signer certificate.",
    {
      signingCertificateV2Count: signingCertificateV2.length,
      obsoleteSigningCertificateCount: obsoleteSigningCertificates.length,
      ...certificateReference.evidence,
    },
  ));

  const signedDataReferences = references.filter((reference) => reference.getAttribute("Type") !== SIGNED_PROPERTIES_TYPE);
  const dataObjectFormats = signedProperty
    ? nodes(signedProperty, `./*[local-name()='SignedDataObjectProperties' and namespace-uri()='${XADES}']/*[local-name()='DataObjectFormat' and namespace-uri()='${XADES}']`) as Element[]
    : [];
  const formatReferences = dataObjectFormats.map((format) => format.getAttribute("ObjectReference"));
  const formatCardinalities = dataObjectFormats.map((format) => ({
    objectReferencePresent: Boolean(format.getAttribute("ObjectReference")),
    descriptionCount: directChildren(format, "Description", XADES).length,
    objectIdentifierCount: directChildren(format, "ObjectIdentifier", XADES).length,
    mimeTypeCount: directChildren(format, "MimeType", XADES).length,
    encodingCount: directChildren(format, "Encoding", XADES).length,
  }));
  const expectedFormatReferences = signedDataReferences.map((reference) => {
    const id = reference.getAttribute("Id");
    return id ? `#${id}` : undefined;
  });
  const dataObjectFormatsValid = signedDataReferences.length > 0
    && expectedFormatReferences.every((reference) => reference && formatReferences.filter((value) => value === reference).length === 1)
    && dataObjectFormats.length === signedDataReferences.length
    && formatCardinalities.every((entry) => entry.objectReferencePresent
      && entry.mimeTypeCount === 1
      && entry.descriptionCount <= 1
      && entry.objectIdentifierCount <= 1
      && entry.encodingCount <= 1);
  checks.push(requiredCheck(
    "signature.xades_baseline_b.data_object_formats",
    options.requireBaselineB,
    dataObjectFormatsValid,
    "Each signed data object has exactly one matching XAdES DataObjectFormat property.",
    "Each signed data object except SignedProperties requires exactly one DataObjectFormat that references its ds:Reference Id.",
    { expectedObjectReferences: expectedFormatReferences, observedObjectReferences: formatReferences, formatCardinalities },
  ));

  const referenceDigestEvidence = references.map((reference) => {
    const methods = directChildren(reference, "DigestMethod", XMLDSIG);
    const values = directChildren(reference, "DigestValue", XMLDSIG);
    return {
      ...referenceEvidence(reference),
      digestMethodCount: methods.length,
      digestAlgorithm: methods[0]?.getAttribute("Algorithm") || undefined,
      digestValueCount: values.length,
      digestValuePresent: Boolean(values[0]?.textContent?.trim()),
    };
  });
  const referenceDigestsValid = references.length > 0 && referenceDigestEvidence.every((reference) =>
    reference.digestMethodCount === 1
    && Boolean(reference.digestAlgorithm)
    && reference.digestValueCount === 1
    && reference.digestValuePresent);
  checks.push(requiredCheck(
    "signature.xades_baseline_b.reference_digests",
    options.requireBaselineB,
    referenceDigestsValid,
    "Every SignedInfo reference declares one digest method and a non-empty digest value; cryptographic digest verification is reported separately.",
    "Every SignedInfo reference must declare exactly one digest method and one non-empty digest value.",
    referenceDigestEvidence,
  ));

  const prohibitedLegacyNames = [
    "SigningCertificate",
    "SignerRole",
    "SignatureProductionPlace",
    "CompleteCertificateRefs",
    "AttributeCertificateRefs",
    "CompleteRevocationRefs",
    "AttributeRevocationRefs",
    "SigAndRefsTimeStamp",
    "RefsOnlyTimeStamp",
  ];
  const observedLegacyProperties = prohibitedLegacyNames.filter((name) =>
    nodes(signatureNode, `.//*[local-name()='${name}' and namespace-uri()='${XADES}']`).length > 0);
  checks.push(requiredCheck(
    "signature.xades_baseline_b.prohibited_legacy_properties",
    options.requireBaselineB,
    observedLegacyProperties.length === 0,
    "No legacy XAdES properties prohibited by the Baseline B profile are present.",
    "One or more legacy XAdES properties prohibited by the Baseline B profile are present.",
    { observedLegacyProperties },
  ));

  checks.push(...annexH4Checks(document, signatureNode, signedInfo, references, options.requireAnnexH4));
  checks.push(certificateValidityCheck(certificate));
  checks.push(signerSubjectCheck("country", certificate?.subject, options.schemeTerritory ? [options.schemeTerritory] : undefined));
  checks.push(signerSubjectCheck("organization", certificate?.subject, options.schemeOperatorNames));
  checks.push(signerTrustCheck(certificate?.fingerprintSha256, options.trustedSignerFingerprintsSha256));
  return checks;
}

function annexH4Checks(
  document: Document,
  signatureNode: Element,
  signedInfo: Element | undefined,
  references: Element[],
  required = false,
): CheckResult[] {
  const documentReferences = references.filter((reference) => reference.getAttribute("URI") === "");
  const transformEvidence = documentReferences.map((documentReference) => {
    const transformContainers = directChildren(documentReference, "Transforms", XMLDSIG);
    const transforms = transformContainers[0] ? directChildren(transformContainers[0], "Transform", XMLDSIG) : [];
    return {
      transformsContainers: transformContainers.length,
      transformAlgorithms: transforms.map((transform) => transform.getAttribute("Algorithm")),
    };
  });
  const transformAlgorithms = transformEvidence.flatMap((entry) => entry.transformAlgorithms);
  const enveloped = isDescendantOf(signatureNode, document.documentElement)
    && transformAlgorithms.includes(ENVELOPED_TRANSFORM);
  const transformSequenceValid = transformEvidence.length > 0 && transformEvidence.every((entry) =>
    entry.transformsContainers === 1
    && entry.transformAlgorithms.length === 2
    && entry.transformAlgorithms[0] === ENVELOPED_TRANSFORM
    && entry.transformAlgorithms[1] === EXCLUSIVE_CANONICALIZATION);
  const canonicalizationMethods = signedInfo ? directChildren(signedInfo, "CanonicalizationMethod", XMLDSIG) : [];
  const canonicalizationAlgorithm = canonicalizationMethods[0]?.getAttribute("Algorithm") || undefined;
  return [
    requiredCheck(
      "signature.annex_h4.enveloped",
      required,
      enveloped,
      "The Pub-EAA XML signature is enveloped and its document reference applies the enveloped-signature transform.",
      "Annex H.4 requires an enveloped XML signature.",
      { signatureWithinDocument: isDescendantOf(signatureNode, document.documentElement), transformAlgorithms },
    ),
    requiredCheck(
      "signature.annex_h4.document_reference",
      required,
      documentReferences.length > 0,
      "SignedInfo contains a whole-document ds:Reference with URI=\"\".",
      "Annex H.4 requires a whole-document ds:Reference with URI=\"\".",
      { count: documentReferences.length },
    ),
    requiredCheck(
      "signature.annex_h4.transforms",
      required,
      transformSequenceValid,
      "The whole-document reference has one Transforms container with enveloped-signature followed by exclusive canonicalization.",
      "Annex H.4 requires exactly one Transforms container and exactly two transforms in the prescribed order.",
      transformEvidence,
    ),
    requiredCheck(
      "signature.annex_h4.canonicalization",
      required,
      canonicalizationMethods.length === 1 && canonicalizationAlgorithm === EXCLUSIVE_CANONICALIZATION,
      "SignedInfo uses exclusive XML canonicalization as required by Annex H.4.",
      "Annex H.4 requires SignedInfo CanonicalizationMethod to use exclusive XML canonicalization.",
      { count: canonicalizationMethods.length, algorithm: canonicalizationAlgorithm },
    ),
  ];
}

function assessSigningCertificateReference(
  signingCertificateV2: Element,
  signingCertificate: string | undefined,
): { valid: boolean; evidence: Record<string, unknown> } {
  const certs = directChildren(signingCertificateV2, "Cert", XADES);
  const certDigest = certs[0] ? directChildren(certs[0], "CertDigest", XADES) : [];
  const digestMethod = certDigest[0] ? directChildren(certDigest[0], "DigestMethod", XMLDSIG) : [];
  const digestValue = certDigest[0] ? directChildren(certDigest[0], "DigestValue", XMLDSIG) : [];
  const algorithm = digestMethod[0]?.getAttribute("Algorithm") || undefined;
  const declaredDigest = digestValue[0]?.textContent?.replace(/\s+/g, "") || undefined;
  const hashName = algorithm ? DIGEST_ALGORITHMS[algorithm] : undefined;
  let computedDigest: string | undefined;
  if (signingCertificate && hashName) {
    computedDigest = createHash(hashName)
      .update(Buffer.from(normalizeBase64Certificate(signingCertificate), "base64"))
      .digest("base64");
  }
  return {
    valid: certs.length >= 1
      && certs.every((cert) => !cert.hasAttribute("URI"))
      && certDigest.length === 1
      && digestMethod.length === 1
      && digestValue.length === 1
      && Boolean(signingCertificate)
      && Boolean(hashName)
      && Boolean(declaredDigest)
      && declaredDigest === computedDigest,
    evidence: {
      referencedCertificates: certs.length,
      certificateUriAttributes: certs.filter((cert) => cert.hasAttribute("URI")).map((cert) => cert.getAttribute("URI")),
      digestMethodCount: digestMethod.length,
      digestValueCount: digestValue.length,
      digestAlgorithm: algorithm,
      digestAlgorithmSupported: Boolean(hashName),
      declaredDigest,
      computedDigest,
    },
  };
}

function certificateValidityCheck(certificate: CertificateSummary | undefined): CheckResult {
  if (!certificate) {
    return check("signature.signing_certificate_validity", "not_checked", "info", "Signing-certificate validity was not checked because no parseable certificate is available.", undefined, "certificates");
  }
  const valid = certificate.validAtAssessmentTime === true;
  return check(
    "signature.signing_certificate_validity",
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    valid
      ? "The signing certificate is valid at the assessment time."
      : "The signing certificate is not valid at the assessment time.",
    { notBefore: certificate.notBefore, notAfter: certificate.notAfter, validAtAssessmentTime: certificate.validAtAssessmentTime },
    "certificates",
  );
}

function signerSubjectCheck(
  attribute: "country" | "organization",
  subject: string | undefined,
  expected: readonly string[] | undefined,
): CheckResult {
  const id = `signature.signer_subject.${attribute}`;
  if (!subject) return check(id, "not_checked", "info", `Signer ${attribute} matching was not checked because no parseable signer subject is available.`);
  if (!expected?.length) return check(id, "not_checked", "info", `Signer ${attribute} matching was not checked because the corresponding scheme metadata is absent.`);
  const subjectAttribute = attribute === "country" ? "C" : "O";
  const observed = distinguishedNameValues(subject, subjectAttribute);
  const matches = observed.some((value) => expected.includes(value));
  return check(
    id,
    matches ? "pass" : "fail",
    matches ? "info" : "error",
    matches
      ? `The signer subject ${attribute} equals the corresponding scheme metadata.`
      : `The signer subject ${attribute} does not equal the corresponding scheme metadata.`,
    { expected, observed, subject },
  );
}

function signerTrustCheck(
  fingerprint: string | undefined,
  trustedFingerprints: readonly string[] | undefined,
): CheckResult {
  if (trustedFingerprints === undefined) {
    return check(
      "signature.signer_trust",
      "not_checked",
      "info",
      "Signer trust was not checked because no explicit trusted signer certificate set was supplied; embedded certificate material is evidence, not a trust decision.",
      fingerprint ? { signerFingerprintSha256: fingerprint } : undefined,
    );
  }
  if (!fingerprint) return check("signature.signer_trust", "not_checked", "info", "Signer trust was not checked because no parseable signer certificate is available.");
  const normalized = trustedFingerprints.map((value) => value.toLowerCase());
  const trusted = normalized.includes(fingerprint.toLowerCase());
  return check(
    "signature.signer_trust",
    trusted ? "pass" : "fail",
    trusted ? "info" : "error",
    trusted
      ? "The signer certificate matches an explicitly supplied trusted signer fingerprint."
      : "The signer certificate does not match any explicitly supplied trusted signer fingerprint.",
    { signerFingerprintSha256: fingerprint, trustedSignerFingerprintsSha256: normalized },
  );
}

function distinguishedNameValues(subject: string, attribute: "C" | "O"): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`(?:^|\\n|,\\s*)${attribute}=((?:\\\\.|[^\\n,])*)`, "g");
  for (const match of subject.matchAll(pattern)) {
    values.push(match[1].trim().replace(/\\\\([,=+<>#;"\\\\])/g, "$1"));
  }
  return values;
}

function isUtcXsdDateTime(value: string): boolean {
  const lexical = /^-?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  if (!lexical.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function directChildren(context: Node, localName: string, namespace: string): Element[] {
  return nodes(context, `./*[local-name()='${localName}' and namespace-uri()='${namespace}']`) as Element[];
}

function referenceEvidence(reference: Element): { id?: string; uri: string; type?: string } {
  return {
    id: reference.getAttribute("Id") || undefined,
    uri: reference.getAttribute("URI") ?? "",
    type: reference.getAttribute("Type") || undefined,
  };
}

function isDescendantOf(node: Node, ancestor: Node): boolean {
  let current: Node | null = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parentNode;
  }
  return false;
}

function profileCheck(id: string, required = false, message: string): CheckResult {
  return required
    ? check(id, "fail", "critical", message)
    : check(id, "not_applicable", "info", "This signature constraint is not applicable to the selected XML profile.");
}

function requiredCheck(
  id: string,
  required: boolean | undefined,
  valid: boolean,
  passMessage: string,
  failMessage: string,
  evidence?: unknown,
): CheckResult {
  if (!required) return check(id, "not_applicable", "info", "This signature constraint is not applicable to the selected XML profile.");
  return check(id, valid ? "pass" : "fail", valid ? "info" : "critical", valid ? passMessage : failMessage, evidence);
}

function check(
  id: string,
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
  category: CheckResult["category"] = id.includes("xades") || id.includes("annex_h4") ? "xades" : "signature",
): CheckResult {
  return { id, category, status, severity, message, evidence };
}
