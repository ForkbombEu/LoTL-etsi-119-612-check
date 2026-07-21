import { describe, expect, it } from "vitest";
import { assessFcafTrustedAuthorities } from "../src/fcaf/trustedAuthorities.js";
import type { FixtureReadiness, TrustedListAuditResult } from "../src/types.js";

function result(index: number, kind: TrustedListAuditResult["detected"]["artifactKind"], signingCertificate = false): TrustedListAuditResult {
  const xml = kind === "ts119612_xml_tsl" || kind === "ts119612_xml_lotl";
  return {
    id: `artifact-${index}`,
    index,
    source: `https://example.test/${index}`,
    location: `https://example.test/${index}`,
    declared: { pointerCertificateFingerprintsSha256: [] },
    fetch: { attempted: true, ok: true },
    detected: { format: xml ? "xml" : "json", artifactKind: kind },
    standardApplicability: { ts119612: xml ? "applicable" : "not_applicable", ts119602: xml ? "not_applicable" : "applicable", weBuildProfile: "applicable", eudiTrustRole: "applicable" },
    ts119612: {
      applicable: xml,
      conformanceLevel: xml ? "partially_conformant" : "not_applicable",
      score: null,
      checks: signingCertificate ? [{ id: "signature.signing_certificate_parsed", category: "signature", status: "pass", severity: "info", message: "parsed" }] : [],
      mandatoryFailures: [],
      warnings: [],
    },
    ts119602: {
      applicable: !xml,
      conformanceLevel: xml ? "not_applicable" : "not_checked",
      score: null,
      checks: [],
      mandatoryFailures: [],
      warnings: [],
    },
  };
}

const chainReady: FixtureReadiness = {
  usableForWalletTrustFixture: true,
  verdict: "ready",
  checks: [],
  caveats: [],
  rpacChain: { chainStructurallyValid: true, trustedByTlLote: true },
};

describe("assessFcafTrustedAuthorities", () => {
  it("maps audited XML, anchor, role, and chain evidence to runnable FCAF scenarios", () => {
    const readiness = assessFcafTrustedAuthorities({
      pointerCount: 2,
      results: [result(1, "ts119612_xml_tsl", true), result(2, "json_lote")],
      pointerCertificatesParsed: 1,
      accessCaOrWrpacProviderCount: 1,
      fixtureReadiness: chainReady,
    });
    expect(readiness.scenarios).toHaveLength(8);
    expect(readiness.scenarios).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "aki_positive_match_possible", status: "ready", missingPrerequisites: [] }),
      expect.objectContaining({ id: "etsi_tl_positive_match_possible", status: "ready", missingPrerequisites: [] }),
      expect.objectContaining({ id: "etsi_tl_invalid_signature_negative_possible", status: "ready" }),
      expect.objectContaining({ id: "rpac_chain_to_access_ca_possible", status: "ready" }),
    ]));
  });

  it("makes missing fixture prerequisites explicit instead of assuming them", () => {
    const readiness = assessFcafTrustedAuthorities({
      pointerCount: 0,
      results: [],
      pointerCertificatesParsed: 0,
      accessCaOrWrpacProviderCount: 0,
      fixtureReadiness: { usableForWalletTrustFixture: false, verdict: "not_checked", checks: [], caveats: [] },
    });
    expect(readiness.scenarios).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "aki_positive_match_possible", status: "not_ready", missingPrerequisites: expect.arrayContaining([expect.stringContaining("parseable pointer certificate")] ) }),
      expect.objectContaining({ id: "etsi_tl_cascading_lotl_tl_possible", status: "not_ready" }),
      expect.objectContaining({ id: "rpac_chain_to_access_ca_possible", status: "not_ready", missingPrerequisites: expect.arrayContaining([expect.stringContaining("Access CA")]) }),
    ]));
  });
});
