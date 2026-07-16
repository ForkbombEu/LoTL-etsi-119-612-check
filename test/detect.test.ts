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

  it("detects JSON LoTE", async () => {
    const bytes = await readFile("test/fixtures/json-lote.json");
    expect(detectArtifact(bytes, "application/json")).toMatchObject({
      format: "json",
      artifactKind: "json_lote",
    });
  });

  it("detects HTML error pages", async () => {
    const bytes = await readFile("test/fixtures/html-error.html");
    expect(detectArtifact(bytes, "text/html")).toMatchObject({
      format: "html",
      artifactKind: "html_error",
    });
  });
});
