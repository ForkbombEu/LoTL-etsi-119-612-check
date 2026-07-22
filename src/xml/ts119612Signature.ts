import { X509Certificate } from "node:crypto";
import { assessCertificateChain } from "../eudi/certificateChain.js";
import { normalizeBase64Certificate, sha256Hex } from "../certs.js";
import type {
  CertificateSummary,
  CheckResult,
  Ts119612SignerEvidence,
} from "../types.js";
import { nodes } from "./xpath.js";

const XMLDSIG = "http://www.w3.org/2000/09/xmldsig#";
const ENVELOPED_TRANSFORM = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const EXCLUSIVE_CANONICALIZATION = "http://www.w3.org/2001/10/xml-exc-c14n#";
const TSL_SIGNING_EKU = "0.4.0.2231.3.0";

export interface Ts119612SignatureProfileOptions {
  assessmentDate: Date;
  signerEvidence?: Ts119612SignerEvidence;
  trustedSignerFingerprintsSha256?: readonly string[];
}

export function assessTs119612SignatureProfile(
  document: Document,
  signatureNode: Element | undefined,
  signingCertificate: string | undefined,
  certificateSummary: CertificateSummary | undefined,
  options: Ts119612SignatureProfileOptions,
): CheckResult[] {
  if (!signatureNode) return absentSignatureChecks(options.signerEvidence);

  const root = document.documentElement;
  const signatures = directChildren(root, "Signature", XMLDSIG);
  const signedInfos = directChildren(signatureNode, "SignedInfo", XMLDSIG);
  const signedInfo = signedInfos[0];
  const references = signedInfo ? directChildren(signedInfo, "Reference", XMLDSIG) : [];
  const rootId = root.getAttribute("Id") || root.getAttribute("ID") || root.getAttribute("id") || undefined;
  const rootReferenceUris = new Set(["", ...(rootId ? [`#${rootId}`] : [])]);
  const rootReferences = references.filter((reference) => rootReferenceUris.has(reference.getAttribute("URI") ?? ""));
  const rootReferenceEvidence = rootReferences.map((reference) => {
    const transformContainers = directChildren(reference, "Transforms", XMLDSIG);
    const transforms = transformContainers[0] ? directChildren(transformContainers[0], "Transform", XMLDSIG) : [];
    return {
      uri: reference.getAttribute("URI") ?? "",
      transformsContainerCount: transformContainers.length,
      transformAlgorithms: transforms.map((transform) => transform.getAttribute("Algorithm")),
    };
  });
  const validRootReference = rootReferenceEvidence.some((reference) =>
    reference.transformsContainerCount === 1
    && reference.transformAlgorithms.length === 2
    && reference.transformAlgorithms[0] === ENVELOPED_TRANSFORM
    && reference.transformAlgorithms[1] === EXCLUSIVE_CANONICALIZATION);
  const canonicalizationMethods = signedInfo ? directChildren(signedInfo, "CanonicalizationMethod", XMLDSIG) : [];
  const canonicalizationAlgorithm = canonicalizationMethods[0]?.getAttribute("Algorithm") || undefined;
  const annexBValid = signatures.length === 1
    && signedInfos.length === 1
    && validRootReference
    && canonicalizationMethods.length === 1
    && canonicalizationAlgorithm === EXCLUSIVE_CANONICALIZATION;

  const checks: CheckResult[] = [result(
    "ts119612.signature.annex_b",
    annexBValid,
    "The signature is enveloped, covers TrustServiceStatusList with the exact Annex B transform sequence, and uses exclusive canonicalization.",
    "The signature does not satisfy the exact enveloped-reference, transform, or canonicalization constraints in TS 119 612 Annex B.1.",
    {
      directSignatureCount: signatures.length,
      signedInfoCount: signedInfos.length,
      rootId,
      rootReferences: rootReferenceEvidence,
      canonicalizationMethodCount: canonicalizationMethods.length,
      canonicalizationAlgorithm,
      additionalReferenceCount: references.length - rootReferences.length,
    },
  )];

  const signatureMethods = signedInfo ? directChildren(signedInfo, "SignatureMethod", XMLDSIG) : [];
  const signatureValues = directChildren(signatureNode, "SignatureValue", XMLDSIG);
  const signatureAlgorithm = signatureMethods[0]?.getAttribute("Algorithm") || undefined;
  checks.push(result(
    "ts119612.signature.algorithm_identifier",
    signatureMethods.length === 1 && Boolean(signatureAlgorithm)
      && signatureValues.length === 1 && Boolean(signatureValues[0]?.textContent?.trim()),
    "One signature algorithm identifier and one non-empty signature value are present inside the signed structure.",
    "TS 119 612 clauses 5.7.2 and 5.7.3 require one signature algorithm identifier and one non-empty signature value.",
    { signatureMethodCount: signatureMethods.length, signatureAlgorithm, signatureValueCount: signatureValues.length },
  ));

  const parsed = parseSigningCertificate(signingCertificate);
  checks.push(check(
    "ts119612.signature.algorithm_policy",
    "not_checked",
    "warning",
    "The applicable ETSI TS 119 312 three-year usable-key policy was not resolved from an explicit policy snapshot; no algorithm-policy verdict was invented.",
    {
      signatureAlgorithm,
      publicKeyType: parsed?.certificate.publicKey.asymmetricKeyType,
      publicKeyDetails: jsonSafeKeyDetails(parsed?.certificate.publicKey.asymmetricKeyDetails),
      requiredPolicySource: "ETSI TS 119 312 tables 4, 6 and 7 (non-specific reference)",
    },
  ));

  const keyInfos = directChildren(signatureNode, "KeyInfo", XMLDSIG);
  const x509Data = keyInfos.flatMap((keyInfo) => directChildren(keyInfo, "X509Data", XMLDSIG));
  const embeddedCertificates = x509Data.flatMap((entry) => directChildren(entry, "X509Certificate", XMLDSIG));
  checks.push(result(
    "ts119612.signature.key_info",
    keyInfos.length === 1 && x509Data.length === 1 && embeddedCertificates.length === 1 && Boolean(parsed),
    "KeyInfo contains exactly one parseable TLSO certificate and no embedded certificate chain.",
    "KeyInfo shall contain exactly one parseable TLSO certificate and shall not contain an associated certificate chain.",
    { keyInfoCount: keyInfos.length, x509DataCount: x509Data.length, embeddedCertificateCount: embeddedCertificates.length },
  ));

  checks.push(...certificateProfileChecks(parsed));
  const path = signerPathCheck(signingCertificate, options.signerEvidence, options.assessmentDate);
  checks.push(path.check);
  checks.push(issuerCheck(parsed, path.trusted));
  checks.push(revocationCheck(certificateSummary?.fingerprintSha256, options.signerEvidence, options.assessmentDate));
  checks.push(signerTrustCheck(
    certificateSummary?.fingerprintSha256,
    options.trustedSignerFingerprintsSha256,
    options.signerEvidence,
    path.trusted,
  ));
  return checks;
}

interface ParsedSigningCertificate {
  certificate: X509Certificate;
  fingerprintSha256: string;
  subjectKeyIdentifier?: string;
  keyUsage: string[];
  extendedKeyUsage: string[];
  selfSigned: boolean;
}

function parseSigningCertificate(encoded: string | undefined): ParsedSigningCertificate | undefined {
  if (!encoded) return undefined;
  try {
    const raw = Buffer.from(normalizeBase64Certificate(encoded), "base64");
    const certificate = new X509Certificate(raw);
    const extensions = certificateExtensions(raw);
    return {
      certificate,
      fingerprintSha256: sha256Hex(raw),
      subjectKeyIdentifier: extensions.subjectKeyIdentifier,
      keyUsage: extensions.keyUsage,
      extendedKeyUsage: certificate.keyUsage ?? [],
      selfSigned: normalizeDn(certificate.subject) === normalizeDn(certificate.issuer)
        && certificate.verify(certificate.publicKey),
    };
  } catch {
    return undefined;
  }
}

function certificateProfileChecks(parsed: ParsedSigningCertificate | undefined): CheckResult[] {
  if (!parsed) {
    return [
      unchecked("ts119612.signature.certificate.key_usage", "Key usage was not checked because the TLSO certificate is not parseable."),
      unchecked("ts119612.signature.certificate.extended_key_usage", "Extended key usage was not checked because the TLSO certificate is not parseable."),
      unchecked("ts119612.signature.certificate.subject_key_identifier", "SubjectKeyIdentifier was not checked because the TLSO certificate is not parseable."),
      unchecked("ts119612.signature.certificate.basic_constraints", "BasicConstraints was not checked because the TLSO certificate is not parseable."),
    ];
  }
  const allowedKeyUsage = new Set(["digitalSignature", "nonRepudiation"]);
  const keyUsageValid = parsed.keyUsage.length > 0 && parsed.keyUsage.every((value) => allowedKeyUsage.has(value));
  const extendedKeyUsagePresent = parsed.extendedKeyUsage.includes(TSL_SIGNING_EKU);
  return [
    result(
      "ts119612.signature.certificate.key_usage",
      keyUsageValid,
      "The TLSO certificate KeyUsage is restricted to digitalSignature and/or nonRepudiation.",
      "The TLSO certificate KeyUsage shall contain digitalSignature and/or nonRepudiation and no other usage.",
      { keyUsage: parsed.keyUsage },
    ),
    check(
      "ts119612.signature.certificate.extended_key_usage",
      extendedKeyUsagePresent ? "pass" : "warn",
      extendedKeyUsagePresent ? "info" : "warning",
      extendedKeyUsagePresent
        ? "The TLSO certificate contains the recommended id-tsl-kp-tslSigning extended key usage."
        : "The recommended id-tsl-kp-tslSigning extended key usage is absent.",
      { expectedOid: TSL_SIGNING_EKU, extendedKeyUsage: parsed.extendedKeyUsage },
    ),
    result(
      "ts119612.signature.certificate.subject_key_identifier",
      Boolean(parsed.subjectKeyIdentifier),
      "The TLSO certificate contains a SubjectKeyIdentifier extension.",
      "The TLSO certificate shall contain a SubjectKeyIdentifier extension.",
      { subjectKeyIdentifier: parsed.subjectKeyIdentifier },
    ),
    result(
      "ts119612.signature.certificate.basic_constraints",
      parsed.certificate.ca === false,
      "The TLSO certificate BasicConstraints indicates CA=false.",
      "The TLSO certificate BasicConstraints shall indicate CA=false.",
      { ca: parsed.certificate.ca },
    ),
  ];
}

function signerPathCheck(
  signingCertificate: string | undefined,
  evidence: Ts119612SignerEvidence | undefined,
  assessmentDate: Date,
): { check: CheckResult; trusted: boolean } {
  if (!signingCertificate || !evidence?.trustAnchors?.length) {
    return {
      check: check(
        "ts119612.signature.certificate_path",
        "not_checked",
        "info",
        "The TLSO certificate path was not checked because no separate trust anchors were supplied.",
        { suppliedIntermediates: evidence?.intermediateCertificates?.length ?? 0, suppliedTrustAnchors: evidence?.trustAnchors?.length ?? 0 },
      ),
      trusted: false,
    };
  }
  const assessment = assessCertificateChain({
    chain: [signingCertificate, ...(evidence.intermediateCertificates ?? [])],
    format: "x5c",
    trustAnchors: evidence.trustAnchors,
    assessmentDate,
  });
  const trusted = assessment.chainStructurallyValid && assessment.trustedByTlLote;
  return {
    check: check(
      "ts119612.signature.certificate_path",
      trusted ? "pass" : "fail",
      trusted ? "info" : "critical",
      trusted
        ? "The embedded TLSO certificate reaches a separately supplied trust anchor through the supplied certificate path."
        : "The embedded TLSO certificate does not reach a separately supplied trust anchor through a valid supplied path.",
      {
        certificates: assessment.certificates,
        trustAnchors: assessment.trustAnchors,
        chainChecks: assessment.checks.filter((entry) => entry.id !== "chain.rpac_access_ca_anchor" && entry.id !== "revocation.not_checked"),
      },
    ),
    trusted,
  };
}

function issuerCheck(parsed: ParsedSigningCertificate | undefined, pathTrusted: boolean): CheckResult {
  if (!parsed) return unchecked("ts119612.signature.certificate.issuer", "Certificate issuer authorization was not checked because the TLSO certificate is not parseable.");
  if (parsed.selfSigned) {
    return check("ts119612.signature.certificate.issuer", "pass", "info", "The TLSO certificate is self-issued and its self-signature verifies.", {
      subject: parsed.certificate.subject,
      issuer: parsed.certificate.issuer,
      selfSigned: true,
    });
  }
  return check(
    "ts119612.signature.certificate.issuer",
    "inconclusive",
    "warning",
    pathTrusted
      ? "The supplied certificate path verifies, but the tool cannot establish locally that the issuer is a listed TSP in this TL or the same community."
      : "The tool cannot establish locally that the non-self-signed TLSO certificate issuer is a listed TSP in this TL or the same community.",
    { subject: parsed.certificate.subject, issuer: parsed.certificate.issuer, pathTrusted, issuerListingChecked: false },
  );
}

function revocationCheck(
  signerFingerprint: string | undefined,
  evidence: Ts119612SignerEvidence | undefined,
  assessmentDate: Date,
): CheckResult {
  const revocation = evidence?.revocation;
  if (!revocation) return check("ts119612.signature.revocation", "not_checked", "info", "Signer-certificate revocation was not checked because no explicit revocation evidence was supplied.");
  const fingerprintMatches = Boolean(signerFingerprint)
    && revocation.signerFingerprintSha256.toLowerCase() === signerFingerprint?.toLowerCase();
  const checkedAt = strictDate(revocation.checkedAt);
  const nextUpdate = revocation.nextUpdate ? strictDate(revocation.nextUpdate) : undefined;
  const temporallyApplicable = Boolean(checkedAt && checkedAt <= assessmentDate && (!revocation.nextUpdate || (nextUpdate && nextUpdate >= assessmentDate)));
  if (!fingerprintMatches || !temporallyApplicable) {
    return check("ts119612.signature.revocation", "inconclusive", "warning", "Supplied revocation evidence does not identify the signer or is not temporally applicable at assessment time.", {
      ...revocation, signerFingerprintSha256: signerFingerprint, fingerprintMatches, temporallyApplicable, assessmentDate: assessmentDate.toISOString(),
    });
  }
  if (revocation.status === "revoked") return check("ts119612.signature.revocation", "fail", "critical", "Supplied revocation evidence reports the TLSO certificate as revoked.", revocation);
  if (revocation.status === "unknown") return check("ts119612.signature.revocation", "inconclusive", "warning", "Supplied revocation evidence reports an unknown TLSO certificate status.", revocation);
  return check("ts119612.signature.revocation", "pass", "info", "Supplied, current revocation evidence reports the TLSO certificate as good.", revocation);
}

function signerTrustCheck(
  signerFingerprint: string | undefined,
  trustedFingerprints: readonly string[] | undefined,
  evidence: Ts119612SignerEvidence | undefined,
  pathTrusted: boolean,
): CheckResult {
  const normalizedTrusted = trustedFingerprints?.map((value) => value.toLowerCase());
  const directTrust = Boolean(signerFingerprint && normalizedTrusted?.includes(signerFingerprint.toLowerCase()));
  const trustInputSupplied = normalizedTrusted !== undefined || Boolean(evidence?.trustAnchors?.length);
  if (!trustInputSupplied) return check(
    "ts119612.signature.signer_trust",
    "not_checked",
    "info",
    "Signer trust was not checked because no separate trusted fingerprint or certificate path anchor was supplied; KeyInfo is evidence, not a trust decision.",
    signerFingerprint ? { signerFingerprintSha256: signerFingerprint } : undefined,
  );
  const trusted = directTrust || pathTrusted;
  return check(
    "ts119612.signature.signer_trust",
    trusted ? "pass" : "fail",
    trusted ? "info" : "critical",
    trusted
      ? "The TLSO signer is authenticated by separately supplied direct or certificate-path trust evidence."
      : "The TLSO signer does not match the separately supplied direct or certificate-path trust evidence.",
    { signerFingerprintSha256: signerFingerprint, directTrust, pathTrusted, trustedSignerFingerprintsSha256: normalizedTrusted },
  );
}

function absentSignatureChecks(evidence: Ts119612SignerEvidence | undefined): CheckResult[] {
  return [
    check("ts119612.signature.annex_b", "fail", "critical", "A ds:Signature is required before Annex B signature constraints can be assessed."),
    check("ts119612.signature.algorithm_identifier", "fail", "critical", "A ds:SignatureMethod and ds:SignatureValue are required."),
    check("ts119612.signature.algorithm_policy", "not_checked", "warning", "The TS 119 312 usable-key policy was not checked because the signature is absent."),
    check("ts119612.signature.key_info", "fail", "critical", "A ds:KeyInfo containing the TLSO certificate is required."),
    ...certificateProfileChecks(undefined),
    signerPathCheck(undefined, evidence, new Date(0)).check,
    unchecked("ts119612.signature.certificate.issuer", "Certificate issuer authorization was not checked because the signature is absent."),
    check("ts119612.signature.revocation", "not_checked", "info", "Signer-certificate revocation was not checked because the signature is absent."),
    check("ts119612.signature.signer_trust", "not_checked", "info", "Signer trust was not checked because the signature is absent."),
  ];
}

function certificateExtensions(raw: Buffer): { subjectKeyIdentifier?: string; keyUsage: string[] } {
  const certificate = tlv(raw, 0);
  const tbs = tlv(raw, certificate.contentStart);
  let offset = tbs.contentStart;
  let subjectKeyIdentifier: string | undefined;
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
          subjectKeyIdentifier = raw.subarray(inner.contentStart, inner.end).toString("hex");
        } else if (oidHex === "551d0f") {
          const bits = tlv(raw, octets.contentStart);
          keyUsage = decodeKeyUsage(raw.subarray(bits.contentStart + 1, bits.end));
        }
        extensionOffset = extension.end;
      }
    }
    offset = item.end;
  }
  return { subjectKeyIdentifier, keyUsage };
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

function directChildren(context: Node, localName: string, namespace: string): Element[] {
  return nodes(context, `./*[local-name()='${localName}' and namespace-uri()='${namespace}']`) as Element[];
}

function normalizeDn(value: string): string {
  return value.split(/\n|,(?=[A-Za-z][A-Za-z0-9.]*=)/).map((part) => part.trim().toLocaleLowerCase("en")).sort().join(",");
}

function strictDate(value: string): Date | undefined {
  if (!/^-?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function jsonSafeKeyDetails(details: object | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined;
  return Object.fromEntries(Object.entries(details).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value]));
}

function unchecked(id: string, message: string): CheckResult {
  return check(id, "not_checked", "info", message);
}

function result(id: string, valid: boolean, passMessage: string, failMessage: string, evidence?: unknown): CheckResult {
  return check(id, valid ? "pass" : "fail", valid ? "info" : "critical", valid ? passMessage : failMessage, evidence);
}

function check(id: string, status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult {
  return { id, category: id.includes("annex_b") ? "xades" : id.includes("certificate") || id.includes("revocation") ? "certificates" : "signature", status, severity, message, evidence };
}
