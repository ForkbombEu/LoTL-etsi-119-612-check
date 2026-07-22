import { createHash, createPublicKey, X509Certificate, type JsonWebKey } from "node:crypto";
import { normalizeBase64Certificate } from "../certs.js";
import type { Ts119602IdentityObservation } from "./ts119602Entities.js";

export interface Ts119602CertificateIdentity {
  path?: string;
  parsed: boolean;
  fingerprintSha256?: string;
  publicKeySha256?: string;
  subjectKeyIdentifier?: string;
  subject?: string;
  error?: string;
}

export interface Ts119602IdentityMaterial {
  certificateFingerprintsSha256: string[];
  publicKeyHashesSha256: string[];
  subjectKeyIdentifiers: string[];
}

export interface Ts119602IdentityInspection extends Ts119602IdentityMaterial {
  path: string;
  certificates: Ts119602CertificateIdentity[];
  publicKeys: Array<{ path: string; parsed: boolean; publicKeySha256?: string; error?: string }>;
  skis: Array<{ path: string; parsed: boolean; subjectKeyIdentifier?: string; error?: string }>;
  comparable: boolean;
  diagnostics: string[];
  valid: boolean;
}

/** Parse all locally comparable PKI identity forms and enforce clause 6.6.3 equivalence. */
export function inspectTs119602Identity(identity: Ts119602IdentityObservation): Ts119602IdentityInspection {
  const certificates = identity.certificates.map((entry) => inspectTs119602Certificate(entry.value, entry.path));
  const publicKeys = identity.publicKeys.map((entry) => {
    try {
      return { path: entry.path, parsed: true, publicKeySha256: publicKeySha256(entry.value) };
    } catch (error) {
      return { path: entry.path, parsed: false, error: message(error) };
    }
  });
  const skis = identity.skis.map((entry) => {
    try {
      return { path: entry.path, parsed: true, subjectKeyIdentifier: base64ToHex(entry.value) };
    } catch (error) {
      return { path: entry.path, parsed: false, error: message(error) };
    }
  });
  const diagnostics: string[] = [];
  certificates.filter((entry) => !entry.parsed).forEach((entry) => diagnostics.push(`${entry.path ?? identity.path}: X509Certificate could not be parsed.`));
  publicKeys.filter((entry) => !entry.parsed).forEach((entry) => diagnostics.push(`${entry.path}: PublicKeyValue could not be converted to a supported public key.`));
  skis.filter((entry) => !entry.parsed).forEach((entry) => diagnostics.push(`${entry.path}: X509SKI is not strict Base64.`));
  const parsedCertificates = certificates.filter((entry) => entry.parsed);
  if (parsedCertificates.length > 0) {
    const certificateKeys = new Set(parsedCertificates.flatMap((entry) => entry.publicKeySha256 ?? []));
    const certificateSkis = new Set(parsedCertificates.flatMap((entry) => entry.subjectKeyIdentifier ?? []));
    publicKeys.filter((entry) => entry.parsed).forEach((entry) => {
      if (!entry.publicKeySha256 || !certificateKeys.has(entry.publicKeySha256)) {
        diagnostics.push(`${entry.path}: PublicKeyValue does not match any X509Certificate public key in the identity.`);
      }
    });
    skis.filter((entry) => entry.parsed).forEach((entry) => {
      if (!entry.subjectKeyIdentifier || !certificateSkis.has(entry.subjectKeyIdentifier)) {
        diagnostics.push(`${entry.path}: X509SKI does not match any X509Certificate SubjectKeyIdentifier in the identity.`);
      }
    });
  }
  return {
    path: identity.path,
    certificates,
    publicKeys,
    skis,
    comparable: certificates.length > 0 && (publicKeys.length > 0 || skis.length > 0),
    certificateFingerprintsSha256: unique(certificates.flatMap((entry) => entry.fingerprintSha256 ?? [])),
    publicKeyHashesSha256: unique([
      ...certificates.flatMap((entry) => entry.publicKeySha256 ?? []),
      ...publicKeys.flatMap((entry) => entry.publicKeySha256 ?? []),
    ]),
    subjectKeyIdentifiers: unique([
      ...certificates.flatMap((entry) => entry.subjectKeyIdentifier ?? []),
      ...skis.flatMap((entry) => entry.subjectKeyIdentifier ?? []),
    ]),
    diagnostics,
    valid: diagnostics.length === 0,
  };
}

export function inspectTs119602Certificate(value: unknown, path?: string): Ts119602CertificateIdentity {
  if (typeof value !== "string") return { path, parsed: false, error: "Certificate value is not a string." };
  try {
    const encoded = normalizeBase64Certificate(value);
    const raw = strictBase64Buffer(encoded);
    const certificate = new X509Certificate(raw);
    const publicKey = certificate.publicKey.export({ type: "spki", format: "der" });
    return {
      path,
      parsed: true,
      fingerprintSha256: sha256(raw),
      publicKeySha256: sha256(publicKey),
      subjectKeyIdentifier: certificateSubjectKeyIdentifier(raw),
      subject: certificate.subject,
    };
  } catch (error) {
    return { path, parsed: false, error: message(error) };
  }
}

export function publicKeySha256(value: unknown): string {
  if (!isRecord(value) || typeof value.kty !== "string") throw new Error("A PublicKeyValue must be a JWK object containing kty.");
  const key = createPublicKey({ key: value as JsonWebKey, format: "jwk" });
  return sha256(key.export({ type: "spki", format: "der" }));
}

export function xmlRsaKeyValue(modulus: string | undefined, exponent: string | undefined): JsonWebKey | undefined {
  if (!modulus || !exponent) return undefined;
  try {
    return { kty: "RSA", n: base64Url(strictBase64Buffer(modulus.replace(/\s+/g, ""))), e: base64Url(strictBase64Buffer(exponent.replace(/\s+/g, ""))) };
  } catch {
    return undefined;
  }
}

export function matchTs119602IdentityMaterial(declared: Ts119602IdentityMaterial, signer: Ts119602IdentityMaterial) {
  const certificateFingerprint = intersection(declared.certificateFingerprintsSha256, signer.certificateFingerprintsSha256);
  const publicKey = intersection(declared.publicKeyHashesSha256, signer.publicKeyHashesSha256);
  const subjectKeyIdentifier = intersection(declared.subjectKeyIdentifiers, signer.subjectKeyIdentifiers);
  return {
    certificateFingerprint,
    publicKey,
    subjectKeyIdentifier,
    matched: certificateFingerprint.length > 0 || publicKey.length > 0 || subjectKeyIdentifier.length > 0,
  };
}

function certificateSubjectKeyIdentifier(raw: Buffer): string | undefined {
  const certificate = tlv(raw, 0);
  const tbs = tlv(raw, certificate.contentStart);
  let offset = tbs.contentStart;
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
        if (raw.subarray(oid.contentStart, oid.end).toString("hex") === "551d0e") {
          const inner = tlv(raw, octets.contentStart);
          return raw.subarray(inner.contentStart, inner.end).toString("hex");
        }
        extensionOffset = extension.end;
      }
    }
    offset = item.end;
  }
  return undefined;
}

function strictBase64Buffer(value: unknown): Buffer {
  if (typeof value !== "string" || value.length === 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Value is not strict Base64.");
  }
  return Buffer.from(value, "base64");
}

function base64ToHex(value: unknown): string { return strictBase64Buffer(value).toString("hex"); }
function base64Url(value: Buffer): string { return value.toString("base64url"); }
function sha256(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }
function unique(values: string[]): string[] { return [...new Set(values.map((value) => value.toLowerCase()))].sort(); }
function intersection(left: string[], right: string[]): string[] {
  const candidates = new Set(right.map((value) => value.toLowerCase()));
  return unique(left.filter((value) => candidates.has(value.toLowerCase())));
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

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
