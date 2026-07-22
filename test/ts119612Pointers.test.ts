import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseXml } from "../src/xml/parse.js";
import { assessTs119612Xml } from "../src/xml/ts119612Checks.js";
import { assessTs119612Pointers } from "../src/xml/ts119612Pointers.js";

const XML_FIXTURE = "test/fixtures/ts119612-scheme-information-valid.xml";
const CERTIFICATE_FIXTURES = [
  "test/fixtures/ts119612-service-ca.cert.pem",
  "test/fixtures/ts119612-service-end-entity.cert.pem",
] as const;
const ASSESSMENT_DATE = new Date("2026-07-22T12:00:00Z");

describe("ETSI TS 119 612 OtherTSLPointer semantics", () => {
  it("validates the exact tuple, qualifiers, signing certificates, rollover and dispatch", async () => {
    const xml = await pointerFixture();
    const assessment = await assess(xml);

    expect(assessment.pointerCount).toBe(1);
    expect(assessment.certificates).toHaveLength(2);
    expect(assessment.certificates.every((certificate) => certificate.source === "pointer")).toBe(true);
    expect(assessment.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119612.scheme.pointers.structure", status: "pass" }),
      expect.objectContaining({ id: "ts119612.pointer.1.structure", status: "pass" }),
      expect.objectContaining({ id: "ts119612.pointer.1.location", status: "pass" }),
      expect.objectContaining({ id: "ts119612.pointer.1.identities", status: "pass" }),
      expect.objectContaining({ id: "ts119612.pointer.1.qualifiers", status: "pass" }),
      expect.objectContaining({
        id: "ts119612.pointer.1.dispatch",
        status: "pass",
        evidence: expect.objectContaining({ expectedArtifactKind: "ts119612_xml_lotl" }),
      }),
      expect.objectContaining({ id: "ts119612.pointer.1.signing_certificates", status: "pass" }),
      expect.objectContaining({ id: "ts119612.pointer.1.rollover", status: "pass" }),
      expect.objectContaining({ id: "ts119612.scheme.pointers.authentication", status: "not_checked" }),
    ]));

    const integrated = await assessTs119612Xml(xml, { strict: false, assessmentDate: ASSESSMENT_DATE });
    expect(integrated.ts119612.checks).toContainEqual(expect.objectContaining({
      id: "ts119612.pointer.1.qualifiers", status: "pass",
    }));
    expect(integrated.extracted?.certificates?.filter((certificate) => certificate.source === "pointer")).toHaveLength(2);
  });

  it("rejects tuple order and mandatory qualifier-wrapper defects", async () => {
    const original = await pointerFixture();
    const invalid = original
      .replace(/(<ServiceDigitalIdentities>[\s\S]*?<\/ServiceDigitalIdentities>)\n        (<TSLLocation>[^<]+<\/TSLLocation>)/, "$2\n        $1")
      .replace(/\n          <OtherInformation>\n            <at:MimeType[^>]*>[\s\S]*?<\/OtherInformation>/, "");
    const assessment = await assess(invalid);

    expect(find(assessment, "ts119612.pointer.1.structure")).toMatchObject({ status: "fail", severity: "critical" });
    expect(find(assessment, "ts119612.pointer.1.qualifiers")).toMatchObject({ status: "fail", severity: "critical" });
  });

  it("separates registered profile dispatch from custom type ambiguity", async () => {
    const invalid = (await pointerFixture())
      .replace("TSLType/EUlistofthelists</TSLType>", "TSLType/CommunitySpecific</TSLType>")
      .replace("application/vnd.etsi.tsl+xml", "application/xml");
    const assessment = await assess(invalid);

    expect(find(assessment, "ts119612.pointer.1.qualifiers")).toMatchObject({ status: "fail" });
    expect(find(assessment, "ts119612.pointer.1.dispatch")).toMatchObject({
      status: "inconclusive",
      evidence: expect.objectContaining({ targetDereferenced: false }),
    });
  });

  it("detects non-equivalent certificates within one service identity", async () => {
    const original = await pointerFixture();
    const invalid = original.replace(
      "</DigitalId>\n          </ServiceDigitalIdentity>\n          <ServiceDigitalIdentity>\n            <DigitalId>",
      "</DigitalId>\n            <DigitalId>",
    );
    const assessment = await assess(invalid);

    expect(find(assessment, "ts119612.pointer.1.identities")).toMatchObject({
      status: "fail",
      evidence: expect.objectContaining({ diagnostics: expect.arrayContaining([
        expect.stringContaining("do not represent the same subject and public key"),
      ]) }),
    });
  });

  it("warns when Annex A rollover evidence has only one key and keeps variant dispatch distinct", async () => {
    const original = await pointerFixture();
    const withoutSecondIdentity = original.replace(/\n          <ServiceDigitalIdentity>\n            <DigitalId>\n              <X509Certificate>[\s\S]*?<\/ServiceDigitalIdentity>/, "");
    const compatibility = withoutSecondIdentity.replaceAll(
      "http://uri.etsi.org/02231/v2#",
      "http://uri.etsi.org/19612/v2.4.1#",
    );
    const assessment = await assess(compatibility);

    expect(find(assessment, "ts119612.pointer.1.rollover")).toMatchObject({
      status: "warn",
      evidence: expect.objectContaining({ distinctPublicKeyCount: 1 }),
    });
    expect(find(assessment, "ts119612.pointer.1.dispatch")).toMatchObject({ status: "warn" });
  });
});

async function pointerFixture(): Promise<string> {
  const [xml, ...certificates] = await Promise.all([
    readFile(XML_FIXTURE, "utf8"),
    ...CERTIFICATE_FIXTURES.map((path) => readFile(path, "utf8")),
  ]);
  const encoded = certificates.map((certificate) => certificate
    .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, ""));
  const pointer = `      <OtherTSLPointer>
        <ServiceDigitalIdentities>
          <ServiceDigitalIdentity>
            <DigitalId>
              <X509Certificate>${encoded[0]}</X509Certificate>
            </DigitalId>
          </ServiceDigitalIdentity>
          <ServiceDigitalIdentity>
            <DigitalId>
              <X509Certificate>${encoded[1]}</X509Certificate>
            </DigitalId>
          </ServiceDigitalIdentity>
        </ServiceDigitalIdentities>
        <TSLLocation>https://example.test/eu-lotl.xml</TSLLocation>
        <AdditionalInformation>
          <OtherInformation>
            <TSLType>http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUlistofthelists</TSLType>
          </OtherInformation>
          <OtherInformation>
            <SchemeOperatorName>
              <Name xml:lang="en">Example Trust Provider S.p.A.</Name>
            </SchemeOperatorName>
          </OtherInformation>
          <OtherInformation>
            <SchemeTypeCommunityRules>
              <URI xml:lang="en">http://uri.etsi.org/TrstSvc/TrustedList/schemerules/EUcommon</URI>
            </SchemeTypeCommunityRules>
          </OtherInformation>
          <OtherInformation>
            <SchemeTerritory>EU</SchemeTerritory>
          </OtherInformation>
          <OtherInformation>
            <at:MimeType xmlns:at="http://uri.etsi.org/02231/v2/additionaltypes#">application/vnd.etsi.tsl+xml</at:MimeType>
          </OtherInformation>
        </AdditionalInformation>
      </OtherTSLPointer>`;
  return xml.replace(/      <OtherTSLPointer>[\s\S]*?      <\/OtherTSLPointer>/, pointer);
}

async function assess(xml: string) {
  const parsed = parseXml(xml);
  if (!parsed.document) throw new Error("Fixture did not parse.");
  return assessTs119612Pointers(parsed.document, "ts119612_xml_tsl", ASSESSMENT_DATE);
}

function find(assessment: Awaited<ReturnType<typeof assess>>, id: string) {
  const finding = assessment.checks.find((check) => check.id === id);
  if (!finding) throw new Error(`Missing check ${id}`);
  return finding;
}
