import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseLotlJson } from "../src/lotl.js";

describe("parseLotlJson", () => {
  it("counts all PointersToOtherLoTE entries", async () => {
    const text = await readFile("test/fixtures/lotl.json", "utf8");
    const parsed = parseLotlJson(text);
    expect(parsed.summary.pointerCount).toBe(3);
    expect(parsed.summary.uniqueLocationCount).toBe(3);
    expect(parsed.pointers.map((p) => p.location)).toEqual([
      "https://example.test/tl.xml",
      "https://example.test/lote.json",
      "https://example.test/unreachable.xml",
    ]);
  });

  it("extracts declared type and MIME type from LoTEQualifiers", async () => {
    const text = await readFile("test/fixtures/lotl.json", "utf8");
    const parsed = parseLotlJson(text);

    expect(parsed.pointers[0]?.declared).toMatchObject({
      loteType: "xml",
      mimeType: "application/xml",
    });
    expect(parsed.pointers[1]?.declared).toMatchObject({
      loteType: "json",
      mimeType: "application/json",
    });
  });
});
