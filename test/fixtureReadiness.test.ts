import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessFixtureReadiness } from "../src/eudi/fixtureReadiness.js";
import { parseLotlJson } from "../src/lotl.js";
import { createUnknownTs119602Classification } from "../src/standards/ts119602Classification.js";
import type { TrustedListAuditResult } from "../src/types.js";

function result(index: number, format: "xml" | "json"): TrustedListAuditResult {
  return {
    id: `artifact-${index}`,
    index,
    source: `https://example.test/${index}`,
    location: `https://example.test/${index}`,
    declared: { pointerCertificateFingerprintsSha256: [] },
    fetch: { attempted: true, ok: true },
    detected: { format, artifactKind: format === "xml" ? "ts119612_xml_tsl" : "json_lote" },
    ts119602Classification: createUnknownTs119602Classification(),
    standardApplicability: { ts119612: format === "xml" ? "applicable" : "not_applicable", ts119602: format === "json" ? "applicable" : "not_applicable", weBuildProfile: "applicable", eudiTrustRole: "unknown" },
    ts119612: { applicable: format === "xml", conformanceLevel: format === "xml" ? "partially_conformant" : "not_applicable", score: null, checks: [{ id: "dates.next_update_valid", category: "dates", status: "pass", severity: "info", message: "test" }], mandatoryFailures: [], warnings: [] },
    ts119602: { applicable: format === "json", conformanceLevel: format === "json" ? "not_checked" : "not_applicable", score: null, checks: format === "json" ? [{ id: "json_lote.root", category: "structure", status: "pass", severity: "info", message: "test" }] : [], mandatoryFailures: [], warnings: [] },
    extracted: format === "xml" ? { certificates: [{ source: "xml_signature", subject: "CN=Signer" }] } : undefined,
  };
}

describe("assessFixtureReadiness", () => {
  it("reports wallet fixture prerequisites and an optional supplied RPAC chain separately", async () => {
    const [lotlText, signedXml] = await Promise.all([
      readFile("test/fixtures/we-build-lotl-profile.json", "utf8"),
      readFile("test/fixtures/tsl-signed-unsupported.xml", "utf8"),
    ]);
    const lotl = parseLotlJson(lotlText);
    const certificate = signedXml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)?.[1];
    if (!certificate) throw new Error("Signed fixture must contain a certificate.");
    const firstPointer = lotl.pointers[0].raw as { ServiceDigitalIdentities: Array<{ X509Certificates: string[] }> };
    firstPointer.ServiceDigitalIdentities[0].X509Certificates = [certificate];
    const readiness = assessFixtureReadiness({
      source: "fixture",
      lotl,
      results: [result(1, "json"), result(2, "xml"), result(3, "json")],
      weBuildRoleCounts: { wrpac_provider: 1 },
      weBuildPointerConsistency: { declaredMimeMismatches: 0 },
      rpacChain: ["malformed-certificate"],
      assessmentDate: new Date("2026-08-01T00:00:00Z"),
    });
    expect(readiness).toMatchObject({
      usableForWalletTrustFixture: true,
      verdict: "partially_ready",
      rpacChain: { chainStructurallyValid: false, trustedByTlLote: false },
    });
    expect(readiness.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "fixture_readiness.trust_anchor_extractable", status: "pass" }),
      expect.objectContaining({ id: "fixture_readiness.signing_certificate_evidence", status: "pass" }),
      expect.objectContaining({ id: "fixture_readiness.rpac_chain_assessed", status: "pass" }),
    ]));
  });
});
