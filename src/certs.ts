import { createHash } from "node:crypto";
import forge from "node-forge";
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
  const asn1 = forge.asn1.fromDer(der.toString("binary"));
  const cert = forge.pki.certificateFromAsn1(asn1);
  const notBefore = cert.validity.notBefore;
  const notAfter = cert.validity.notAfter;
  return {
    source,
    subject: attributesToString(cert.subject.attributes),
    issuer: attributesToString(cert.issuer.attributes),
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

function attributesToString(attrs: forge.pki.CertificateField[]): string {
  return attrs
    .map((attr) => `${attr.shortName ?? attr.name}=${String(attr.value)}`)
    .join(", ");
}
