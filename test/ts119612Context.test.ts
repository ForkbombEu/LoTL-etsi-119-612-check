import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { assessArtifactContent } from "../src/audit.js";
import { certificateFromBase64 } from "../src/certs.js";
import { detectArtifact } from "../src/detect.js";
import type { FetchResult } from "../src/fetcher.js";
import { createUnknownTs119602Classification } from "../src/standards/ts119602Classification.js";
import {
  assessTs119612Context,
  type Ts119612ContextDependencies,
} from "../src/standards/ts119612Context.js";
import type { CheckResult, TrustedListAuditResult } from "../src/types.js";
import type { Ts119612XmlAssessment } from "../src/xml/ts119612Checks.js";

const CURRENT_URL = "https://context.example.test/current.xml";
const TARGET_URL = "https://context.example.test/target.xml";
const ASSESSMENT_DATE = new Date("2026-07-23T12:00:00Z");

describe("ETSI TS 119 612 contextual validation", () => {
  it("validates sequence/history, distribution equality, pointer authentication and a cycle-safe traversal", async () => {
    const fixture = await contextFixtures();
    const fetcher = fixtureFetcher(new Map([[CURRENT_URL, fixture.current], [TARGET_URL, fixture.target]]));
    const checks = await assessTs119612Context({
      currentBytes: Buffer.from(fixture.current),
      currentContentType: "application/vnd.etsi.tsl+xml",
      currentResult: fakeResult(fixture.current, CURRENT_URL),
      timeoutMs: 1_000,
      options: {
        dereference: true,
        priorArtifacts: [{ content: fixture.prior, source: "prior.xml", contentType: "application/vnd.etsi.tsl+xml" }],
        maxDereferences: 4,
        maxBytesPerArtifact: 1_000_000,
        maxTraversalDepth: 3,
        concurrency: 2,
      },
    }, { fetcher, assessor: fakeAssessor });

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119612.scheme.sequence.history", status: "pass" }),
      expect.objectContaining({ id: "ts119612.context.history_retention", status: "pass" }),
      expect.objectContaining({ id: "ts119612.scheme.pointers.authentication", status: "pass" }),
      expect.objectContaining({ id: "ts119612.scheme.distribution_consistency", status: "pass" }),
      expect.objectContaining({
        id: "ts119612.context.traversal",
        status: "pass",
        evidence: expect.objectContaining({ fetchedLocationCount: 2, cycleCount: 1 }),
      }),
    ]));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails recycled sequence and discarded prior service state evidence", async () => {
    const fixture = await contextFixtures();
    const invalid = fixture.current
      .replace("<TSLSequenceNumber>2</TSLSequenceNumber>", "<TSLSequenceNumber>1</TSLSequenceNumber>")
      .replace(/\s*<ServiceHistory>[\s\S]*?<\/ServiceHistory>/, "");
    const checks = await assessTs119612Context({
      currentBytes: Buffer.from(invalid),
      currentResult: fakeResult(invalid, CURRENT_URL),
      timeoutMs: 1_000,
      options: { dereference: false, priorArtifacts: [{ content: fixture.prior, source: "prior.xml" }] },
    }, { assessor: fakeAssessor });

    expect(find(checks, "ts119612.scheme.sequence.history")).toMatchObject({ status: "fail" });
    expect(find(checks, "ts119612.context.history_retention")).toMatchObject({ status: "fail" });
    expect(find(checks, "ts119612.scheme.pointers.authentication")).toMatchObject({ status: "not_checked" });
    expect(find(checks, "ts119612.context.traversal")).toMatchObject({ status: "not_checked" });
  });

  it("rejects a target whose verified signer is absent from the declaring pointer", async () => {
    const fixture = await contextFixtures();
    const otherCertificate = pemBase64(await readFile("test/fixtures/ts119612-service-ca.cert.pem", "utf8"));
    const mismatchedTarget = fixture.target.replace(
      `<ds:X509Certificate>${fixture.signerCertificate}</ds:X509Certificate>`,
      `<ds:X509Certificate>${otherCertificate}</ds:X509Certificate>`,
    );
    const checks = await assessTs119612Context({
      currentBytes: Buffer.from(fixture.current),
      currentResult: fakeResult(fixture.current, CURRENT_URL),
      timeoutMs: 1_000,
      options: { dereference: true, maxDereferences: 4, maxBytesPerArtifact: 1_000_000 },
    }, {
      fetcher: fixtureFetcher(new Map([[CURRENT_URL, fixture.current], [TARGET_URL, mismatchedTarget]])),
      assessor: fakeAssessor,
    });

    expect(find(checks, "ts119612.scheme.pointers.authentication")).toMatchObject({
      status: "fail",
      evidence: expect.objectContaining({
        discoveredPointerCount: 1,
        results: expect.arrayContaining([
          expect.objectContaining({ location: TARGET_URL, signerMatch: false, authenticated: false }),
        ]),
      }),
    });
  });

  it("reports dereference and traversal-depth omissions without inventing authentication success", async () => {
    const fixture = await contextFixtures();
    const dereferenceBound = await assessTs119612Context({
      currentBytes: Buffer.from(fixture.current),
      currentResult: fakeResult(fixture.current, CURRENT_URL),
      timeoutMs: 1_000,
      options: { dereference: true, maxDereferences: 1, maxTraversalDepth: 3, maxBytesPerArtifact: 1_000_000 },
    }, {
      fetcher: fixtureFetcher(new Map([[CURRENT_URL, fixture.current], [TARGET_URL, fixture.target]])),
      assessor: fakeAssessor,
    });
    expect(find(dereferenceBound, "ts119612.scheme.distribution_consistency")).toMatchObject({ status: "inconclusive" });
    expect(find(dereferenceBound, "ts119612.context.traversal")).toMatchObject({
      status: "inconclusive",
      evidence: expect.objectContaining({ omittedByDereferenceBound: expect.any(Number) }),
    });

    const depthBound = await assessTs119612Context({
      currentBytes: Buffer.from(fixture.current),
      currentResult: fakeResult(fixture.current, CURRENT_URL),
      timeoutMs: 1_000,
      options: { dereference: true, maxDereferences: 4, maxTraversalDepth: 1, maxBytesPerArtifact: 1_000_000 },
    }, {
      fetcher: fixtureFetcher(new Map([[CURRENT_URL, fixture.current], [TARGET_URL, fixture.target]])),
      assessor: fakeAssessor,
    });
    expect(find(depthBound, "ts119612.scheme.pointers.authentication")).toMatchObject({ status: "inconclusive" });
    expect(find(depthBound, "ts119612.context.traversal")).toMatchObject({
      status: "inconclusive",
      evidence: expect.objectContaining({ omittedByDepthBound: 1 }),
    });
  });

  it("integrates supplied offline TL context through the shared CLI/API assessment core", async () => {
    const fixture = await contextFixtures();
    const result = await assessArtifactContent({
      content: fixture.current,
      source: CURRENT_URL,
      contentType: "application/vnd.etsi.tsl+xml",
      strict: false,
      includeJsonLoteChecks: true,
      timeoutMs: 1_000,
      context: { dereference: false, priorArtifacts: [{ content: fixture.prior, source: "prior.xml" }] },
    });

    expect(result.ts119612.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119612.scheme.sequence.history", status: "pass" }),
      expect.objectContaining({ id: "ts119612.context.history_retention", status: "pass" }),
      expect.objectContaining({ id: "ts119612.scheme.pointers.authentication", status: "not_checked" }),
      expect.objectContaining({ id: "ts119612.context.traversal", status: "not_checked" }),
    ]));
  });
});

async function contextFixtures(): Promise<{ current: string; prior: string; target: string; signerCertificate: string }> {
  const [base, signature] = await Promise.all([
    readFile("test/fixtures/ts119612-tsp-service-valid.xml", "utf8"),
    readFile("test/fixtures/ts119612-signature-profile.xml", "utf8"),
  ]);
  const signerCertificate = signature.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)?.[1];
  if (!signerCertificate) throw new Error("Signer fixture certificate is missing.");
  const prior = addFakeSigner(base, signerCertificate);
  const current = addDistribution(
    addPointer(
      addHistory(addFakeSigner(base, signerCertificate))
        .replace("<TSLSequenceNumber>1</TSLSequenceNumber>", "<TSLSequenceNumber>2</TSLSequenceNumber>")
        .replace("2026-01-31T00:00:00Z</ListIssueDateTime>", "2026-03-01T00:00:00Z</ListIssueDateTime>")
        .replace("recognisedatnationallevel</ServiceStatus>", "deprecatedatnationallevel</ServiceStatus>")
        .replace("2026-01-31T00:00:00Z</StatusStartingTime>", "2026-03-01T00:00:00Z</StatusStartingTime>"),
      TARGET_URL, signerCertificate, "EUlistofthelists", "EU",
    ),
    CURRENT_URL,
  );
  const targetBase = (await readFile("test/fixtures/ts119612-scheme-information-valid.xml", "utf8"))
    .replace("TSLType/EUgeneric", "TSLType/EUlistofthelists")
    .replace("<SchemeTerritory>IT</SchemeTerritory>", "<SchemeTerritory>EU</SchemeTerritory>");
  const target = addPointer(addFakeSigner(targetBase, signerCertificate), CURRENT_URL, signerCertificate, "EUgeneric", "IT");
  return { current, prior, target, signerCertificate };
}

function addPointer(xml: string, location: string, certificate: string, targetType: string, territory: string): string {
  const pointer = `      <OtherTSLPointer>
        <ServiceDigitalIdentities><ServiceDigitalIdentity><DigitalId><X509Certificate>${certificate}</X509Certificate></DigitalId></ServiceDigitalIdentity></ServiceDigitalIdentities>
        <TSLLocation>${location}</TSLLocation>
        <AdditionalInformation>
          <OtherInformation><TSLType>http://uri.etsi.org/TrstSvc/TrustedList/TSLType/${targetType}</TSLType></OtherInformation>
          <OtherInformation><SchemeOperatorName><Name xml:lang="en">Example Operator</Name></SchemeOperatorName></OtherInformation>
          <OtherInformation><SchemeTypeCommunityRules><URI xml:lang="en">http://uri.etsi.org/TrstSvc/TrustedList/schemerules/EUcommon</URI></SchemeTypeCommunityRules></OtherInformation>
          <OtherInformation><SchemeTerritory>${territory}</SchemeTerritory></OtherInformation>
          <OtherInformation><at:MimeType xmlns:at="http://uri.etsi.org/02231/v2/additionaltypes#">application/vnd.etsi.tsl+xml</at:MimeType></OtherInformation>
        </AdditionalInformation>
      </OtherTSLPointer>`;
  return xml.replace(/      <OtherTSLPointer>[\s\S]*?      <\/OtherTSLPointer>/, pointer);
}

function addDistribution(xml: string, location: string): string {
  return xml.replace("  </SchemeInformation>", `    <DistributionPoints><URI>${location}</URI></DistributionPoints>\n  </SchemeInformation>`);
}

function addFakeSigner(xml: string, certificate: string): string {
  const withNamespace = xml.replace(/<TrustServiceStatusList\b/, '<TrustServiceStatusList xmlns:ds="http://www.w3.org/2000/09/xmldsig#"');
  return withNamespace.replace("</TrustServiceStatusList>", `<ds:Signature><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificate}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></ds:Signature>\n</TrustServiceStatusList>`);
}

function addHistory(xml: string): string {
  return xml.replace("        </TSPService>", `          <ServiceHistory>
            <ServiceHistoryInstance>
              <ServiceTypeIdentifier>http://uri.etsi.org/TrstSvc/Svctype/RA/nothavingPKIid</ServiceTypeIdentifier>
              <ServiceName><Name xml:lang="en">Example non-PKI registration service</Name></ServiceName>
              <ServiceDigitalIdentity><DigitalId><Other>https://example.test/service-identifiers/registration</Other></DigitalId></ServiceDigitalIdentity>
              <ServiceStatus>http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/recognisedatnationallevel</ServiceStatus>
              <StatusStartingTime>2026-01-31T00:00:00Z</StatusStartingTime>
            </ServiceHistoryInstance>
          </ServiceHistory>
        </TSPService>`);
}

const fakeAssessor: NonNullable<Ts119612ContextDependencies["assessor"]> = async (xml) => {
  const detected = detectArtifact(Buffer.from(xml), "application/vnd.etsi.tsl+xml");
  const certificate = xml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)?.[1];
  const checks: CheckResult[] = [
    finding("signature.cryptographic_verification_result", "pass"),
    finding("dates.next_update_expired", "pass"),
  ];
  return {
    detected: { format: "xml", artifactKind: detected.artifactKind },
    ts119612: { applicable: true, conformanceLevel: "not_checked", score: null, checks, mandatoryFailures: [], warnings: [] },
    extracted: {
      tslVersionIdentifier: tag(xml, "TSLVersionIdentifier"),
      tslSequenceNumber: tag(xml, "TSLSequenceNumber"),
      tslType: tag(xml, "TSLType"),
      schemeTerritory: tag(xml, "SchemeTerritory"),
      listIssueDateTime: tag(xml, "ListIssueDateTime"),
      certificates: certificate ? [certificateFromBase64(certificate, "xml_signature", ASSESSMENT_DATE)] : [],
    },
  } satisfies Ts119612XmlAssessment;
};

function fakeResult(xml: string, source: string): TrustedListAuditResult {
  const assessment = fakeAssessmentSync(xml);
  return {
    id: "current",
    index: 1,
    source,
    location: source,
    declared: { pointerCertificateFingerprintsSha256: [] },
    fetch: { attempted: false, ok: true, bytes: Buffer.byteLength(xml) },
    detected: assessment.detected,
    ts119602Classification: createUnknownTs119602Classification(),
    standardApplicability: { ts119612: "applicable", ts119602: "not_applicable", weBuildProfile: "unknown", eudiTrustRole: "unknown" },
    ts119612: assessment.ts119612,
    ts119602: { applicable: false, conformanceLevel: "not_applicable", score: null, checks: [], mandatoryFailures: [], warnings: [] },
    extracted: assessment.extracted,
  };
}

function fakeAssessmentSync(xml: string): Ts119612XmlAssessment {
  const certificate = xml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)?.[1];
  const detected = detectArtifact(Buffer.from(xml), "application/vnd.etsi.tsl+xml");
  return {
    detected: { format: "xml", artifactKind: detected.artifactKind },
    ts119612: {
      applicable: true, conformanceLevel: "not_checked", score: null,
      checks: [finding("signature.cryptographic_verification_result", "pass"), finding("dates.next_update_expired", "pass")],
      mandatoryFailures: [], warnings: [],
    },
    extracted: {
      tslVersionIdentifier: tag(xml, "TSLVersionIdentifier"), tslSequenceNumber: tag(xml, "TSLSequenceNumber"),
      tslType: tag(xml, "TSLType"), schemeTerritory: tag(xml, "SchemeTerritory"), listIssueDateTime: tag(xml, "ListIssueDateTime"),
      certificates: certificate ? [certificateFromBase64(certificate, "xml_signature", ASSESSMENT_DATE)] : [],
    },
  };
}

function fixtureFetcher(fixtures: Map<string, string>) {
  return vi.fn(async (location: string): Promise<FetchResult> => {
    const content = fixtures.get(location);
    if (!content) return { fetch: { attempted: true, ok: false, status: 404, error: "Missing fixture." } };
    const bytes = Buffer.from(content);
    return { fetch: { attempted: true, ok: true, status: 200, contentType: "application/vnd.etsi.tsl+xml", bytes: bytes.length }, bytes };
  }) as unknown as NonNullable<Ts119612ContextDependencies["fetcher"]> & ReturnType<typeof vi.fn>;
}

function tag(xml: string, name: string): string | undefined { return new RegExp(`<${name}>([^<]+)</${name}>`).exec(xml)?.[1]; }
function pemBase64(pem: string): string { return pem.replace(/-----[^-]+-----|\s+/g, ""); }
function finding(id: string, status: CheckResult["status"]): CheckResult { return { id, category: "profile", status, severity: "info", message: id }; }
function find(checks: CheckResult[], id: string): CheckResult { const result = checks.find((entry) => entry.id === id); if (!result) throw new Error(`Missing check ${id}`); return result; }
