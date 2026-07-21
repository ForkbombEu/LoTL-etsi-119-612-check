import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseLotlJson } from "../src/lotl.js";
import { assessWeBuildProfile, classifyWeBuildListType } from "../src/profiles/weBuild.js";
import { createUnknownTs119602Classification } from "../src/standards/ts119602Classification.js";
import type { TrustedListAuditResult } from "../src/types.js";

function result(index: number, format: TrustedListAuditResult["detected"]["format"]): TrustedListAuditResult {
  return {
    id: `artifact-${index}`,
    index,
    source: `https://example.test/${index}`,
    location: `https://example.test/${index}`,
    declared: { pointerCertificateFingerprintsSha256: [] },
    fetch: { attempted: true, ok: true },
    detected: { format, artifactKind: format === "xml" ? "ts119612_xml_tsl" : "json_lote" },
    ts119602Classification: createUnknownTs119602Classification(),
    standardApplicability: { ts119612: "unknown", ts119602: "unknown", weBuildProfile: "applicable", eudiTrustRole: "unknown" },
    ts119612: { applicable: false, conformanceLevel: "not_applicable", score: null, checks: [], mandatoryFailures: [], warnings: [] },
    ts119602: { applicable: format === "json", conformanceLevel: format === "json" ? "not_checked" : "not_applicable", score: null, checks: [], mandatoryFailures: [], warnings: [] },
  };
}

describe("WE BUILD profile", () => {
  it("classifies implemented list types", () => {
    expect(classifyWeBuildListType("http://uri.etsi.org/19602/LoTEType/EUWalletProvidersList").role).toBe("wallet_provider");
    expect(classifyWeBuildListType("http://uri.etsi.org/19602/LoTEType/EUPIDProvidersList").role).toBe("pid_provider");
    expect(classifyWeBuildListType("http://uri.etsi.org/19602/LoTEType/EUWRPACProvidersList").role).toBe("wrpac_provider");
    expect(classifyWeBuildListType("http://uri.etsi.org/19602/LoTEType/EUWRPRCProvidersList").role).toBe("wrprc_provider");
    expect(classifyWeBuildListType("http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList").role).toBe("pub_eaa_provider");
    expect(classifyWeBuildListType("http://uri.etsi.org/19602/LoTEType/EURegistrarsAndRegistersList").role).toBe("registrar_or_register");
    expect(classifyWeBuildListType("http://uri.etsi.org/19602/LoTEType/EUgeneric").role).toBe("qeaa_provider");
  });

  it("summarizes roles and pointer consistency for a reduced WE BUILD LoTL", async () => {
    const [lotlText, signedXml] = await Promise.all([
      readFile("test/fixtures/we-build-lotl-profile.json", "utf8"),
      readFile("test/fixtures/tsl-signed-unsupported.xml", "utf8"),
    ]);
    const lotl = parseLotlJson(lotlText);
    const certificate = signedXml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)?.[1];
    if (!certificate) throw new Error("Signed fixture must contain a certificate.");
    const firstPointer = lotl.pointers[0].raw as { ServiceDigitalIdentities: Array<{ X509Certificates: string[] }> };
    firstPointer.ServiceDigitalIdentities[0].X509Certificates = [certificate];
    const results = [result(1, "json"), result(2, "xml"), result(3, "json")];
    const summary = assessWeBuildProfile(lotl, results, new Date("2026-08-01T00:00:00Z"));
    expect(summary).toMatchObject({
      recognized: true,
      listTypeCounts: { EUWalletProvidersList: 1, EUWRPACProvidersList: 1, unknown: 1 },
      roleCounts: { wallet_provider: 1, wrpac_provider: 1, unknown: 1 },
      pointerConsistency: { declaredMimeMismatches: 1, duplicateLocations: 2, pointersMissingServiceDigitalIdentities: 1, pointersMissingQualifiers: 1, pointerCertificatesParsed: 1, pointerCertificatesInvalidAtAssessment: 0 },
    });
    expect(results[0].ts119612.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "we_build.pointer.declared_mime_matches_detected", status: "warn" }),
      expect.objectContaining({ id: "we_build.pointer.duplicate_location", status: "warn" }),
      expect.objectContaining({ id: "we_build.pointer.certificate_evidence", status: "pass" }),
    ]));
  });
});
