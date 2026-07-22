import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseXml } from "../src/xml/parse.js";
import { assessTs119612ServiceSemantics } from "../src/xml/ts119612ServiceSemantics.js";
import { validateTs119612XmlSchema } from "../src/xml/ts119612Xsd.js";

const BASE_FIXTURE = "test/fixtures/ts119612-tsp-service-valid.xml";
const CERT_FIXTURE = "test/fixtures/ts119612-service-ca.cert.pem";
const END_ENTITY_CERT_FIXTURE = "test/fixtures/ts119612-service-end-entity.cert.pem";
const SKI = "uu3bQEcISXOSNm0c41V3ZC+T9ag=";
const MODULUS = "2UCepUJQrvAEBFYumm4pmbHG1vluXqajfhHkytGleFIku7dPwCxSgcI0b4eKiLoYNR5JWYIeQ/FyxjMJF32QMBKJfBdjsLjZq9sVq+bCNsVWj3gtPss89WQ4u5cfPK6CyUddZCvIIVDC+ujqqsmSkHVv7SN6pxgHYfWmW9WCoMbkJBz+mYQ5JRUd5b6Xk3UkE3MiBqywL4+pFl8NXSgAfP70fUgBQaQjEECqI/anE4amfvKtSJGNBTYy0ONhD+Jta6dWLycIe1HX2/ESUlE1msoZgI0uTwawW8f8bcfwehnNL4qotV/bmKVC6hu7AuJVdToytptpFPxscwejO3o70Q==";

describe("ETSI TS 119 612 service history, extensions and certificate semantics", () => {
  it("keeps the composed positive fixture valid against the pinned schema when xmllint is available", async () => {
    const finding = await validateTs119612XmlSchema(await semanticFixture(), {
      namespace: "http://uri.etsi.org/02231/v2#",
      tslVersionIdentifier: "6",
    });
    expect(["pass", "not_checked"], JSON.stringify(finding, null, 2)).toContain(finding.status);
  });

  it("extracts deterministic certificate evidence and proves equivalent identity representations", async () => {
    const checks = assess(await semanticFixture());
    expect(find(checks, "ts119612.service.1.1.identity_equivalence")).toMatchObject({
      status: "pass",
      evidence: {
        certificateCount: 1,
        subjectCount: 1,
        skiCount: 1,
        certificates: [expect.objectContaining({
          fingerprintSha256: "c83bd88d786ae1b0792875e91c57243c5eb4bb55631ae46a21c186c056f66663",
          subjectKeyIdentifier: "baeddb404708497392366d1ce35577642f93f5a8",
          keyUsage: ["keyCertSign", "crlSign"],
          isCertificateAuthority: true,
          selfSigned: true,
        })],
      },
    });
    expect(find(checks, "ts119612.service.1.1.certificate_role")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.1.1.certificate_subject_tsp_name")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.identity_uniqueness")).toMatchObject({ status: "pass" });
  });

  it("validates non-empty newest-to-oldest history and modern status transitions", async () => {
    const checks = assess(await semanticFixture());
    expect(find(checks, "ts119612.service.1.1.history.structure")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.1.1.history.1.structure")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.1.1.history.1.type")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.1.1.history.1.name")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.1.1.history.1.digital_identity")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.1.1.history.1.status")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.1.1.history.1.status_start")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.1.1.history.1.status_transition")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119612.service.1.1.history.retention")).toMatchObject({ status: "inconclusive" });
  });

  it("rejects empty, unordered and certificate-bearing historical identities", async () => {
    const original = await semanticFixture();
    const empty = original.replace(/<ServiceHistory>[\s\S]*?<\/ServiceHistory>/, "<ServiceHistory/>");
    expect(find(assess(empty), "ts119612.service.1.1.history.structure")).toMatchObject({ status: "fail", severity: "critical" });

    const invalid = original
      .replace(`<DigitalId><X509SKI>${SKI}</X509SKI></DigitalId>\n              </ServiceDigitalIdentity>`,
        `<DigitalId><X509Certificate>${certificate(original)}</X509Certificate></DigitalId>\n              </ServiceDigitalIdentity>`)
      .replace("2025-01-01T00:00:00Z</StatusStartingTime>", "2027-01-01T00:00:00Z</StatusStartingTime>");
    expect(find(assess(invalid), "ts119612.service.1.1.history.1.digital_identity")).toMatchObject({ status: "fail", severity: "critical" });
    expect(find(assess(invalid), "ts119612.service.1.1.history.1.status_start")).toMatchObject({ status: "fail" });

    const missingName = original.replace(
      "              <ServiceName><Name xml:lang=\"en\">Example qualified CA service</Name></ServiceName>\n              <ServiceDigitalIdentity>",
      "              <ServiceDigitalIdentity>",
    );
    expect(find(assess(missingName), "ts119612.service.1.1.history.1.name")).toMatchObject({
      status: "fail",
      severity: "error",
    });
  });

  it("detects identity, CA-purpose and same-type key reuse failures", async () => {
    const original = await semanticFixture();
    const mismatched = original.replace(`<DigitalId><X509SKI>${SKI}</X509SKI></DigitalId>`, "<DigitalId><X509SKI>AQID</X509SKI></DigitalId>");
    expect(find(assess(mismatched), "ts119612.service.1.1.identity_equivalence")).toMatchObject({ status: "fail", severity: "critical" });

    const endEntity = pemBase64(await readFile(END_ENTITY_CERT_FIXTURE, "utf8"));
    const wrongRole = original.replace(certificate(original), endEntity);
    expect(find(assess(wrongRole), "ts119612.service.1.1.certificate_role")).toMatchObject({ status: "fail", severity: "critical" });

    const duplicated = original.replace("        </TSPService>\n", `        </TSPService>\n${serviceBlock(original)}\n`);
    expect(assess(duplicated)).toContainEqual(expect.objectContaining({ id: "ts119612.service.identity_uniqueness", status: "fail" }));
  });

  it("validates predefined extension applicability, vocabulary and criticality", async () => {
    const checks = assess(await semanticFixture());
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119612.service.1.1.extension.1.expired_certs", status: "pass" }),
      expect.objectContaining({ id: "ts119612.service.1.1.extension.2.qualifications", status: "pass" }),
      expect.objectContaining({ id: "ts119612.service.1.1.extension.3.taken_over_by", status: "inconclusive" }),
      expect.objectContaining({ id: "ts119612.service.1.1.extension.4.additional_information", status: "pass" }),
    ]));

    const invalid = (await semanticFixture())
      .replace('<Extension Critical="false"><ExpiredCertsRevocationInfo>', '<Extension Critical="true"><ExpiredCertsRevocationInfo>')
      .replace('uri="http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/QCWithQSCD"', 'uri="https://example.test/unknown-qualifier"')
      .replace('<tslx:URI xml:lang="en">https://example.test/takeover</tslx:URI>', '<tslx:URI xml:lang="en">relative</tslx:URI>')
      .replace("SvcInfoExt/RootCA-QC", "SvcInfoExt/ForWebSiteAuthentication")
      .replace(/Svctype\/CA\/QC/g, "Svctype/CA/PKC/CertsforOtherTypesOfTS");
    expect(find(assess(invalid), "ts119612.service.1.1.extension.1.expired_certs")).toMatchObject({ status: "fail" });
    expect(find(assess(invalid), "ts119612.service.1.1.extension.2.qualifications")).toMatchObject({ status: "fail" });
    expect(find(assess(invalid), "ts119612.service.1.1.extension.3.taken_over_by")).toMatchObject({ status: "fail" });
    expect(find(assess(invalid), "ts119612.service.1.1.extension.4.additional_information")).toMatchObject({ status: "fail" });

    const custom = (await semanticFixture()).replace(/Svctype\/CA\/QC/g, "https://example.test/custom-ca-service");
    expect(find(assess(custom), "ts119612.service.1.1.extension.1.expired_certs")).toMatchObject({ status: "inconclusive" });
  });
});

async function semanticFixture(): Promise<string> {
  const [base, pem] = await Promise.all([readFile(BASE_FIXTURE, "utf8"), readFile(CERT_FIXTURE, "utf8")]);
  const cert = pemBase64(pem);
  return base
    .replace('Id="TSP-SERVICE-VALID">', 'Id="TSP-SERVICE-VALID" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:sie="http://uri.etsi.org/TrstSvc/SvcInfoExt/eSigDir-1999-93-EC-TrustedList/#" xmlns:tslx="http://uri.etsi.org/02231/v2/additionaltypes#">')
    .replace(/          <ServiceInformation>[\s\S]*?          <\/ServiceInformation>/, serviceInformation(cert))
    .replace("        </TSPService>", `          <ServiceHistory>\n${history()}\n          </ServiceHistory>\n        </TSPService>`);
}

function serviceInformation(cert: string): string {
  return `          <ServiceInformation>
            <ServiceTypeIdentifier>http://uri.etsi.org/TrstSvc/Svctype/CA/QC</ServiceTypeIdentifier>
            <ServiceName><Name xml:lang="en">Example qualified CA service</Name></ServiceName>
            <ServiceDigitalIdentity>
              <DigitalId><X509Certificate>${cert}</X509Certificate></DigitalId>
              <DigitalId><X509SubjectName>C=IT,O=Example Trust Provider S.p.A.,CN=Example Service CA</X509SubjectName></DigitalId>
              <DigitalId><ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${MODULUS}</ds:Modulus><ds:Exponent>AQAB</ds:Exponent></ds:RSAKeyValue></ds:KeyValue></DigitalId>
              <DigitalId><X509SKI>${SKI}</X509SKI></DigitalId>
            </ServiceDigitalIdentity>
            <ServiceStatus>http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/withdrawn</ServiceStatus>
            <StatusStartingTime>2026-07-23T00:00:00Z</StatusStartingTime>
            <SchemeServiceDefinitionURI><URI xml:lang="en">https://example.test/scheme/service-definition</URI></SchemeServiceDefinitionURI>
            <ServiceInformationExtensions>
              <Extension Critical="false"><ExpiredCertsRevocationInfo>2026-07-01T00:00:00Z</ExpiredCertsRevocationInfo></Extension>
              <Extension Critical="true"><sie:Qualifications><sie:QualificationElement><sie:Qualifiers><sie:Qualifier uri="http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/QCWithQSCD"/></sie:Qualifiers><sie:CriteriaList assert="all"><sie:KeyUsage><sie:KeyUsageBit name="keyCertSign">true</sie:KeyUsageBit></sie:KeyUsage></sie:CriteriaList></sie:QualificationElement></sie:Qualifications></Extension>
              <Extension Critical="false"><tslx:TakenOverBy><tslx:URI xml:lang="en">https://example.test/takeover</tslx:URI><tslx:TSPName><Name xml:lang="en">Successor Provider</Name></tslx:TSPName><SchemeOperatorName><Name xml:lang="en">Italian Test Scheme Operator</Name></SchemeOperatorName><SchemeTerritory>IT</SchemeTerritory></tslx:TakenOverBy></Extension>
              <Extension Critical="false"><AdditionalServiceInformation><URI xml:lang="en">http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/RootCA-QC</URI></AdditionalServiceInformation></Extension>
            </ServiceInformationExtensions>
          </ServiceInformation>`;
}

function history(): string {
  return `            <ServiceHistoryInstance>
              <ServiceTypeIdentifier>http://uri.etsi.org/TrstSvc/Svctype/CA/QC</ServiceTypeIdentifier>
              <ServiceName><Name xml:lang="en">Example qualified CA service</Name></ServiceName>
              <ServiceDigitalIdentity>
                <DigitalId><X509SKI>${SKI}</X509SKI></DigitalId>
              </ServiceDigitalIdentity>
              <ServiceStatus>http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/granted</ServiceStatus>
              <StatusStartingTime>2025-01-01T00:00:00Z</StatusStartingTime>
            </ServiceHistoryInstance>`;
}

function assess(xml: string) {
  const parsed = parseXml(xml);
  if (!parsed.document) throw new Error("Fixture did not parse.");
  return assessTs119612ServiceSemantics(parsed.document);
}

function find(checks: ReturnType<typeof assess>, id: string) {
  const finding = checks.find((entry) => entry.id === id);
  if (!finding) throw new Error(`Missing check ${id}`);
  return finding;
}

function certificate(xml: string): string {
  return /<X509Certificate>([^<]+)<\/X509Certificate>/.exec(xml)?.[1] ?? "";
}

function serviceBlock(xml: string): string {
  return /        <TSPService>[\s\S]*?        <\/TSPService>/.exec(xml)?.[0] ?? "";
}

function pemBase64(pem: string): string {
  return pem.replace(/-----[^-]+-----|\s+/g, "");
}
