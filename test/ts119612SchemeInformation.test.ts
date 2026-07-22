import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { assessTs119612SchemeInformation } from "../src/xml/ts119612SchemeInformation.js";
import { assessTs119612Xml } from "../src/xml/ts119612Checks.js";
import { parseXml } from "../src/xml/parse.js";
import type { XsdCommandRunner } from "../src/xml/xsd.js";

const fixturePath = "test/fixtures/ts119612-scheme-information-valid.xml";

describe("ETSI TS 119 612 SchemeInformation", () => {
  it("passes exact direct structure and locally decidable V2.4.1 semantics", async () => {
    const checks = assess(await readFile(fixturePath, "utf8"));
    const relevant = checks.filter((check) =>
      check.id.startsWith("ts119612.scheme.")
      || check.id.startsWith("structure.scheme_information."),
    );

    expect(relevant.length).toBeGreaterThan(15);
    expect(relevant.filter((check) => check.status !== "pass")).toEqual([]);
    expect(relevant).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "structure.scheme_information.child_cardinality", status: "pass" }),
      expect.objectContaining({ id: "structure.scheme_information.child_order", status: "pass" }),
      expect.objectContaining({ id: "ts119612.scheme.history_period", status: "pass" }),
      expect.objectContaining({
        id: "ts119612.scheme.next_update",
        status: "pass",
        evidence: expect.objectContaining({ sixCalendarMonthLimit: "2026-07-31T00:00:00.000Z" }),
      }),
    ]));
  });

  it("detects duplicate and out-of-order direct children", async () => {
    const original = await readFile(fixturePath, "utf8");
    const duplicated = original.replace(
      "<TSLSequenceNumber>1</TSLSequenceNumber>",
      "<TSLSequenceNumber>1</TSLSequenceNumber><TSLSequenceNumber>2</TSLSequenceNumber>",
    );
    const outOfOrder = original.replace(
      "    <PolicyOrLegalNotice>\n      <TSLLegalNotice xml:lang=\"en\">Test policy and legal notice.</TSLLegalNotice>\n    </PolicyOrLegalNotice>\n    <HistoricalInformationPeriod>65535</HistoricalInformationPeriod>",
      "    <HistoricalInformationPeriod>65535</HistoricalInformationPeriod>\n    <PolicyOrLegalNotice>\n      <TSLLegalNotice xml:lang=\"en\">Test policy and legal notice.</TSLLegalNotice>\n    </PolicyOrLegalNotice>",
    );
    const foreignNamespace = original
      .replace("xmlns=\"http://uri.etsi.org/02231/v2#\"", "xmlns=\"http://uri.etsi.org/02231/v2#\" xmlns:foreign=\"urn:example:foreign\"")
      .replace("<TSLSequenceNumber>1</TSLSequenceNumber>", "<foreign:TSLSequenceNumber>1</foreign:TSLSequenceNumber>");

    expect(assess(duplicated)).toContainEqual(expect.objectContaining({
      id: "structure.scheme_information.child_cardinality",
      status: "fail",
      severity: "critical",
    }));
    expect(assess(outOfOrder)).toContainEqual(expect.objectContaining({
      id: "structure.scheme_information.child_order",
      status: "fail",
      severity: "critical",
    }));
    expect(assess(foreignNamespace)).toContainEqual(expect.objectContaining({
      id: "structure.scheme_information.child_cardinality",
      status: "fail",
      severity: "critical",
    }));
  });

  it("reports focused local semantic failures with stable requirement IDs", async () => {
    const original = await readFile(fixturePath, "utf8");
    const invalid = original
      .replace("<TSLSequenceNumber>1</TSLSequenceNumber>", "<TSLSequenceNumber>0</TSLSequenceNumber>")
      .replace("mailto:trust-list@example.test", "ftp://example.test/not-email")
      .replace("https://example.test/trusted-list-help", "mailto:not-a-website@example.test")
      .replace("IT:Italian test trusted-list scheme", "Scheme without territory prefix")
      .replace("https://example.test/scheme-information", "relative/scheme-information")
      .replace("StatusDetn/EUappropriate", "StatusDetn/custom")
      .replace("schemerules/EUcommon", "schemerules/custom")
      .replace("<SchemeTerritory>IT</SchemeTerritory>", "<SchemeTerritory>it</SchemeTerritory>")
      .replace(
        "<TSLLegalNotice xml:lang=\"en\">",
        "<TSLPolicy xml:lang=\"en\">https://example.test/policy</TSLPolicy><TSLLegalNotice xml:lang=\"en\">",
      )
      .replace("<HistoricalInformationPeriod>65535</HistoricalInformationPeriod>", "<HistoricalInformationPeriod>30</HistoricalInformationPeriod>")
      .replace("2026-07-31T00:00:00Z", "2026-08-01T00:00:00Z")
      .replace("https://example.test/current-tl.xml", "relative/current-tl.xml")
      .replace(
        "  </SchemeInformation>",
        "    <SchemeExtensions><Extension Critical=\"true\"><Unknown/></Extension></SchemeExtensions>\n  </SchemeInformation>",
      );
    const checks = assess(invalid);
    const failedIds = checks.filter((check) => check.status === "fail").map((check) => check.id);

    expect(failedIds).toEqual(expect.arrayContaining([
      "ts119612.scheme.sequence.local",
      "ts119612.scheme.operator_address",
      "ts119612.scheme.name",
      "ts119612.scheme.information_uri",
      "ts119612.scheme.status_determination",
      "ts119612.scheme.community_rules",
      "ts119612.scheme.territory",
      "ts119612.scheme.policy_or_legal_notice",
      "ts119612.scheme.history_period",
      "ts119612.scheme.next_update",
      "ts119612.scheme.distribution_points",
      "ts119612.scheme.extensions",
    ]));
  });

  it("keeps EU generic TL and EU LoTL territory semantics distinct", async () => {
    const original = await readFile(fixturePath, "utf8");
    const invalidMemberTerritory = original
      .replace("<SchemeTerritory>IT</SchemeTerritory>", "<SchemeTerritory>EU</SchemeTerritory>");
    const euLotl = original
      .replace("TSLType/EUgeneric", "TSLType/EUlistofthelists")
      .replace("<SchemeTerritory>IT</SchemeTerritory>", "<SchemeTerritory>EU</SchemeTerritory>");

    expect(find(assess(invalidMemberTerritory), "ts119612.scheme.type")).toMatchObject({ status: "fail" });
    expect(find(assess(euLotl), "ts119612.scheme.type")).toMatchObject({ status: "fail" });
    expect(find(assessAs(euLotl, "ts119612_xml_lotl"), "ts119612.scheme.type")).toMatchObject({ status: "pass" });
  });

  it("uses exact calendar-month arithmetic and validates closed-TL status evidence", async () => {
    const original = await readFile(fixturePath, "utf8");
    const overLimit = original.replace("2026-07-31T00:00:00Z", "2026-08-01T00:00:00Z");
    const closed = original.replace(
      "<NextUpdate>\n      <dateTime>2026-07-31T00:00:00Z</dateTime>\n    </NextUpdate>",
      "<NextUpdate/>",
    );
    const closedWithGrantedService = closed.replace(
      "</TrustServiceStatusList>",
      "<ServiceInformation><ServiceStatus>http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/granted</ServiceStatus></ServiceInformation></TrustServiceStatusList>",
    );

    expect(find(assess(original), "ts119612.scheme.next_update")).toMatchObject({ status: "pass" });
    expect(find(assess(overLimit), "ts119612.scheme.next_update")).toMatchObject({ status: "fail" });
    expect(find(assess(closed), "ts119612.scheme.next_update")).toMatchObject({
      status: "pass",
      evidence: { closed: true, observedServiceStatusCount: 0 },
    });
    expect(find(assess(closedWithGrantedService), "ts119612.scheme.next_update")).toMatchObject({
      status: "fail",
      evidence: { closed: true, nonExpiredStatuses: [expect.stringContaining("/granted")] },
    });
  });

  it("integrates scheme findings with automatic schema routing", async () => {
    const runner: XsdCommandRunner = vi.fn(async (_command, args) => (
      args[0] === "--version"
        ? { code: 0, stdout: "xmllint", stderr: "" }
        : { code: 0, stdout: "", stderr: "" }
    ));
    const result = await assessTs119612Xml(await readFile(fixturePath, "utf8"), {
      strict: false,
      assessmentDate: new Date("2026-02-01T00:00:00Z"),
      xsdDependencies: { commandRunner: runner },
    });

    expect(result.ts119612.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "schema.xsd", status: "pass" }),
      expect.objectContaining({ id: "structure.scheme_information.child_cardinality", status: "pass" }),
      expect.objectContaining({ id: "ts119612.scheme.next_update", status: "pass" }),
      expect.objectContaining({ id: "dates.next_update_expired", status: "pass" }),
    ]));
  });
});

function assess(xml: string) {
  return assessAs(xml, "ts119612_xml_tsl");
}

function assessAs(xml: string, artifactKind: "ts119612_xml_tsl" | "ts119612_xml_lotl") {
  const parsed = parseXml(xml);
  if (!parsed.document) throw new Error("Fixture did not parse.");
  return assessTs119612SchemeInformation(parsed.document, artifactKind);
}

function find(checks: ReturnType<typeof assess>, id: string) {
  const finding = checks.find((check) => check.id === id);
  if (!finding) throw new Error("Missing check " + id);
  return finding;
}
