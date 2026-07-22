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
    expect(result.ts119612.conformanceLevel).not.toBe("conformant");
    expect(result.ts119612.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "parse.xml", status: "pass" }),
        expect.objectContaining({ id: "structure.trust_service_provider_list", status: "pass" }),
        expect.objectContaining({
          id: "ts119612.coverage.complete",
          status: "not_checked",
          evidence: expect.objectContaining({ total: 69, implemented: 1, complete: false }),
        }),
      ]),
    );
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

  it("reports bad namespace as not applicable with explicit root evidence", async () => {
    const xml = await readFile("test/fixtures/tsl-bad-namespace.xml", "utf8");
    const result = await assessTs119612Xml(xml, { strict: false });
    expect(result.detected.artifactKind).toBe("xml_lotl_like");
    expect(result.ts119612.conformanceLevel).toBe("not_applicable");
    expect(result.ts119612.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "parse.root_name", status: "pass" }),
        expect.objectContaining({ id: "parse.root_namespace", status: "fail" }),
      ]),
    );
  });

  it("warns for the observed EUDI RI namespace variant while accepting it as TS 119 612", async () => {
    const xml = await readFile("test/fixtures/tsl-valid-ish.xml", "utf8");
    const result = await assessTs119612Xml(xml, { strict: false });
    expect(result.detected.artifactKind).toBe("ts119612_xml_tsl");
    expect(result.ts119612.checks).toContainEqual(expect.objectContaining({
      id: "parse.root_namespace",
      status: "warn",
      severity: "warning",
    }));
    expect(result.ts119612.checks).toContainEqual(expect.objectContaining({
      id: "ts119612.binding.supported",
      status: "warn",
      evidence: expect.objectContaining({
        compatibilityInput: expect.objectContaining({ normativeStatus: "not_established" }),
      }),
    }));
  });

  it("accepts the canonical namespace without a namespace warning", async () => {
    const xml = (await readFile("test/fixtures/tsl-valid-ish.xml", "utf8"))
      .replace("http://uri.etsi.org/19612/v2.4.1#", "http://uri.etsi.org/02231/v2#");
    const result = await assessTs119612Xml(xml, { strict: false });
    expect(result.detected.artifactKind).toBe("ts119612_xml_tsl");
    expect(result.ts119612.checks).toContainEqual(expect.objectContaining({
      id: "parse.root_namespace",
      status: "pass",
      severity: "info",
    }));
    expect(result.ts119612.checks).toContainEqual(expect.objectContaining({
      id: "ts119612.binding.supported",
      status: "pass",
      evidence: expect.objectContaining({
        observedTslVersionIdentifier: "6",
        standard: expect.objectContaining({ version: "V2.4.1" }),
      }),
    }));
    expect(result.ts119612.conformanceLevel).not.toBe("conformant");
  });

  it("does not select V2.4.1 when the canonical namespace has another format version", async () => {
    const xml = (await readFile("test/fixtures/tsl-valid-ish.xml", "utf8"))
      .replace("http://uri.etsi.org/19612/v2.4.1#", "http://uri.etsi.org/02231/v2#")
      .replace("<tsl:TSLVersionIdentifier>6</tsl:TSLVersionIdentifier>", "<tsl:TSLVersionIdentifier>5</tsl:TSLVersionIdentifier>");
    const result = await assessTs119612Xml(xml, { strict: false });
    expect(result.ts119612.checks).toContainEqual(expect.objectContaining({
      id: "ts119612.binding.supported",
      status: "fail",
      severity: "error",
    }));
    expect(result.ts119612.conformanceLevel).not.toBe("conformant");
  });

  it("warns when NextUpdate is expired at assessment time", async () => {
    const xml = await readFile("test/fixtures/tsl-expired-next-update.xml", "utf8");
    const result = await assessTs119612Xml(xml, {
      strict: false,
      assessmentDate: new Date("2026-02-01T00:00:00Z"),
    });
    expect(result.ts119612.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "dates.issue_valid", status: "pass" }),
        expect.objectContaining({ id: "dates.next_update_valid", status: "pass" }),
        expect.objectContaining({ id: "dates.next_after_issue", status: "pass" }),
        expect.objectContaining({ id: "dates.next_update_expired", status: "warn" }),
      ]),
    );
  });
});
