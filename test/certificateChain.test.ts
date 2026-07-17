import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessCertificateChain } from "../src/eudi/certificateChain.js";

async function fixtureCertificates(): Promise<{ activeEc: string; expiredEc: string; unknownAnchor: string }> {
  const document = JSON.parse(await readFile("test/fixtures/list_of_trusted_lists.json", "utf8")) as {
    LoTE: { ListAndSchemeInformation: { PointersToOtherLoTE: Array<{ LoTELocation: string; ServiceDigitalIdentities: Array<{ X509Certificates: Array<{ val: string }> }> }> } };
  };
  const pointerValue = (fragment: string) => {
    const pointer = document.LoTE.ListAndSchemeInformation.PointersToOtherLoTE.find((item) => item.LoTELocation.includes(fragment));
    if (!pointer) throw new Error(`Fixture pointer '${fragment}' is missing.`);
    return pointer.ServiceDigitalIdentities[0].X509Certificates[0].val;
  };
  return {
    activeEc: pointerValue("nxd-eaa-providers-lote.json"),
    expiredEc: pointerValue("hD5M82eY"),
    unknownAnchor: pointerValue("wrpac-providers-lote.json"),
  };
}

const assessmentDate = new Date("2026-08-01T00:00:00Z");

describe("assessCertificateChain", () => {
  it("assesses an EC RPAC fixture separately from its selected trust anchor", async () => {
    const { activeEc } = await fixtureCertificates();
    const result = assessCertificateChain({
      chain: [activeEc],
      format: "x5c",
      trustAnchors: [activeEc],
      declaredRole: "access_ca_or_wrpac_provider",
      assessmentDate,
    });
    expect(result).toMatchObject({ chainStructurallyValid: true, trustedByTlLote: true });
    expect(result.certificates.map((certificate) => certificate.position)).toEqual(["end_entity"]);
    expect(result.trustAnchors.map((certificate) => certificate.position)).toEqual(["trust_anchor"]);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chain.rpac_access_ca_anchor", status: "pass" }),
      expect.objectContaining({ id: "revocation.not_checked", status: "not_checked" }),
    ]));
  });

  it("accepts an EC PEM chain input", async () => {
    const { activeEc } = await fixtureCertificates();
    const pem = new X509Certificate(Buffer.from(activeEc, "base64")).toString();
    const result = assessCertificateChain({ chain: pem, format: "pem", trustAnchors: [activeEc], assessmentDate });
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chain.certificates_parsed", status: "pass" }),
      expect.objectContaining({ id: "chain.trust_anchor_match", status: "pass" }),
    ]));
  });

  it("reports an unknown trust anchor separately from EC chain structure", async () => {
    const { activeEc, unknownAnchor } = await fixtureCertificates();
    const result = assessCertificateChain({ chain: [activeEc], trustAnchors: [unknownAnchor], assessmentDate });
    expect(result).toMatchObject({ chainStructurallyValid: true, trustedByTlLote: false });
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chain.trust_anchor_match", status: "warn" }),
    ]));
  });

  it("reports an expired EC RPAC while preserving the separate anchor result", async () => {
    const { expiredEc } = await fixtureCertificates();
    const result = assessCertificateChain({ chain: [expiredEc], trustAnchors: [expiredEc], assessmentDate });
    expect(result.chainStructurallyValid).toBe(false);
    expect(result.trustedByTlLote).toBe(true);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chain.validity_period", status: "warn" }),
      expect.objectContaining({ id: "chain.trust_anchor_match", status: "pass" }),
    ]));
  });

  it("reports a malformed certificate chain without crashing", async () => {
    const { activeEc } = await fixtureCertificates();
    const result = assessCertificateChain({ chain: ["not-a-certificate"], trustAnchors: [activeEc], assessmentDate });
    expect(result.chainStructurallyValid).toBe(false);
    expect(result.trustedByTlLote).toBe(false);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "chain.certificates_parsed", status: "fail" }),
      expect.objectContaining({ id: "revocation.not_checked", status: "not_checked" }),
    ]));
  });
});
