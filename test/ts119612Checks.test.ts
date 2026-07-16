import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessTs119612Xml } from "../src/xml/ts119612Checks.js";

describe("assessTs119612Xml", () => {
  it("reports granular checks for valid-ish XML", async () => {
    const xml = await readFile("test/fixtures/tsl-valid-ish.xml", "utf8");
    const result = await assessTs119612Xml(xml, {
      strict: false,
      assessmentDate: new Date("2026-02-01T00:00:00Z"),
    });
    expect(result.detected.artifactKind).toBe("ts119612_xml_tsl");
    expect(result.ts119612.checks.some((c) => c.id === "structure.scheme_information" && c.status === "pass")).toBe(true);
    expect(result.extracted?.tslVersionIdentifier).toBe("6");
    expect(result.extracted?.trustServiceProviderCount).toBe(1);
    expect(result.extracted?.serviceCount).toBeGreaterThan(0);
  });

  it("reports SchemeInformation as critical missing structure", async () => {
    const xml = await readFile("test/fixtures/tsl-missing-scheme.xml", "utf8");
    const result = await assessTs119612Xml(xml, {
      strict: false,
      assessmentDate: new Date("2026-02-01T00:00:00Z"),
    });
    expect(result.ts119612.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "structure.scheme_information",
          status: "fail",
          severity: "critical",
        }),
      ]),
    );
    expect(result.ts119612.conformanceLevel).toBe("non_conformant");
  });
});
