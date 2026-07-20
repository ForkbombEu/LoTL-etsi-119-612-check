import { describe, expect, it, vi } from "vitest";
import { parseXml } from "../src/xml/parse.js";
import {
  inspectReferences,
  verifyXmlSignatureWithXmlsec,
  type XmlsecRunner,
} from "../src/xml/xmlsec.js";

const DS = "http://www.w3.org/2000/09/xmldsig#";
const CERTIFICATE = "AQ==";

function signedXml(referenceUri: string, rootId = ` Id="root-1"`): {
  xml: string;
  document: Document;
  signature: Element;
} {
  const xml = [
    `<TrustedEntitiesList xmlns="http://uri.etsi.org/019602/v1#" xmlns:ds="${DS}"${rootId}>`,
    "<ds:Signature>",
    "<ds:SignedInfo>",
    `<ds:Reference URI="${referenceUri}"/>`,
    "</ds:SignedInfo>",
    "</ds:Signature>",
    "</TrustedEntitiesList>",
  ].join("");
  const document = parseXml(xml).document;
  if (!document) throw new Error("Test XML must parse.");
  const signature = document.getElementsByTagNameNS(DS, "Signature")[0];
  if (!signature) throw new Error("Test XML must contain a signature.");
  return { xml, document, signature };
}

describe("xmlsec1 XMLDSig adapter", () => {
  it("derives the root namespace, name, ID attribute, and same-document reference dynamically", async () => {
    const fixture = signedXml("#root-1");
    const calls: Array<{ executable: string; args: string[] }> = [];
    const runner: XmlsecRunner = async (executable, args) => {
      calls.push({ executable, args });
      return args[0] === "--version"
        ? { stdout: "xmlsec1 1.3.7 (openssl)\n", stderr: "" }
        : { stdout: "OK\nSignedInfo References (ok/all): 1/1\n", stderr: "" };
    };

    const result = await verifyXmlSignatureWithXmlsec(
      fixture.xml,
      fixture.document,
      fixture.signature,
      CERTIFICATE,
      { executable: "test-xmlsec1", runner },
    );

    expect(result.status).toBe("pass");
    expect(result.attempted).toBe(true);
    expect(result.referenceEvidence).toEqual({
      uris: ["#root-1"],
      expectedRootCovered: true,
      prohibitedUris: [],
      root: {
        localName: "TrustedEntitiesList",
        namespace: "http://uri.etsi.org/019602/v1#",
        idAttribute: "Id",
        id: "root-1",
      },
    });
    expect(calls[1]).toEqual({
      executable: "test-xmlsec1",
      args: [
        "verify",
        "--enabled-reference-uris",
        "empty,same-doc",
        "--pubkey-cert-pem",
        expect.stringMatching(/signer\.pem$/),
        "--id-attr:Id",
        "http://uri.etsi.org/019602/v1#:TrustedEntitiesList",
        expect.stringMatching(/artifact\.xml$/),
      ],
    });
    expect(result.evidence).toEqual(expect.objectContaining({
      version: "xmlsec1 1.3.7 (openssl)",
      commandPolicy: {
        referenceUris: ["empty", "same-doc"],
        explicitSigningCertificate: true,
      },
    }));
  });

  it("supports an enveloped signature that references the whole document with an empty URI", async () => {
    const fixture = signedXml("", "");
    const runner: XmlsecRunner = async (_executable, args) => args[0] === "--version"
      ? { stdout: "xmlsec1 test", stderr: "" }
      : { stdout: "OK", stderr: "" };

    const result = await verifyXmlSignatureWithXmlsec(
      fixture.xml,
      fixture.document,
      fixture.signature,
      CERTIFICATE,
      { runner },
    );

    expect(result.status).toBe("pass");
    expect(result.referenceEvidence.expectedRootCovered).toBe(true);
  });

  it("does not invoke xmlsec1 for an external Reference URI", async () => {
    const fixture = signedXml("https://example.test/detached.xml");
    const runner = vi.fn<XmlsecRunner>();

    const result = await verifyXmlSignatureWithXmlsec(
      fixture.xml,
      fixture.document,
      fixture.signature,
      CERTIFICATE,
      { runner },
    );

    expect(result).toEqual(expect.objectContaining({
      status: "not_checked",
      attempted: false,
      referenceEvidence: expect.objectContaining({
        prohibitedUris: ["https://example.test/detached.xml"],
      }),
    }));
    expect(runner).not.toHaveBeenCalled();
  });

  it("reports an unavailable executable separately from an unsupported xmlsec build", async () => {
    const fixture = signedXml("#root-1");
    const unavailable: XmlsecRunner = async () => {
      throw Object.assign(new Error("spawn xmlsec1 ENOENT"), { code: "ENOENT" });
    };
    const unsupported: XmlsecRunner = async (_executable, args) => {
      if (args[0] === "--version") return { stdout: "xmlsec1 test", stderr: "" };
      throw Object.assign(new Error("verification failed"), {
        code: 1,
        stderr: "transform is not supported",
      });
    };

    const missingResult = await verifyXmlSignatureWithXmlsec(
      fixture.xml,
      fixture.document,
      fixture.signature,
      CERTIFICATE,
      { runner: unavailable },
    );
    const unsupportedResult = await verifyXmlSignatureWithXmlsec(
      fixture.xml,
      fixture.document,
      fixture.signature,
      CERTIFICATE,
      { runner: unsupported },
    );

    expect(missingResult).toEqual(expect.objectContaining({ status: "not_checked", attempted: false }));
    expect(unsupportedResult).toEqual(expect.objectContaining({ status: "not_checked", attempted: true }));
  });

  it("reports when a valid same-document reference does not cover the expected root", () => {
    const fixture = signedXml("#signed-child");
    expect(inspectReferences(fixture.document, fixture.signature)).toEqual(expect.objectContaining({
      uris: ["#signed-child"],
      expectedRootCovered: false,
      prohibitedUris: [],
    }));
  });
});
