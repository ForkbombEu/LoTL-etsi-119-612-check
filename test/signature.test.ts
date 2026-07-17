import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseXml } from "../src/xml/parse.js";
import { assessSignature } from "../src/xml/signature.js";

const differentCertificate = "MIIDdTCCAl2gAwIBAgIUWxIWY6AwGlj2z6dvU0SPFphtoyowDQYJKoZIhvcNAQELBQAwSjEjMCEGA1UEAwwaRGlmZmVyZW50IFRlc3QgQ2VydGlmaWNhdGUxFjAUBgNVBAoMDVdFIEJVSUxEIFRlc3QxCzAJBgNVBAYTAkVVMB4XDTI2MDcxNzEzNTQxNloXDTM2MDcxNDEzNTQxNlowSjEjMCEGA1UEAwwaRGlmZmVyZW50IFRlc3QgQ2VydGlmaWNhdGUxFjAUBgNVBAoMDVdFIEJVSUxEIFRlc3QxCzAJBgNVBAYTAkVVMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1ZPOYnfD+0ATkOmEWAIKzovFD2xWMJTp7XVkNY4W4EEdYpmcC11jVb3k+PBC3y4IJQoRYx5eG0gHRFMSas5QV7+81mn/ALOrOFws4RQ3dGySew4HJ5PYT5BqOnGRLaXzTcXdT9LfzkMR6PGphhu5iLxa6shU4CvSkxhRbcik8xkSeklXmFtwZCLmGVzq7Pn/zFWB4/lIUCp6kfcwhXVg+dOpVY7QAGXDIkZtlSQjf4W8++v8FlJYkjnhArBzhcRceoNmDlrg8U6DYfCZpTZIHJv4g8ScMCPkNv7FFtYFtDyxm4aRKKazBTekJo+yoUTaOYTF10eiNkNhaTikaPtFDQIDAQABo1MwUTAdBgNVHQ4EFgQUA+PNEqIOP8ctvEHl8vZIRqZeL88wHwYDVR0jBBgwFoAUA+PNEqIOP8ctvEHl8vZIRqZeL88wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAGZ0eDwpN80ADR8oxGvdSC7XF8iElu7AXRlWejKmmtQYENb0bWa/m9lEYXUdrPEUa/6m56PqFsCKijDc4iVcVKW1aBWcJXG7Z946lxWseBnCzpBSNcDV6be+evFDF3Q5NO7qDehV2gXtRtUE4KsncE0pJHJPEwzTFk5GOKEp2kOiAr594O8eoSlxdOpalr5+twoNUessIaHWiu0y21w6uc47p6NAcQaQo0cD6aVIA6YvICaiRh3XolEl+Cw0L55LwxPLnrZvd4ptE2c9X0dyttJsfbW00IEgik7FNDkXy+Dg5Bdbpm5wZMcydgq+fNsBUWUoITKXw5DHlOq1TcUaCsg==";

async function signedFixture(): Promise<string> {
  return readFile("test/fixtures/tsl-signed-unsupported.xml", "utf8");
}

function withFirstListCertificate(xml: string, certificate: string): string {
  return xml.replace(
    "<TrustServiceProviderList />",
    `<TrustServiceProviderList><TrustServiceProvider><TSPServices><TSPService><ServiceInformation><ServiceDigitalIdentity><DigitalId><X509Certificate>${certificate}</X509Certificate></DigitalId></ServiceDigitalIdentity></ServiceInformation></TSPService></TSPServices></TrustServiceProvider></TrustServiceProviderList>`,
  );
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

  it("matches the first list certificate public key to the ds:KeyInfo signing certificate", async () => {
    const xml = await signedFixture();
    const signingCertificate = xml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)?.[1];
    if (!signingCertificate) throw new Error("Fixture must contain a signing certificate.");
    const document = parseXml(withFirstListCertificate(xml, signingCertificate)).document;
    if (!document) throw new Error("Fixture must parse.");

    const result = assessSignature(xml, document, new Date("2026-08-01T00:00:00Z"), {
      verifier: () => ({ status: "pass", message: "Test verifier accepted the signature." }),
    }, { requireFirstListCertificateMatch: true });

    expect(result.checks).toContainEqual(expect.objectContaining({
      id: "signature.first_list_certificate_public_key_match",
      status: "pass",
      evidence: expect.objectContaining({
        listPublicKeyFingerprintSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        signingPublicKeyFingerprintSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
  });

  it("fails when the first list certificate public key differs from ds:KeyInfo", async () => {
    const xml = await signedFixture();
    const document = parseXml(withFirstListCertificate(xml, differentCertificate)).document;
    if (!document) throw new Error("Fixture must parse.");

    const result = assessSignature(xml, document, new Date("2026-08-01T00:00:00Z"), {
      verifier: () => ({ status: "pass", message: "Test verifier accepted the signature." }),
    }, { requireFirstListCertificateMatch: true });

    expect(result.checks).toContainEqual(expect.objectContaining({
      id: "signature.first_list_certificate_public_key_match",
      status: "fail",
    }));
  });
});
