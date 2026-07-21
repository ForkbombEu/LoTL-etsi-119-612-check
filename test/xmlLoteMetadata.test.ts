import { describe, expect, it } from "vitest";
import { assessArtifactContent } from "../src/audit.js";

const schemeInformation = `
  <ListAndSchemeInformation>
    <LoTEVersionIdentifier>1</LoTEVersionIdentifier>
    <LoTESequenceNumber>2</LoTESequenceNumber>
    <LoTEType>http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList</LoTEType>
    <SchemeOperatorName><Name xml:lang="en">NXD Foundation</Name></SchemeOperatorName>
    <SchemeOperatorAddress><PostalAddresses><PostalAddress xml:lang="en"><CountryName>SE</CountryName></PostalAddress></PostalAddresses></SchemeOperatorAddress>
    <SchemeName><Name xml:lang="en">NXD EAA Providers</Name></SchemeName>
    <SchemeTerritory>EU</SchemeTerritory>
    <StatusDeterminationApproach>http://example.test/status</StatusDeterminationApproach>
    <ListIssueDateTime>2026-07-09T11:30:03Z</ListIssueDateTime>
    <NextUpdate><dateTime>2027-01-09T11:30:03Z</dateTime></NextUpdate>
  </ListAndSchemeInformation>`;

function trustedEntity(name: string): string {
  return `
    <TrustedEntity>
      <TrustedEntityInformation>
        <TEName><Name xml:lang="en">${name}</Name></TEName>
        <TEAddress><PostalAddresses><PostalAddress xml:lang="en"><CountryName>EU</CountryName></PostalAddress></PostalAddresses></TEAddress>
      </TrustedEntityInformation>
      <TrustedEntityServices>
        <TrustedEntityService>
          <ServiceInformation>
            <ServiceTypeIdentifier>https://example.test/service</ServiceTypeIdentifier>
            <ServiceName><Name xml:lang="en">${name} service</Name></ServiceName>
            <ServiceDigitalIdentity />
          </ServiceInformation>
        </TrustedEntityService>
      </TrustedEntityServices>
    </TrustedEntity>`;
}

const standardXmlLote = `<?xml version="1.0"?>
<ListOfTrustedEntities xmlns="http://uri.etsi.org/019602/v1#" LOTETag="https://uri.etsi.org/19602/LOTETag/">
  ${schemeInformation}
  <TrustedEntitiesList>
    ${trustedEntity("Standard entity")}
  </TrustedEntitiesList>
</ListOfTrustedEntities>`;

const weBuildCompatibilityXmlLote = `<?xml version="1.0"?>
<TrustedEntitiesList xmlns="http://uri.etsi.org/019602/v1#" LOTETag="https://uri.etsi.org/19602/LOTETag/">
  ${schemeInformation}
  <TrustedEntitiesList>
    ${trustedEntity("Compatibility entity one")}
    ${trustedEntity("Compatibility entity two")}
  </TrustedEntitiesList>
</TrustedEntitiesList>`;

describe("ETSI TS 119 602 XML LoTE metadata", () => {
  it("accepts the normative ListOfTrustedEntities entity path", async () => {
    const result = await assessArtifactContent({
      content: standardXmlLote,
      contentType: "application/xml",
      strict: false,
      includeJsonLoteChecks: false,
    });

    expect(result.detected.artifactKind).toBe("xml_lote");
    expect(result.ts119612.conformanceLevel).toBe("not_applicable");
    expect(result.ts119602.conformanceLevel).toBe("non_conformant");
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "xml_lote.structure.xml_binding",
        status: "pass",
        evidence: expect.objectContaining({
          binding: "etsi_ts_119_602_v1_1_1",
          normativeEntityPath: "/ListOfTrustedEntities/TrustedEntitiesList/TrustedEntity",
        }),
      }),
      expect.objectContaining({ id: "xml_lote.structure.type", status: "pass" }),
      expect.objectContaining({ id: "xml_lote.dates.next_after_issue", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.uri", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.date_time", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.language", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.country_code", status: "pass" }),
      expect.objectContaining({ id: "ts119602.language.annex_b", status: "not_checked" }),
      expect.objectContaining({ id: "xml_lote.structure.trusted_entities_container", status: "pass" }),
      expect.objectContaining({ id: "xml_lote.services.trusted_entity_count", status: "pass", evidence: 1 }),
      expect.objectContaining({ id: "signature.present", status: "fail" }),
    ]));
    expect(result.extracted).toMatchObject({
      schemeOperatorName: ["NXD Foundation"],
      schemeName: ["NXD EAA Providers"],
      schemeTerritory: "EU",
      statusDeterminationApproach: "http://example.test/status",
      listIssueDateTime: "2026-07-09T11:30:03Z",
      nextUpdate: "2027-01-09T11:30:03Z",
      trustServiceProviderCount: 1,
      serviceCount: 1,
      jsonLote: {
        XmlBinding: "etsi_ts_119_602_v1_1_1",
        LoTEVersionIdentifier: "1",
        LoTESequenceNumber: "2",
        LoTEType: "http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList",
        TrustedEntityCount: 1,
        ServiceCount: 1,
      },
    });
  });

  it("extracts WE BUILD entities but warns that the compatibility root is not ETSI-conformant", async () => {
    const result = await assessArtifactContent({
      content: weBuildCompatibilityXmlLote,
      contentType: "application/xml",
      strict: false,
      includeJsonLoteChecks: false,
    });

    expect(result.detected.artifactKind).toBe("xml_lote");
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "xml_lote.structure.xml_binding",
        status: "warn",
        severity: "warning",
        evidence: expect.objectContaining({
          binding: "we_build_compatibility",
          observedEntityPath: "/TrustedEntitiesList/TrustedEntitiesList/TrustedEntity",
          historicalVersion: "not_established",
          historicalVersionReason: "No normative ETSI version or published WE BUILD profile defining this alternative root has been identified.",
        }),
      }),
      expect.objectContaining({ id: "xml_lote.services.trusted_entity_count", status: "pass", evidence: 2 }),
    ]));
    expect(result.extracted).toMatchObject({
      trustServiceProviderCount: 2,
      serviceCount: 2,
      jsonLote: {
        XmlBinding: "we_build_compatibility",
        TrustedEntityCount: 2,
        ServiceCount: 2,
      },
    });
    expect(result.ts119602.warnings).toContain(
      "xml_lote.structure.xml_binding: TrustedEntitiesList is accepted as a WE BUILD compatibility root, but it is not conformant with the ETSI TS 119 602 V1.1.1 scheme-explicit XML binding.",
    );
  });

  it("does not treat foreign-namespace elements as the normative entity path", async () => {
    const result = await assessArtifactContent({
      content: `<?xml version="1.0"?>
        <ListOfTrustedEntities xmlns="http://uri.etsi.org/019602/v1#">
          ${schemeInformation}
          <TrustedEntitiesList xmlns="">
            ${trustedEntity("Foreign namespace entity")}
          </TrustedEntitiesList>
        </ListOfTrustedEntities>`,
      contentType: "application/xml",
      strict: false,
      includeJsonLoteChecks: false,
    });

    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "xml_lote.structure.trusted_entities_container", status: "not_checked" }),
      expect.objectContaining({ id: "xml_lote.services.trusted_entity_count", status: "warn", evidence: 0 }),
    ]));
    expect(result.extracted).toMatchObject({
      trustServiceProviderCount: 0,
      serviceCount: 0,
    });
  });
});
