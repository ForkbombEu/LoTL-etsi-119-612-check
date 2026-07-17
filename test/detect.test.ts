import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { detectArtifact } from "../src/detect.js";

describe("detectArtifact", () => {
  it("detects TS 119 612 XML", async () => {
    const bytes = await readFile("test/fixtures/tsl-valid-ish.xml");
    expect(detectArtifact(bytes, "application/xml")).toMatchObject({
      format: "xml",
      artifactKind: "ts119612_xml_tsl",
    });
  });

  it("distinguishes a TS 119 612 XML LoTL", () => {
    const xml = `<?xml version="1.0"?><TrustServiceStatusList xmlns="http://uri.etsi.org/19612/v2.4.1#"><SchemeInformation><TSLType>http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUlistofthelists</TSLType></SchemeInformation></TrustServiceStatusList>`;
    expect(detectArtifact(Buffer.from(xml), "application/xml")).toMatchObject({
      format: "xml",
      artifactKind: "ts119612_xml_lotl",
    });
  });

  it("does not assume a similarly named XML document is TS 119 612", () => {
    const xml = "<TrustServiceStatusList xmlns=\"https://example.test/not-etsi\" />";
    expect(detectArtifact(Buffer.from(xml), "application/xml")).toMatchObject({
      format: "xml",
      artifactKind: "xml_lotl_like",
    });
  });

  it("detects JSON LoTE", async () => {
    const bytes = await readFile("test/fixtures/json-lote.json");
    expect(detectArtifact(bytes, "application/json")).toMatchObject({
      format: "json",
      artifactKind: "json_lote",
    });
  });

  it("distinguishes JSON LoTL from JSON LoTE", async () => {
    const bytes = await readFile("test/fixtures/lotl.json");
    expect(detectArtifact(bytes, "application/json")).toMatchObject({
      format: "json",
      artifactKind: "json_lotl",
    });
  });

  it("detects HTML error pages", async () => {
    const bytes = await readFile("test/fixtures/html-error.html");
    expect(detectArtifact(bytes, "text/html")).toMatchObject({
      format: "html",
      artifactKind: "html_error",
    });
  });

  it("keeps unrecognized content unknown", () => {
    expect(detectArtifact(Buffer.from("not a trust-list artifact"), "application/octet-stream")).toEqual({
      format: "text",
      artifactKind: "unknown",
    });
  });
});
