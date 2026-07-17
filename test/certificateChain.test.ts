import forge from "node-forge";
import { describe, expect, it } from "vitest";
import { assessCertificateChain } from "../src/eudi/certificateChain.js";

interface IssuedCertificate {
  certificate: forge.pki.Certificate;
  privateKey: forge.pki.rsa.PrivateKey;
  base64: string;
}

let serialNumber = 0;

function issueCertificate(commonName: string, isCa: boolean, issuer?: IssuedCertificate, validity?: { notBefore: Date; notAfter: Date }): IssuedCertificate {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = `${++serialNumber}`;
  certificate.validity.notBefore = validity?.notBefore ?? new Date("2025-01-01T00:00:00Z");
  certificate.validity.notAfter = validity?.notAfter ?? new Date("2030-01-01T00:00:00Z");
  certificate.setSubject([{ name: "commonName", value: commonName }]);
  certificate.setIssuer(issuer?.certificate.subject.attributes ?? certificate.subject.attributes);
  certificate.setExtensions([
    { name: "basicConstraints", cA: isCa },
    { name: "keyUsage", digitalSignature: !isCa, keyCertSign: isCa, cRLSign: isCa },
    { name: "extKeyUsage", clientAuth: !isCa },
  ]);
  certificate.sign(issuer?.privateKey ?? keys.privateKey, forge.md.sha256.create());
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
  return { certificate, privateKey: keys.privateKey, base64: Buffer.from(der, "binary").toString("base64") };
}

const root = issueCertificate("Access CA Root", true);
const intermediate = issueCertificate("Access CA Intermediate", true, root);
const rpac = issueCertificate("RPAC End Entity", false, intermediate);
const expiredRpac = issueCertificate("Expired RPAC", false, intermediate, {
  notBefore: new Date("2024-01-01T00:00:00Z"),
  notAfter: new Date("2025-01-01T00:00:00Z"),
});
const assessmentDate = new Date("2026-07-01T00:00:00Z");

describe("assessCertificateChain", () => {
  it("assesses an x5c RPAC chain separately from its Access CA trust anchor", () => {
    const result = assessCertificateChain({
      chain: [rpac.base64, intermediate.base64],
      format: "x5c",
      trustAnchors: [root.base64],
      declaredRole: "access_ca_or_wrpac_provider",
      assessmentDate,
    });
    expect(result).toMatchObject({ chainStructurallyValid: true, trustedByTlLote: true });
    expect(result.certificates.map((certificate) => certificate.position)).toEqual(["end_entity", "intermediate"]);
    expect(result.trustAnchors.map((certificate) => certificate.position)).toEqual(["trust_anchor"]);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chain.rpac_access_ca_anchor", status: "pass" }),
      expect.objectContaining({ id: "revocation.not_checked", status: "not_checked" }),
    ]));
  });

  it("accepts a PEM chain input", () => {
    const result = assessCertificateChain({
      chain: `${forge.pki.certificateToPem(rpac.certificate)}\n${forge.pki.certificateToPem(intermediate.certificate)}`,
      format: "pem",
      trustAnchors: [root.base64],
      assessmentDate,
    });
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chain.certificates_parsed", status: "pass" }),
      expect.objectContaining({ id: "chain.trust_anchor_match", status: "pass" }),
    ]));
  });

  it("reports an unknown trust anchor separately from chain structure", () => {
    const unknownAnchor = issueCertificate("Unknown Access CA", true);
    const result = assessCertificateChain({ chain: [rpac.base64, intermediate.base64], trustAnchors: [unknownAnchor.base64], assessmentDate });
    expect(result).toMatchObject({ chainStructurallyValid: true, trustedByTlLote: false });
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chain.trust_anchor_match", status: "warn" }),
    ]));
  });

  it("reports an expired RPAC while preserving the separate anchor result", () => {
    const result = assessCertificateChain({ chain: [expiredRpac.base64, intermediate.base64], trustAnchors: [root.base64], assessmentDate });
    expect(result.chainStructurallyValid).toBe(false);
    expect(result.trustedByTlLote).toBe(true);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chain.validity_period", status: "warn" }),
      expect.objectContaining({ id: "chain.trust_anchor_match", status: "pass" }),
    ]));
  });

  it("reports a malformed certificate chain without crashing", () => {
    const result = assessCertificateChain({ chain: ["not-a-certificate"], trustAnchors: [root.base64], assessmentDate });
    expect(result.chainStructurallyValid).toBe(false);
    expect(result.trustedByTlLote).toBe(false);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chain.certificates_parsed", status: "fail" }),
      expect.objectContaining({ id: "revocation.not_checked", status: "not_checked" }),
    ]));
  });
});
