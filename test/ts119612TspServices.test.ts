import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { assessTs119612Xml } from "../src/xml/ts119612Checks.js";
import { parseXml } from "../src/xml/parse.js";
import { TS119612_SERVICE_TYPE_REGISTRY } from "../src/standards/ts119612ServiceTypes.js";
import { assessTs119612TspServices } from "../src/xml/ts119612TspServices.js";
import type { XsdCommandRunner } from "../src/xml/xsd.js";

const fixturePath = "test/fixtures/ts119612-tsp-service-valid.xml";

describe("ETSI TS 119 612 TSP and current service information", () => {
  it("pins the complete V2.4.1 registered service-type vocabulary by family", () => {
    expect(TS119612_SERVICE_TYPE_REGISTRY.qualified).toHaveLength(13);
    expect(TS119612_SERVICE_TYPE_REGISTRY.nonQualified).toHaveLength(24);
    expect(TS119612_SERVICE_TYPE_REGISTRY.national).toHaveLength(15);
    const all = Object.values(TS119612_SERVICE_TYPE_REGISTRY).flat();
    expect(new Set(all).size).toBe(52);
    expect(all).toEqual(expect.arrayContaining([
      "http://uri.etsi.org/TrstSvc/Svctype/EAA/Q",
      "http://uri.etsi.org/TrstSvc/Svctype/EAA/Pub-EAA",
      "http://uri.etsi.org/TrstSvc/Svctype/NationalRootCA-QC",
    ]));
  });

  it("passes exact local TSP and non-PKI service semantics", async () => {
    const assessment = assess(await fixture());
    expect(assessment.tspCount).toBe(1);
    expect(assessment.serviceCount).toBe(1);
    expect(assessment.checks.filter((finding) => ["fail", "warn", "inconclusive"].includes(finding.status))).toEqual([]);
    expect(assessment.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119612.providers.list", status: "pass" }),
      expect.objectContaining({ id: "ts119612.tsp.1.information_structure", status: "pass" }),
      expect.objectContaining({ id: "ts119612.tsp.1.trade_name", status: "pass" }),
      expect.objectContaining({ id: "ts119612.service.1.1.structure", status: "pass" }),
      expect.objectContaining({
        id: "ts119612.service.1.1.type",
        status: "pass",
        evidence: expect.objectContaining({ classification: "national" }),
      }),
      expect.objectContaining({
        id: "ts119612.service.1.1.digital_identity",
        status: "pass",
        evidence: expect.objectContaining({ nonPkiRequired: true }),
      }),
      expect.objectContaining({ id: "ts119612.service.1.1.status", status: "pass" }),
      expect.objectContaining({ id: "ts119612.service.1.1.status_start", status: "pass" }),
      expect.objectContaining({ id: "ts119612.service.1.1.supply_points", status: "pass" }),
    ]));
  });

  it("detects exact provider, TSPInformation, and ServiceInformation nesting", async () => {
    const original = await fixture();
    const duplicateInformation = original.replace(
      "      <TSPServices>",
      "      <TSPInformation/><TSPServices>",
    );
    const missingTradeName = original.replace(
      /        <TSPTradeName>[\s\S]*?        <\/TSPTradeName>\n/,
      "",
    );
    const outOfOrderService = original.replace(
      /            <ServiceName>([\s\S]*?)            <\/ServiceName>\n            <ServiceDigitalIdentity>([\s\S]*?)            <\/ServiceDigitalIdentity>/,
      "            <ServiceDigitalIdentity>$2            </ServiceDigitalIdentity>\n            <ServiceName>$1            </ServiceName>",
    );

    expect(find(assess(duplicateInformation).checks, "ts119612.tsp.1.structure")).toMatchObject({ status: "fail", severity: "critical" });
    expect(find(assess(missingTradeName).checks, "ts119612.tsp.1.information_structure")).toMatchObject({ status: "fail", severity: "critical" });
    expect(find(assess(outOfOrderService).checks, "ts119612.service.1.1.structure")).toMatchObject({ status: "fail", severity: "critical" });
  });

  it("validates TSP identifier, address, information URI, and EU extension criticality", async () => {
    const invalid = (await fixture())
      .replace("NTRIT-EXAMPLE-TRUST-PROVIDER", "Example trade name without identifier")
      .replace("mailto:support@example.test", "ftp://example.test/not-email")
      .replace("https://example.test/provider-information", "relative/provider-information")
      .replace(
        "      </TSPInformation>",
        "        <TSPInformationExtensions><Extension Critical=\"true\"><Unknown/></Extension></TSPInformationExtensions>\n      </TSPInformation>",
      );
    const checks = assess(invalid).checks;

    expect(failedIds(checks)).toEqual(expect.arrayContaining([
      "ts119612.tsp.1.trade_name",
      "ts119612.tsp.1.address",
      "ts119612.tsp.1.information_uri",
      "ts119612.tsp.1.extensions",
    ]));
  });

  it("applies registered type, PKI/non-PKI identity, status, and issue-time rules", async () => {
    const original = await fixture();
    const invalid = original
      .replace("Svctype/RA/nothavingPKIid", "Svctype/CA/QC")
      .replace("2026-01-31T00:00:00Z</StatusStartingTime>", "2026-01-30T23:59:59Z</StatusStartingTime>");
    const checks = assess(invalid).checks;

    expect(find(checks, "ts119612.service.1.1.type")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.1.1.digital_identity")).toMatchObject({ status: "fail", severity: "critical" });
    expect(find(checks, "ts119612.service.1.1.status")).toMatchObject({ status: "fail", severity: "critical" });
    expect(find(checks, "ts119612.service.1.1.status_start")).toMatchObject({ status: "fail" });

    const nonQualified = original.replace("Svctype/RA/nothavingPKIid", "Svctype/EAA/Pub-EAA");
    expect(find(assess(nonQualified).checks, "ts119612.service.1.1.type")).toMatchObject({
      status: "pass",
      evidence: expect.objectContaining({ classification: "non_qualified" }),
    });
    expect(find(assess(nonQualified).checks, "ts119612.service.1.1.status")).toMatchObject({ status: "pass" });

    const qualifiedStatus = invalid.replace("Svcstatus/recognisedatnationallevel", "Svcstatus/granted");
    expect(find(assess(qualifiedStatus).checks, "ts119612.service.1.1.status")).toMatchObject({ status: "pass" });

    const custom = invalid.replace("Svctype/CA/QC", "custom.example.test/service/type");
    expect(find(assess(custom).checks, "ts119612.service.1.1.type")).toMatchObject({ status: "inconclusive" });
  });

  it("validates conditional definitions, supply-point attributes, and critical service extensions", async () => {
    const original = await fixture();
    const nationalRootWithoutDefinition = original
      .replace("Svctype/RA/nothavingPKIid", "Svctype/NationalRootCA-QC")
      .replace(/            <TSPServiceDefinitionURI>[\s\S]*?            <\/TSPServiceDefinitionURI>\n/, "");
    const unspecifiedWithoutDefinition = original
      .replace("Svctype/RA/nothavingPKIid", "Svctype/unspecified")
      .replace(/            <SchemeServiceDefinitionURI>[\s\S]*?            <\/SchemeServiceDefinitionURI>\n/, "");
    const invalidSupplyAndExtension = original
      .replace(
        "type=\"http://uri.etsi.org/TrstSvc/Svctype/RA\">https://example.test/registration",
        "type=\"relative/type\">relative/registration",
      )
      .replace(
        "          </ServiceInformation>",
        "            <ServiceInformationExtensions><Extension Critical=\"true\"><Unknown/></Extension></ServiceInformationExtensions>\n          </ServiceInformation>",
      );

    expect(find(assess(nationalRootWithoutDefinition).checks, "ts119612.service.1.1.tsp_definition")).toMatchObject({ status: "fail" });
    expect(find(assess(unspecifiedWithoutDefinition).checks, "ts119612.service.1.1.unspecified_definition")).toMatchObject({ status: "fail" });
    expect(find(assess(invalidSupplyAndExtension).checks, "ts119612.service.1.1.supply_points")).toMatchObject({ status: "fail" });
    expect(find(assess(invalidSupplyAndExtension).checks, "ts119612.service.1.1.extensions")).toMatchObject({ status: "fail", severity: "critical" });
  });

  it("keeps conditional provider-list absence and LoTL applicability explicit", async () => {
    const original = await fixture();
    const withoutProviders = original.replace(/  <TrustServiceProviderList>[\s\S]*?  <\/TrustServiceProviderList>\n/, "");

    expect(find(assess(withoutProviders).checks, "ts119612.providers.list")).toMatchObject({ status: "inconclusive" });
    expect(find(assess(original, "ts119612_xml_lotl").checks, "ts119612.providers.list")).toMatchObject({ status: "fail" });
  });

  it("integrates findings, counts, and automatic schema routing", async () => {
    const runner: XsdCommandRunner = vi.fn(async (_command, args) => (
      args[0] === "--version"
        ? { code: 0, stdout: "xmllint", stderr: "" }
        : { code: 0, stdout: "", stderr: "" }
    ));
    const result = await assessTs119612Xml(await fixture(), {
      strict: false,
      assessmentDate: new Date("2026-02-01T00:00:00Z"),
      xsdDependencies: { commandRunner: runner },
    });

    expect(result.extracted).toMatchObject({ trustServiceProviderCount: 1, serviceCount: 1 });
    expect(result.ts119612.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "schema.xsd", status: "pass" }),
      expect.objectContaining({ id: "ts119612.providers.list", status: "pass" }),
      expect.objectContaining({ id: "ts119612.tsp.1.trade_name", status: "pass" }),
      expect.objectContaining({ id: "ts119612.service.1.1.digital_identity", status: "pass" }),
    ]));
  });
});

async function fixture(): Promise<string> {
  return readFile(fixturePath, "utf8");
}

function assess(
  xml: string,
  artifactKind: "ts119612_xml_tsl" | "ts119612_xml_lotl" = "ts119612_xml_tsl",
) {
  const parsed = parseXml(xml);
  if (!parsed.document) throw new Error("Fixture did not parse.");
  return assessTs119612TspServices(parsed.document, artifactKind, new Date("2026-02-01T00:00:00Z"));
}

function find(checks: ReturnType<typeof assess>["checks"], id: string) {
  const finding = checks.find((check) => check.id === id);
  if (!finding) throw new Error(`Missing check ${id}`);
  return finding;
}

function failedIds(checks: ReturnType<typeof assess>["checks"]): string[] {
  return checks.filter((check) => check.status === "fail").map((check) => check.id);
}
