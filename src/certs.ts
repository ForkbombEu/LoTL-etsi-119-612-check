import { createHash } from "node:crypto";
import { X509Certificate } from "node:crypto";
import type { CertificateSummary } from "./types.js";

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function normalizeBase64Certificate(value: string): string {
  return value
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
}

export function certificateFromBase64(
  base64: string,
  source: CertificateSummary["source"],
  assessmentDate = new Date(),
): CertificateSummary {
  const clean = normalizeBase64Certificate(base64);
  const der = Buffer.from(clean, "base64");
  const cert = new X509Certificate(der);
  const notBefore = new Date(cert.validFrom);
  const notAfter = new Date(cert.validTo);
  return {
    source,
    subject: cert.subject,
    issuer: cert.issuer,
    serialNumber: cert.serialNumber,
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    fingerprintSha256: sha256Hex(der),
    validAtAssessmentTime: assessmentDate >= notBefore && assessmentDate <= notAfter,
  };
}

export function tryCertificateFromBase64(
  base64: string,
  source: CertificateSummary["source"],
  assessmentDate = new Date(),
): CertificateSummary | undefined {
  try {
    return certificateFromBase64(base64, source, assessmentDate);
  } catch {
    return undefined;
  }
}

export function certificateFingerprintSha256(base64: string): string | undefined {
  try {
    return sha256Hex(Buffer.from(normalizeBase64Certificate(base64), "base64"));
  } catch {
    return undefined;
  }
}

/**
 * Returns a stable digest of the SubjectPublicKeyInfo bytes for an X.509
 * certificate.  This compares the public key itself, rather than requiring
 * the list certificate and the ds:KeyInfo certificate to be byte-for-byte
 * identical.
 */
export function certificatePublicKeyFingerprintSha256(base64: string): string | undefined {
  try {
    const der = Buffer.from(normalizeBase64Certificate(base64), "base64");
    const certificate = new X509Certificate(der);
    const spki = certificate.publicKey.export({ format: "der", type: "spki" });
    return sha256Hex(spki);
  } catch {
    return undefined;
  }
}
