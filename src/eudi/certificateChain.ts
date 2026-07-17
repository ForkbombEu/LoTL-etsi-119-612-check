import forge from "node-forge";
import { normalizeBase64Certificate, sha256Hex } from "../certs.js";
import type { CheckResult } from "../types.js";
import { isAccessCertificateRole, type EudiTrustRole } from "./roles.js";

export interface CertificateChainAssessmentInput {
  /** PEM bundle, one DER/base64 certificate, or a JOSE/JWT x5c array. */
  chain: string | string[];
  format?: "pem" | "der_base64" | "x5c";
  trustAnchors?: string[];
  declaredRole?: EudiTrustRole;
  assessmentDate?: Date;
}

export interface ChainCertificateEvidence {
  position: "end_entity" | "intermediate" | "trust_anchor";
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  fingerprintSha256: string;
  validAtAssessmentTime: boolean;
  basicConstraintsCa?: boolean;
  keyUsage?: string[];
  extendedKeyUsage?: string[];
}

export interface CertificateChainAssessment {
  declaredRole?: EudiTrustRole;
  certificates: ChainCertificateEvidence[];
  trustAnchors: ChainCertificateEvidence[];
  chainStructurallyValid: boolean;
  trustedByTlLote: boolean;
  checks: CheckResult[];
}

interface ParsedCertificate {
  cert: forge.pki.Certificate;
  evidence: ChainCertificateEvidence;
}

export function assessCertificateChain(input: CertificateChainAssessmentInput): CertificateChainAssessment {
  const assessmentDate = input.assessmentDate ?? new Date();
  const chainMaterials = normalizeChain(input.chain, input.format);
  const anchorMaterials = input.trustAnchors ?? [];
  const chain = chainMaterials.map((material, index) => parseCertificate(material, index === 0 ? "end_entity" : "intermediate", assessmentDate));
  const anchors = anchorMaterials.map((material) => parseCertificate(material, "trust_anchor", assessmentDate));
  const checks: CheckResult[] = [];
  const parsedChain = chain.filter((entry): entry is ParsedCertificate => Boolean(entry));
  const parsedAnchors = anchors.filter((entry): entry is ParsedCertificate => Boolean(entry));

  checks.push(check(
    "chain.certificates_parsed",
    parsedChain.length === chainMaterials.length && parsedChain.length > 0 ? "pass" : "fail",
    parsedChain.length === chainMaterials.length && parsedChain.length > 0 ? "info" : "error",
    parsedChain.length === chainMaterials.length && parsedChain.length > 0 ? "All supplied chain certificates parsed." : "One or more supplied chain certificates could not be parsed.",
    { supplied: chainMaterials.length, parsed: parsedChain.length },
  ));

  if (parsedChain.length !== chainMaterials.length || parsedChain.length === 0) {
    checks.push(
      check("chain.subject_issuer_continuity", "not_checked", "info", "Subject/issuer continuity was not checked because the chain is not fully parseable."),
      check("chain.signature_verification", "not_checked", "info", "Certificate signature verification was not checked because the chain is not fully parseable."),
      check("chain.trust_anchor_match", "not_checked", "info", "Trust-anchor matching was not checked because the chain is not fully parseable."),
      check("revocation.not_checked", "not_checked", "info", "Revocation checking is not implemented; no CRL or OCSP request was made."),
    );
    return result(input.declaredRole, parsedChain, parsedAnchors, false, false, checks);
  }

  const validityFailures = parsedChain.filter((certificate) => !certificate.evidence.validAtAssessmentTime);
  checks.push(check(
    "chain.validity_period",
    validityFailures.length === 0 ? "pass" : "warn",
    validityFailures.length === 0 ? "info" : "warning",
    validityFailures.length === 0 ? "All chain certificates are valid at assessment time." : "One or more chain certificates are expired or not yet valid at assessment time.",
    validityFailures.map((certificate) => certificate.evidence.fingerprintSha256),
  ));

  const leaf = parsedChain[0];
  checks.push(check(
    "chain.end_entity_basic_constraints",
    leaf.evidence.basicConstraintsCa === true ? "fail" : "pass",
    leaf.evidence.basicConstraintsCa === true ? "error" : "info",
    leaf.evidence.basicConstraintsCa === true ? "Leaf certificate is a CA and cannot be treated as the RPAC/WRPAC end-entity certificate." : "Leaf certificate is treated as an end-entity certificate, not a trust anchor.",
    { basicConstraintsCa: leaf.evidence.basicConstraintsCa },
  ));
  const intermediates = parsedChain.slice(1);
  const nonCaIntermediates = intermediates.filter((certificate) => certificate.evidence.basicConstraintsCa !== true);
  checks.push(check(
    "chain.intermediate_ca_basic_constraints",
    nonCaIntermediates.length === 0 ? "pass" : "fail",
    nonCaIntermediates.length === 0 ? "info" : "error",
    nonCaIntermediates.length === 0 ? "All supplied intermediate certificates have CA basic constraints." : "One or more supplied intermediate certificates lack CA basic constraints.",
    nonCaIntermediates.map((certificate) => certificate.evidence.fingerprintSha256),
  ));
  checks.push(keyUsageCheck(leaf, intermediates));

  const links = parsedChain.slice(0, -1).map((child, index) => ({ child, issuer: parsedChain[index + 1] }));
  const continuityFailures = links.filter(({ child, issuer }) => !issuer || child.evidence.issuer !== issuer.evidence.subject);
  checks.push(check(
    "chain.subject_issuer_continuity",
    continuityFailures.length === 0 ? "pass" : "fail",
    continuityFailures.length === 0 ? "info" : "error",
    continuityFailures.length === 0 ? "Certificate subject/issuer continuity is intact." : "One or more certificate issuer names do not match their supplied issuer certificates.",
    continuityFailures.map(({ child }) => child.evidence.fingerprintSha256),
  ));

  const signatureFailures: string[] = [];
  for (const { child, issuer } of links) {
    if (!issuer) { signatureFailures.push(child.evidence.fingerprintSha256); continue; }
    try {
      if (!issuer.cert.verify(child.cert)) signatureFailures.push(child.evidence.fingerprintSha256);
    } catch {
      signatureFailures.push(child.evidence.fingerprintSha256);
    }
  }
  checks.push(check(
    "chain.signature_verification",
    signatureFailures.length === 0 ? "pass" : "fail",
    signatureFailures.length === 0 ? "info" : "error",
    signatureFailures.length === 0 ? "Certificate signatures verify to the supplied issuer chain or trust anchor." : "One or more certificate signatures could not be verified to the supplied issuer chain or trust anchor.",
    signatureFailures,
  ));

  const terminal = parsedChain.at(-1)!;
  const anchorMatch = findAnchorIssuer(terminal, parsedAnchors) ?? parsedAnchors.find((anchor) => anchor.evidence.fingerprintSha256 === terminal.evidence.fingerprintSha256);
  const anchorVerificationSucceeded = anchorMatch
    ? anchorMatch.evidence.fingerprintSha256 === terminal.evidence.fingerprintSha256 || safelyVerifies(anchorMatch, terminal)
    : false;
  const trustedByTlLote = Boolean(anchorMatch) && anchorVerificationSucceeded && signatureFailures.length === 0 && continuityFailures.length === 0;
  checks.push(check(
    "chain.trust_anchor_match",
    trustedByTlLote ? "pass" : "warn",
    trustedByTlLote ? "info" : "warning",
    trustedByTlLote ? "Chain terminates at a separately supplied TL/LoTE trust anchor." : "Chain does not terminate at a separately supplied TL/LoTE trust anchor.",
    anchorMatch ? { fingerprintSha256: anchorMatch.evidence.fingerprintSha256 } : undefined,
  ));
  checks.push(check(
    "chain.rpac_access_ca_anchor",
    isAccessCertificateRole(input.declaredRole) && trustedByTlLote ? "pass" : isAccessCertificateRole(input.declaredRole) ? "warn" : "not_checked",
    isAccessCertificateRole(input.declaredRole) && trustedByTlLote ? "info" : isAccessCertificateRole(input.declaredRole) ? "warning" : "info",
    isAccessCertificateRole(input.declaredRole)
      ? trustedByTlLote ? "RPAC/WRPAC chain reaches a supplied Access CA trust anchor." : "RPAC/WRPAC chain is not trusted by a supplied Access CA trust anchor."
      : "RPAC/WRPAC Access CA anchoring was not checked because no access-certificate role was declared.",
  ));
  checks.push(check("revocation.not_checked", "not_checked", "info", "Revocation checking is not implemented; no CRL or OCSP request was made."));
  const chainStructurallyValid = continuityFailures.length === 0 && signatureFailures.length === 0 && validityFailures.length === 0 && leaf.evidence.basicConstraintsCa !== true && nonCaIntermediates.length === 0;
  return result(input.declaredRole, parsedChain, parsedAnchors, chainStructurallyValid, trustedByTlLote, checks);
}

function result(declaredRole: EudiTrustRole | undefined, chain: ParsedCertificate[], anchors: ParsedCertificate[], chainStructurallyValid: boolean, trustedByTlLote: boolean, checks: CheckResult[]): CertificateChainAssessment {
  return { declaredRole, certificates: chain.map((entry) => entry.evidence), trustAnchors: anchors.map((entry) => entry.evidence), chainStructurallyValid, trustedByTlLote, checks };
}

function normalizeChain(chain: string | string[], format: CertificateChainAssessmentInput["format"]): string[] {
  const values = Array.isArray(chain) ? chain : [chain];
  if (format === "pem" || (!format && values.some((value) => value.includes("BEGIN CERTIFICATE")))) {
    return values.flatMap((value) => value.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [value]);
  }
  return values;
}

function parseCertificate(material: string, position: ChainCertificateEvidence["position"], assessmentDate: Date): ParsedCertificate | undefined {
  try {
    const clean = normalizeBase64Certificate(material);
    const der = Buffer.from(clean, "base64");
    const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(der.toString("binary")));
    const basicConstraints = cert.getExtension("basicConstraints") as { cA?: boolean } | undefined;
    const keyUsage = cert.getExtension("keyUsage") as Record<string, unknown> | undefined;
    const extendedKeyUsage = cert.getExtension("extKeyUsage") as Record<string, unknown> | undefined;
    return {
      cert,
      evidence: {
        position,
        subject: attributesToString(cert.subject.attributes),
        issuer: attributesToString(cert.issuer.attributes),
        serialNumber: cert.serialNumber,
        notBefore: cert.validity.notBefore.toISOString(),
        notAfter: cert.validity.notAfter.toISOString(),
        fingerprintSha256: sha256Hex(der),
        validAtAssessmentTime: assessmentDate >= cert.validity.notBefore && assessmentDate <= cert.validity.notAfter,
        basicConstraintsCa: basicConstraints?.cA,
        keyUsage: extensionNames(keyUsage, ["digitalSignature", "keyCertSign", "cRLSign", "keyEncipherment"]),
        extendedKeyUsage: extensionNames(extendedKeyUsage, ["serverAuth", "clientAuth", "codeSigning", "emailProtection"]),
      },
    };
  } catch {
    return undefined;
  }
}

function findAnchorIssuer(child: ParsedCertificate, anchors: ParsedCertificate[]): ParsedCertificate | undefined {
  return anchors.find((anchor) => child.evidence.issuer === anchor.evidence.subject);
}

function safelyVerifies(issuer: ParsedCertificate, child: ParsedCertificate): boolean {
  try {
    return issuer.cert.verify(child.cert);
  } catch {
    return false;
  }
}

function keyUsageCheck(leaf: ParsedCertificate, intermediates: ParsedCertificate[]): CheckResult {
  const leafUsage = leaf.evidence.keyUsage ?? [];
  const invalidIntermediates = intermediates.filter((certificate) => certificate.evidence.keyUsage && !certificate.evidence.keyUsage.includes("keyCertSign"));
  const status = leafUsage.length === 0 && intermediates.every((certificate) => !certificate.evidence.keyUsage) ? "not_checked" : invalidIntermediates.length === 0 ? "pass" : "warn";
  return check("chain.key_usage_and_extended_key_usage", status, status === "pass" ? "info" : "warning", status === "not_checked" ? "Key usage and extended key usage were not present in the parsed certificate extensions." : invalidIntermediates.length === 0 ? "Available key usage and extended key usage evidence is compatible with the implemented chain roles." : "One or more intermediate certificates lack keyCertSign in available key-usage evidence.", { leafKeyUsage: leafUsage, leafExtendedKeyUsage: leaf.evidence.extendedKeyUsage, invalidIntermediateFingerprints: invalidIntermediates.map((certificate) => certificate.evidence.fingerprintSha256) });
}

function extensionNames(extension: Record<string, unknown> | undefined, names: string[]): string[] | undefined {
  if (!extension) return undefined;
  return names.filter((name) => extension[name] === true);
}

function attributesToString(attributes: forge.pki.CertificateField[]): string {
  return attributes.map((attribute) => `${attribute.shortName ?? attribute.name}=${String(attribute.value)}`).join(", ");
}

function check(id: string, status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult {
  return { id, category: "certificates", status, severity, message, evidence };
}
