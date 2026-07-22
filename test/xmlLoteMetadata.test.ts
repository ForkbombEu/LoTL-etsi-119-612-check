import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessArtifactContent } from "../src/audit.js";
import { inspectTs119602Certificate } from "../src/standards/ts119602Identity.js";

const schemeInformation = `
  <ListAndSchemeInformation>
    <LoTEVersionIdentifier>1</LoTEVersionIdentifier>
    <LoTESequenceNumber>2</LoTESequenceNumber>
    <LoTEType>http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList</LoTEType>
    <SchemeOperatorName><Name xml:lang="en">NXD Foundation</Name></SchemeOperatorName>
    <SchemeOperatorAddress>
      <PostalAddresses><PostalAddress xml:lang="en"><StreetAddress>1 Example Street</StreetAddress><CountryName>EU</CountryName></PostalAddress></PostalAddresses>
      <ElectronicAddress><URI xml:lang="en">mailto:audit@example.test</URI><URI xml:lang="en">https://example.test/contact</URI></ElectronicAddress>
    </SchemeOperatorAddress>
    <SchemeName><Name xml:lang="en">EU:NXD EAA Providers</Name></SchemeName>
    <SchemeInformationURI><URI xml:lang="en">https://example.test/info</URI></SchemeInformationURI>
    <SchemeTerritory>EU</SchemeTerritory>
    <StatusDeterminationApproach>http://example.test/status</StatusDeterminationApproach>
    <SchemeTypeCommunityRules><URI xml:lang="en">https://example.test/scheme-rules</URI></SchemeTypeCommunityRules>
    <PolicyOrLegalNotice><LoTEPolicy xml:lang="en">https://example.test/policy</LoTEPolicy></PolicyOrLegalNotice>
    <ListIssueDateTime>2026-07-09T11:30:03Z</ListIssueDateTime>
    <NextUpdate><dateTime>2027-01-09T11:30:03Z</dateTime></NextUpdate>
  </ListAndSchemeInformation>`;

function trustedEntity(name: string): string {
  return `
    <TrustedEntity>
      <TrustedEntityInformation>
        <TEName><Name xml:lang="en">${name}</Name></TEName>
        <TEAddress>
          <PostalAddresses><PostalAddress xml:lang="en"><StreetAddress>2 Provider Street</StreetAddress><CountryName>EU</CountryName></PostalAddress></PostalAddresses>
          <ElectronicAddress><URI xml:lang="en">mailto:support@example.test</URI><URI xml:lang="en">https://example.test/contact</URI></ElectronicAddress>
        </TEAddress>
        <TEInformationURI><URI xml:lang="en">https://example.test/provider</URI></TEInformationURI>
      </TrustedEntityInformation>
      <TrustedEntityServices>
        <TrustedEntityService>
          <ServiceInformation>
            <ServiceTypeIdentifier>https://example.test/service</ServiceTypeIdentifier>
            <ServiceName><Name xml:lang="en">${name} service</Name></ServiceName>
            <ServiceDigitalIdentity><DigitalId><OtherId>urn:example:service-identity</OtherId></DigitalId></ServiceDigitalIdentity>
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
  it("preserves XML RSA KeyValue and compares it with certificate and SKI forms", async () => {
    const certificate = (await readFile("test/fixtures/ts119612-service-ca.cert.pem", "utf8"))
      .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
    const jwk = new X509Certificate(Buffer.from(certificate, "base64")).publicKey.export({ format: "jwk" });
    const ski = Buffer.from(inspectTs119602Certificate(certificate).subjectKeyIdentifier!, "hex").toString("base64");
    const xml = standardXmlLote
      .replace('xmlns="http://uri.etsi.org/019602/v1#"', 'xmlns="http://uri.etsi.org/019602/v1#" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"')
      .replace(
        "<DigitalId><OtherId>urn:example:service-identity</OtherId></DigitalId>",
        `<DigitalId><X509Certificate>${certificate}</X509Certificate></DigitalId>
         <DigitalId><ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${Buffer.from(jwk.n!, "base64url").toString("base64")}</ds:Modulus><ds:Exponent>${Buffer.from(jwk.e!, "base64url").toString("base64")}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue></DigitalId>
         <DigitalId><X509SKI>${ski}</X509SKI></DigitalId>`,
      );
    const result = await assessArtifactContent({ content: xml, contentType: "application/xml", strict: false, includeJsonLoteChecks: false });
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.service.digital_identity", status: "pass" }),
      expect.objectContaining({ id: "ts119602.service.identity_equivalence", status: "pass" }),
    ]));
  });

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
      expect.objectContaining({ id: "ts119602.binding.xml_schema", category: "schema" }),
      expect.objectContaining({ id: "xml_lote.structure.type", status: "pass" }),
      expect.objectContaining({ id: "xml_lote.dates.next_after_issue", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.uri", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.date_time", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.language", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.country_code", status: "pass" }),
      expect.objectContaining({ id: "ts119602.language.transliteration", status: "pass" }),
      expect.objectContaining({ id: "ts119602.language.annex_b", status: "not_checked" }),
      expect.objectContaining({ id: "ts119602.structure.lote_tag", status: "pass" }),
      expect.objectContaining({
        id: "ts119602.structure.scheme_information_presence",
        status: "pass",
        evidence: expect.objectContaining({ mode: "explicit", violations: [] }),
      }),
      expect.objectContaining({ id: "ts119602.scheme.operator_address", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.name", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.policy_or_legal_notice", status: "pass" }),
      expect.objectContaining({ id: "xml_lote.structure.trusted_entities_container", status: "pass" }),
      expect.objectContaining({ id: "xml_lote.services.trusted_entity_count", status: "pass", evidence: 1 }),
      expect.objectContaining({ id: "ts119602.entities.list", status: "pass" }),
      expect.objectContaining({ id: "ts119602.entity.information", status: "pass" }),
      expect.objectContaining({ id: "ts119602.entity.address", status: "pass" }),
      expect.objectContaining({ id: "ts119602.service.information", status: "pass" }),
      expect.objectContaining({ id: "ts119602.service.digital_identity", status: "pass" }),
      expect.objectContaining({ id: "signature.present", status: "fail" }),
      expect.objectContaining({ id: "signature.xades_baseline_b.structure", status: "fail" }),
      expect.objectContaining({ id: "signature.annex_h4.document_reference", status: "fail" }),
      expect.objectContaining({ id: "signature.signer_trust", status: "not_checked" }),
    ]));
    expect(result.extracted).toMatchObject({
      schemeOperatorName: ["NXD Foundation"],
      schemeName: ["EU:NXD EAA Providers"],
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

  it("rejects duplicate directly nested trusted-entity information components", async () => {
    const duplicateName = standardXmlLote.replace(
      "</TEName>",
      "</TEName><TEName><Name xml:lang=\"en\">Duplicate name</Name></TEName>",
    );
    const result = await assessArtifactContent({
      content: duplicateName,
      contentType: "application/xml",
      strict: false,
      includeJsonLoteChecks: false,
    });
    expect(result.ts119602.checks).toContainEqual(expect.objectContaining({
      id: "ts119602.entity.information",
      status: "fail",
      evidence: expect.objectContaining({
        results: expect.arrayContaining([
          expect.objectContaining({
            structure: expect.objectContaining({
              violations: expect.arrayContaining([
                expect.objectContaining({ code: "structure.cardinality", observed: 2 }),
              ]),
            }),
          }),
        ]),
      }),
    }));
  });

  it("rejects unexpected directly nested XML address components", async () => {
    const unexpectedAddressChild = standardXmlLote.replace(
      "<ElectronicAddress>",
      "<UnexpectedAddress/><ElectronicAddress>",
    );
    const result = await assessArtifactContent({
      content: unexpectedAddressChild,
      contentType: "application/xml",
      strict: false,
      includeJsonLoteChecks: false,
    });
    expect(result.ts119602.checks).toContainEqual(expect.objectContaining({
      id: "ts119602.scheme.operator_address",
      status: "fail",
      evidence: expect.objectContaining({
        structure: expect.objectContaining({
          violations: expect.arrayContaining([
            expect.objectContaining({ code: "structure.unexpected_child", observed: "UnexpectedAddress" }),
          ]),
        }),
      }),
    }));
  });
});
