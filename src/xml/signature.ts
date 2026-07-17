import { SignedXml } from "xml-crypto";
import { certificatePublicKeyFingerprintSha256, tryCertificateFromBase64 } from "../certs.js";
import type { CertificateSummary, CheckResult } from "../types.js";
import { has, texts } from "./xpath.js";

export interface SignatureAssessment {
  checks: CheckResult[];
  certificates: CertificateSummary[];
}

export interface SignatureVerificationResult {
  status: Extract<CheckResult["status"], "pass" | "fail" | "not_checked">;
  message: string;
  evidence?: unknown;
}

export type SignatureVerifier = (xml: string, signatureNode: Element, certificate: string) => SignatureVerificationResult;

export interface SignatureAssessmentDependencies {
  verifier?: SignatureVerifier;
}

export interface SignatureAssessmentOptions {
  /** Require the first list ServiceDigitalIdentity certificate to identify the XMLDSig signing key. */
  requireFirstListCertificateMatch?: boolean;
}

export function assessSignature(
  xml: string,
  document: Document,
  assessmentDate = new Date(),
  dependencies: SignatureAssessmentDependencies = {},
  options: SignatureAssessmentOptions = {},
): SignatureAssessment {
  const checks: CheckResult[] = [];
  const certificates: CertificateSummary[] = [];
  const signatureNode = document.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0]
    ?? document.getElementsByTagName("Signature")[0];

  if (!signatureNode) {
    checks.push(
      check("signature.present", "fail", "error", "No ds:Signature element detected."),
      check("signature.signing_certificate_present", "not_checked", "info", "Signing certificate presence was not checked because ds:Signature is absent."),
      check("signature.signing_certificate_parsed", "not_checked", "info", "Signing certificate parsing was not checked because ds:Signature is absent."),
      check("signature.cryptographic_verification_attempted", "not_checked", "info", "Cryptographic verification was not attempted because ds:Signature is absent."),
      check("signature.cryptographic_verification_result", "not_checked", "info", "Cryptographic verification has no result because ds:Signature is absent."),
      check("signature.xades_properties_detected", "not_checked", "info", "XAdES properties were not checked because ds:Signature is absent."),
    );
    if (options.requireFirstListCertificateMatch) {
      checks.push(...firstListCertificateChecks(document, undefined));
    }
    return { checks, certificates };
  }

  checks.push(check("signature.present", "pass", "info", "ds:Signature element detected."));

  const certificateTexts = texts(signatureNode, ".//*[local-name()='KeyInfo']//*[local-name()='X509Certificate']");
  checks.push(check(
    "signature.signing_certificate_present",
    certificateTexts.length > 0 ? "pass" : "fail",
    certificateTexts.length > 0 ? "info" : "warning",
    certificateTexts.length > 0
      ? "Embedded ds:X509Certificate material detected in ds:KeyInfo."
      : "No embedded ds:X509Certificate material detected in ds:KeyInfo.",
    certificateTexts.length > 0 ? { count: certificateTexts.length } : undefined,
  ));

  const parsedCertificateEntries = certificateTexts
    .map((certificate) => ({ certificate, summary: tryCertificateFromBase64(certificate, "xml_signature", assessmentDate) }))
    .filter((entry): entry is { certificate: string; summary: CertificateSummary } => Boolean(entry.summary));
  const parsedCertificates = parsedCertificateEntries.map((entry) => entry.summary);
  certificates.push(...parsedCertificates);
  checks.push(check(
    "signature.signing_certificate_parsed",
    certificateTexts.length === 0 ? "not_checked" : parsedCertificates.length === certificateTexts.length ? "pass" : "fail",
    certificateTexts.length === 0 ? "info" : parsedCertificates.length === certificateTexts.length ? "info" : "warning",
    certificateTexts.length === 0
      ? "Signing certificate parsing was not attempted because no embedded certificate was supplied."
      : parsedCertificates.length === certificateTexts.length
        ? "All embedded signing certificates parsed."
        : "One or more embedded signing certificates could not be parsed.",
    certificateTexts.length === 0 ? undefined : {
      present: certificateTexts.length,
      parsed: parsedCertificates.length,
      certificates: parsedCertificates,
    },
  ));

  const verificationEntry = parsedCertificateEntries[0];
  if (!verificationEntry) {
    checks.push(
      check("signature.cryptographic_verification_attempted", "not_checked", "info", "Cryptographic verification was not attempted because no parseable embedded signing certificate is available."),
      check("signature.cryptographic_verification_result", "not_checked", "info", "Cryptographic verification has no result because no parseable embedded signing certificate is available."),
    );
  } else {
    checks.push(check("signature.cryptographic_verification_attempted", "pass", "info", "Cryptographic verification was attempted with the first parseable ds:KeyInfo X.509 certificate using xml-crypto."));
    const verification = (dependencies.verifier ?? verifyXmlSignature)(xml, signatureNode, verificationEntry.certificate);
    checks.push(check(
      "signature.cryptographic_verification_result",
      verification.status,
      verification.status === "pass" ? "info" : verification.status === "fail" ? "error" : "warning",
      verification.message,
      verification.evidence,
    ));
  }

  if (options.requireFirstListCertificateMatch) {
    checks.push(...firstListCertificateChecks(document, verificationEntry?.certificate));
  }

  const xadesDetected = has(document, "//*[local-name()='QualifyingProperties']") || has(document, "//*[local-name()='SignedProperties']");
  checks.push(check(
    "signature.xades_properties_detected",
    xadesDetected ? "pass" : "warn",
    xadesDetected ? "info" : "warning",
    xadesDetected
      ? "XAdES qualifying properties detected."
      : "XAdES Baseline-B material not detected; XMLDSig presence alone may not satisfy the intended signature profile.",
  ));

  return { checks, certificates };
}

function firstListCertificateChecks(document: Document, signingCertificate: string | undefined): CheckResult[] {
  const firstListCertificate = texts(
    document,
    "(//*[local-name()='TrustServiceProviderList']//*[local-name()='ServiceDigitalIdentity']//*[local-name()='X509Certificate'] | //*[local-name()='OtherTSLPointer']//*[local-name()='ServiceDigitalIdentity']//*[local-name()='X509Certificate'])[1]",
  )[0];

  if (!firstListCertificate) {
    return [check(
      "signature.first_list_certificate_present",
      "fail",
      "error",
      "The first list ServiceDigitalIdentity certificate is missing; its public key cannot be compared with ds:KeyInfo.",
    )];
  }

  if (!signingCertificate) {
    return [check(
      "signature.first_list_certificate_public_key_match",
      "not_checked",
      "info",
      "The first list certificate public key was not compared because ds:KeyInfo has no parseable signing certificate.",
    )];
  }

  const listPublicKeyFingerprint = certificatePublicKeyFingerprintSha256(firstListCertificate);
  const signingPublicKeyFingerprint = certificatePublicKeyFingerprintSha256(signingCertificate);
  if (!listPublicKeyFingerprint || !signingPublicKeyFingerprint) {
    return [check(
      "signature.first_list_certificate_public_key_match",
      "fail",
      "error",
      "The first list certificate or ds:KeyInfo signing certificate could not be parsed for public-key comparison.",
      { listPublicKeyFingerprintSha256: listPublicKeyFingerprint, signingPublicKeyFingerprintSha256: signingPublicKeyFingerprint },
    )];
  }

  const matches = listPublicKeyFingerprint === signingPublicKeyFingerprint;
  return [check(
    "signature.first_list_certificate_public_key_match",
    matches ? "pass" : "fail",
    matches ? "info" : "error",
    matches
      ? "The first list ServiceDigitalIdentity certificate has the same public key as the ds:KeyInfo signing certificate."
      : "The first list ServiceDigitalIdentity certificate public key differs from the ds:KeyInfo signing certificate public key.",
    { listPublicKeyFingerprintSha256: listPublicKeyFingerprint, signingPublicKeyFingerprintSha256: signingPublicKeyFingerprint },
  )];
}

function verifyXmlSignature(xml: string, signatureNode: Element, certificate: string): SignatureVerificationResult {
  try {
    const signature = new SignedXml();
    signature.publicCert = pemFromBase64(certificate);
    signature.loadSignature(signatureNode);
    const ok = signature.checkSignature(xml);
    return ok
      ? { status: "pass", message: "XMLDSig verification succeeded." }
      : {
          status: "fail",
          message: "XMLDSig verification failed.",
          evidence: (signature as unknown as { validationErrors?: unknown }).validationErrors,
        };
  } catch (error) {
    return {
      status: "not_checked",
      message: "XMLDSig verification could not be completed with xml-crypto; unsupported signature structure, transform, or canonicalization may be involved.",
      evidence: error instanceof Error ? error.message : String(error),
    };
  }
}

function check(
  id: string,
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): CheckResult {
  return { id, category: id === "signature.xades_properties_detected" ? "xades" : "signature", status, severity, message, evidence };
}

function pemFromBase64(base64: string): string {
  const clean = base64.replace(/\s+/g, "");
  const lines = clean.match(/.{1,64}/g)?.join("\n") ?? clean;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
}
