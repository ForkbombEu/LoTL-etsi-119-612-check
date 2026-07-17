import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateNegativeFixtureDescriptors, renderNegativeFixtureDescriptorsMarkdown, writeNegativeFixtureDescriptors } from "../src/fixtures/negativeDescriptors.js";
import type { FcafTrustedAuthoritiesReadiness, FixtureReadiness, TrustedListAuditResult } from "../src/types.js";

const result: TrustedListAuditResult = {
  id: "artifact-1", index: 1, source: "https://example.test/tl.xml", location: "https://example.test/tl.xml",
  declared: { pointerCertificateFingerprintsSha256: [] }, fetch: { attempted: true, ok: true },
  detected: { format: "xml", artifactKind: "ts119612_xml_tsl" },
  standardApplicability: { ts119612: "applicable", ts119602: "not_applicable", weBuildProfile: "applicable", eudiTrustRole: "applicable" },
  ts119612: { applicable: true, conformanceLevel: "partially_conformant", score: null, checks: [], mandatoryFailures: [], warnings: [] },
};

const fcaf: FcafTrustedAuthoritiesReadiness = { scenarios: [
  { id: "aki_positive_match_possible", status: "ready", evidence: {}, missingPrerequisites: [] },
  { id: "aki_no_match_possible", status: "ready", evidence: {}, missingPrerequisites: [] },
  { id: "etsi_tl_positive_match_possible", status: "ready", evidence: {}, missingPrerequisites: [] },
  { id: "etsi_tl_no_match_possible", status: "ready", evidence: {}, missingPrerequisites: [] },
  { id: "etsi_tl_unreachable_negative_possible", status: "ready", evidence: {}, missingPrerequisites: [] },
  { id: "etsi_tl_invalid_signature_negative_possible", status: "ready", evidence: {}, missingPrerequisites: [] },
  { id: "etsi_tl_cascading_lotl_tl_possible", status: "ready", evidence: {}, missingPrerequisites: [] },
  { id: "rpac_chain_to_access_ca_possible", status: "ready", evidence: {}, missingPrerequisites: [] },
] };

const fixtureReadiness: FixtureReadiness = { usableForWalletTrustFixture: true, verdict: "ready", checks: [], caveats: [], rpacChain: { chainStructurallyValid: true, trustedByTlLote: true } };

describe("negative fixture descriptors", () => {
  it("derives all requested negative cases without asking to mutate the source artifact", () => {
    const descriptors = generateNegativeFixtureDescriptors({ results: [result], fcafTrustedAuthorities: fcaf, fixtureReadiness, pointerCertificatesParsed: 1, accessCaOrWrpacProviderCount: 1, listTypeCounts: { EUWRPACProvidersList: 1 } });
    expect(descriptors).toHaveLength(8);
    expect(descriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "unknown_access_ca", status: "ready" }),
      expect.objectContaining({ id: "invalid_tl_signature", status: "ready", steps: expect.arrayContaining([expect.stringContaining("never modify fetched")]) }),
      expect.objectContaining({ id: "rpac_chain_not_anchored", status: "ready" }),
    ]));
    expect(renderNegativeFixtureDescriptorsMarkdown(descriptors)).toContain("# Negative fixture descriptors");
  });

  it("writes compact JSON and Markdown only when the explicit writer is called", async () => {
    const descriptors = generateNegativeFixtureDescriptors({ results: [result], fcafTrustedAuthorities: fcaf, fixtureReadiness, pointerCertificatesParsed: 1, accessCaOrWrpacProviderCount: 1, listTypeCounts: { EUWRPACProvidersList: 1 } });
    const directory = await mkdtemp(join(tmpdir(), "negative-fixtures-"));
    const paths = await writeNegativeFixtureDescriptors(descriptors, directory);
    await expect(readFile(paths.jsonPath, "utf8")).resolves.toContain("unknown_access_ca");
    await expect(readFile(paths.markdownPath, "utf8")).resolves.toContain("invalid_tl_signature");
  });
});
