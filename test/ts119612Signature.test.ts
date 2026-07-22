import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseXml } from "../src/xml/parse.js";
import { assessSignature } from "../src/xml/signature.js";

const FIXTURE = "test/fixtures/ts119612-signature-profile.xml";
const FINGERPRINT = "f67ceee86d57b888ffac479f1466e7acc38f7e36318cc5374d0fcf3406135efa";
const ASSESSMENT_DATE = new Date("2026-07-23T12:00:00Z");

async function fixture(): Promise<{ xml: string; certificate: string }> {
  const xml = await readFile(FIXTURE, "utf8");
  const certificate = xml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)?.[1];
  if (!certificate) throw new Error("Signature fixture certificate is missing.");
  return { xml, certificate };
}

async function assess(xml: string, context: Parameters<typeof assessSignature>[4] = {}) {
  const document = parseXml(xml).document;
  if (!document) throw new Error("Signature fixture must parse.");
  return assessSignature(xml, document, ASSESSMENT_DATE, {
    verifier: () => ({ status: "pass", message: "Deterministic test verifier accepted the signature." }),
  }, {
    requireBaselineB: true,
    requireTs119612Profile: true,
    schemeTerritory: "EU",
    schemeOperatorNames: ["Example Operator"],
    ...context,
  });
}

describe("ETSI TS 119 612 signature profile", () => {
  it("checks the exact local Annex B, XAdES-B-B, and TLSO certificate constraints", async () => {
    const { xml } = await fixture();
    const result = await assess(xml);
    for (const id of [
      "signature.xades_baseline_b.structure",
      "signature.xades_baseline_b.signing_certificate_reference",
      "ts119612.signature.annex_b",
      "ts119612.signature.algorithm_identifier",
      "ts119612.signature.key_info",
      "ts119612.signature.certificate.key_usage",
      "ts119612.signature.certificate.extended_key_usage",
      "ts119612.signature.certificate.subject_key_identifier",
      "ts119612.signature.certificate.basic_constraints",
      "ts119612.signature.certificate.issuer",
    ]) {
      expect(result.checks).toContainEqual(expect.objectContaining({ id, status: "pass" }));
    }
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: "ts119612.signature.algorithm_policy",
      status: "not_checked",
      evidence: expect.objectContaining({ requiredPolicySource: expect.stringContaining("TS 119 312") }),
    }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "ts119612.signature.certificate_path", status: "not_checked" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "ts119612.signature.revocation", status: "not_checked" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "ts119612.signature.signer_trust", status: "not_checked" }));
  });

  it("uses separately supplied path, revocation, and trust inputs without trusting KeyInfo implicitly", async () => {
    const { xml, certificate } = await fixture();
    const result = await assess(xml, {
      trustedSignerFingerprintsSha256: [FINGERPRINT],
      ts119612SignerEvidence: {
        trustAnchors: [certificate],
        revocation: {
          status: "good",
          source: "deterministic-test-status",
          checkedAt: "2026-07-23T10:00:00Z",
          nextUpdate: "2026-07-24T10:00:00Z",
          signerFingerprintSha256: FINGERPRINT,
        },
      },
    });
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "ts119612.signature.certificate_path", status: "pass" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "ts119612.signature.revocation", status: "pass" }));
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: "ts119612.signature.signer_trust",
      status: "pass",
      evidence: expect.objectContaining({ directTrust: true, pathTrusted: true }),
    }));
  });

  it("reports profile, certificate-chain cardinality, and revoked-status failures independently", async () => {
    const { xml, certificate } = await fixture();
    const malformed = xml
      .replace(
        '<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>\n          <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>',
        '<ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>\n          <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>',
      )
      .replace("</ds:X509Data>", `<ds:X509Certificate>${certificate}</ds:X509Certificate></ds:X509Data>`);
    const result = await assess(malformed, {
      trustedSignerFingerprintsSha256: [FINGERPRINT],
      ts119612SignerEvidence: {
        revocation: {
          status: "revoked",
          source: "deterministic-test-status",
          checkedAt: "2026-07-23T10:00:00Z",
          signerFingerprintSha256: FINGERPRINT,
        },
      },
    });
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "ts119612.signature.annex_b", status: "fail" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "ts119612.signature.key_info", status: "fail" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "ts119612.signature.revocation", status: "fail" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "ts119612.signature.certificate_path", status: "not_checked" }));
  });
});
