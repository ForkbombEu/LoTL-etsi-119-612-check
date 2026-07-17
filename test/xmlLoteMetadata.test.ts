import { describe, expect, it } from "vitest";
import { assessArtifactContent } from "../src/audit.js";

const xmlLote = `<?xml version="1.0"?>
<TrustedEntitiesList xmlns="http://uri.etsi.org/019602/v1#">
  <ListAndSchemeInformation>
    <LoTEVersionIdentifier>1</LoTEVersionIdentifier>
    <LoTESequenceNumber>2</LoTESequenceNumber>
    <LoTEType>http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList</LoTEType>
    <SchemeOperatorName><Name>NXD Foundation</Name></SchemeOperatorName>
    <SchemeOperatorAddress><PostalAddresses><PostalAddress><CountryName>SE</CountryName></PostalAddress></PostalAddresses></SchemeOperatorAddress>
    <SchemeName><Name>NXD EAA Providers</Name></SchemeName>
    <SchemeTerritory>EU</SchemeTerritory>
    <StatusDeterminationApproach>http://example.test/status</StatusDeterminationApproach>
    <ListIssueDateTime>2026-07-09T11:30:03Z</ListIssueDateTime>
    <NextUpdate><dateTime>2027-01-09T11:30:03Z</dateTime></NextUpdate>
  </ListAndSchemeInformation>
</TrustedEntitiesList>`;

describe("ETSI TS 119 602 XML LoTE metadata", () => {
  it("extracts common metadata while leaving TS 119 612 not applicable", async () => {
    const result = await assessArtifactContent({
      content: xmlLote,
      contentType: "application/xml",
      strict: false,
      includeJsonLoteChecks: false,
    });

    expect(result.detected.artifactKind).toBe("xml_lote");
    expect(result.ts119612.conformanceLevel).toBe("not_applicable");
    expect(result.extracted).toMatchObject({
      schemeOperatorName: ["NXD Foundation"],
      schemeName: ["NXD EAA Providers"],
      schemeTerritory: "EU",
      statusDeterminationApproach: "http://example.test/status",
      listIssueDateTime: "2026-07-09T11:30:03Z",
      nextUpdate: "2027-01-09T11:30:03Z",
      jsonLote: {
        LoTEVersionIdentifier: "1",
        LoTESequenceNumber: "2",
        LoTEType: "http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList",
      },
    });
  });
});
