import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessArtifactContent } from "../src/audit.js";
import { assessTs119612Xml } from "../src/xml/ts119612Checks.js";

const FIXTURE = "test/fixtures/ts119602-alternative-pub-eaa.xml";

describe("ETSI TS 119 602 Annex A.2.2 alternative XML binding", () => {
  it("emits a complete typed Table A.1 fact set from the TS 119 612 assessor", async () => {
    const assessed = await assessTs119612Xml(await readFile(FIXTURE, "utf8"), {
      strict: false,
      assessmentDate: new Date("2026-07-23T00:00:00Z"),
    });
    expect(assessed.ts119612Facts).toMatchObject({
      sourceNamespace: "http://uri.etsi.org/02231/v2#",
      sourceSchemaStatus: "pass",
      sourceBindingStatus: "pass",
      metadata: {
        version: 6,
        sequence: 1,
        loteType: "http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList",
        historyPeriod: 65535,
      },
      entities: { containerPresent: true },
    });
    expect(assessed.ts119612Facts?.mappedFields).toHaveLength(34);
    expect(assessed.ts119612Facts?.mappedFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceComponent: "TSLVersionIdentifier", targetComponent: "LoTEVersionIdentifier", sourceClause: "5.3.1", targetClause: "6.3.1" }),
      expect.objectContaining({ sourceComponent: "TrustServiceProviderList", targetComponent: "TrustedEntitiesList", present: true }),
      expect.objectContaining({ sourceComponent: "TSPName", targetComponent: "TEName", count: 1 }),
      expect.objectContaining({ sourceComponent: "TSPServiceDefinitionURI", targetComponent: "TEServiceDefinitionURI" }),
      expect.objectContaining({ sourceComponent: "ServiceHistory", targetComponent: "ServiceHistory" }),
    ]));
  });

  it("maps validated facts and applies base and Annex H checks without TS 119 602 XML reparsing", async () => {
    const result = await assessArtifactContent({
      content: await readFile(FIXTURE, "utf8"),
      contentType: "application/xml",
      strict: false,
      includeJsonLoteChecks: false,
    });
    expect(result.ts119602Classification).toMatchObject({ binding: "ts119612_alternative_xml", profile: "pub_eaa_providers", applicability: "applicable" });
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "ts119602.binding.ts119612_mapping",
        status: "pass",
        evidence: expect.objectContaining({ expectedRowCount: 34, observedRowCount: 34, tableComplete: true, xmlReparsedByTs119602: false }),
      }),
      expect.objectContaining({ id: "ts119602.binding.ts119612_mapping.version_conflict", status: "inconclusive" }),
      expect.objectContaining({ id: "ts119602.structure.lote_tag", status: "inconclusive" }),
      expect.objectContaining({ id: "ts119602.structure.scheme_information_presence", status: "pass" }),
      expect.objectContaining({ id: "ts119602.entities.list", status: "pass" }),
      expect.objectContaining({ id: "ts119602.service.information", status: "pass" }),
      expect.objectContaining({ id: "ts119602.profile.dispatch", status: "pass" }),
      expect.objectContaining({ id: "ts119602.profile.pub_eaa_providers.binding", status: "pass" }),
      expect.objectContaining({ id: "ts119602.profile.pub_eaa_providers.scheme_information", status: "fail" }),
      expect.objectContaining({ id: "ts119602.profile.pub_eaa_providers.service", status: "pass" }),
      expect.objectContaining({ id: "ts119602.profile.pub_eaa_providers.signature", status: "fail" }),
    ]));
    expect(result.extracted?.jsonLote).toMatchObject({
      XmlBinding: "ts119612_alternative_xml",
      LoTEVersionIdentifier: 6,
      LoTESequenceNumber: 1,
      TrustedEntityCount: 1,
      ServiceCount: 1,
      TableA1Mapped: true,
    });
  });

  it("stops profile assessment when the source TS 119 612 schema does not pass", async () => {
    const xml = (await readFile(FIXTURE, "utf8")).replace(/    <SchemeOperatorName>[\s\S]*?    <\/SchemeOperatorName>\n/, "");
    const result = await assessArtifactContent({
      content: xml,
      contentType: "application/xml",
      strict: false,
      includeJsonLoteChecks: false,
    });
    expect(find(result.ts119602.checks, "ts119602.binding.ts119612_mapping")).toMatchObject({ status: "fail", severity: "critical" });
    expect(find(result.ts119602.checks, "ts119602.profile.mapping_gate")).toMatchObject({ status: "fail", severity: "critical" });
    expect(result.ts119602.checks.some((entry) => entry.id === "ts119602.profile.dispatch")).toBe(false);
    expect(result.extracted?.jsonLote).toMatchObject({ TableA1Mapped: false });
  });
});

function find(checks: Array<{ id: string }>, id: string) {
  const finding = checks.find((entry) => entry.id === id);
  if (!finding) throw new Error(`Missing finding ${id}`);
  return finding;
}
