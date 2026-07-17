import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseXml } from "../src/xml/parse.js";
import { assessSignature } from "../src/xml/signature.js";

async function signedFixture(): Promise<string> {
  return readFile("test/fixtures/tsl-signed-unsupported.xml", "utf8");
}

describe("assessSignature", () => {
  it("reports an unsigned XML artifact with explicit unattempted signature checks", async () => {
    const xml = await readFile("test/fixtures/tsl-valid-ish.xml", "utf8");
    const document = parseXml(xml).document;
    if (!document) throw new Error("Fixture must parse.");
    const result = assessSignature(xml, document);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "signature.present", status: "fail" }),
        expect.objectContaining({ id: "signature.signing_certificate_present", status: "not_checked" }),
        expect.objectContaining({ id: "signature.cryptographic_verification_attempted", status: "not_checked" }),
        expect.objectContaining({ id: "signature.cryptographic_verification_result", status: "not_checked" }),
        expect.objectContaining({ id: "signature.xades_properties_detected", status: "not_checked" }),
      ]),
    );
  });

  it("extracts signing-certificate evidence and reports unsupported verification without faking success", async () => {
    const xml = await signedFixture();
    const document = parseXml(xml).document;
    if (!document) throw new Error("Fixture must parse.");
    const result = assessSignature(xml, document, new Date("2026-08-01T00:00:00Z"), {
      verifier: () => ({
        status: "not_checked",
        message: "Verification unsupported by the test verifier.",
      }),
    });
    expect(result.certificates).toEqual([
      expect.objectContaining({
        source: "xml_signature",
        subject: expect.any(String),
        issuer: expect.any(String),
        serialNumber: expect.any(String),
        notBefore: expect.any(String),
        notAfter: expect.any(String),
        fingerprintSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        validAtAssessmentTime: true,
      }),
    ]);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "signature.present", status: "pass" }),
        expect.objectContaining({ id: "signature.signing_certificate_present", status: "pass" }),
        expect.objectContaining({ id: "signature.signing_certificate_parsed", status: "pass" }),
        expect.objectContaining({ id: "signature.cryptographic_verification_attempted", status: "pass" }),
        expect.objectContaining({ id: "signature.cryptographic_verification_result", status: "not_checked" }),
        expect.objectContaining({ id: "signature.xades_properties_detected", status: "pass" }),
      ]),
    );
  });
});
