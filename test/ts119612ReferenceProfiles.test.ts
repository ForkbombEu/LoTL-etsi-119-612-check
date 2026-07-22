import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessArtifactContent } from "../src/audit.js";
import { assessTs119612ReferenceProfiles } from "../src/profiles/ts119612ReferenceProfiles.js";

describe("TS 119 612 reference profiles", () => {
  it("recognizes EUDI RI input and classifies trust roles without making a trust decision", async () => {
    const xml = await readFile("test/fixtures/eudi-ri-ts119612-tl.xml", "utf8");
    const profiles = assessTs119612ReferenceProfiles({
      xml,
      source: "https://trustedlist.serviceproviders.eudiw.dev/TL/EU/01.xml",
      artifactKind: "ts119612_xml_tsl",
    });

    expect(profiles.eudiRiTs119612).toMatchObject({
      applicability: "applicable",
      recognized: true,
      observedRoles: ["access_ca_or_wrpac_provider", "wallet_provider"],
    });
    expect(profiles.eudiRiTs119612.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "eudi_ri.ts119612.reference_source_trust", status: "warn" }),
      expect.objectContaining({ id: "eudi_ri.ts119612.endpoint_artifact_role", status: "pass" }),
      expect.objectContaining({ id: "eudi_ri.ts119612.service_role_classification", status: "pass" }),
      expect.objectContaining({ id: "eudi_ri.ts119612.role_trust_anchor_evidence", status: "pass" }),
    ]));
    expect(profiles.weBuildTs119612.applicability).toBe("not_applicable");
  });

  it("warns when EUDI RI endpoint role and role identity evidence do not match", async () => {
    const xml = (await readFile("test/fixtures/eudi-ri-ts119612-tl.xml", "utf8"))
      .replace("<X509Certificate>QUJD</X509Certificate>", "");
    const profile = assessTs119612ReferenceProfiles({
      xml,
      source: "https://trustedlist.serviceproviders.eudiw.dev/LOTL/01.xml",
      artifactKind: "ts119612_xml_tsl",
    }).eudiRiTs119612;

    expect(profile.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "eudi_ri.ts119612.endpoint_artifact_role", status: "warn" }),
      expect.objectContaining({ id: "eudi_ri.ts119612.role_trust_anchor_evidence", status: "warn" }),
    ]));
  });

  it("recognizes the WE BUILD XML distribution-index compatibility shape", async () => {
    const xml = await readFile("test/fixtures/we-build-ts119612-index.xml", "utf8");
    const profile = assessTs119612ReferenceProfiles({
      xml,
      source: "https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.xml",
      artifactKind: "ts119612_xml_tsl",
    }).weBuildTs119612;

    expect(profile).toMatchObject({ applicability: "applicable", recognized: true, observedRoles: [] });
    expect(profile.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "we_build.ts119612.namespace_binding", status: "warn" }),
      expect.objectContaining({ id: "we_build.ts119612.artifact_shape", status: "pass" }),
      expect.objectContaining({ id: "we_build.ts119612.distribution_references", status: "pass" }),
      expect.objectContaining({ id: "we_build.ts119612.service_role_classification", status: "not_applicable" }),
    ]));
  });

  it("does not recognize the compatibility namespace by itself", () => {
    const xml = `<TrustServiceStatusList xmlns="http://uri.etsi.org/19612/v2.4.1#" Id="generic"><SchemeInformation><TSLType>http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric</TSLType></SchemeInformation></TrustServiceStatusList>`;
    const profiles = assessTs119612ReferenceProfiles({ xml, source: "fixture.xml", artifactKind: "ts119612_xml_tsl" });
    expect(profiles.eudiRiTs119612.applicability).toBe("not_applicable");
    expect(profiles.weBuildTs119612.applicability).toBe("not_applicable");
  });

  it("exposes profile results through the shared artifact assessor without changing ETSI checks", async () => {
    const xml = await readFile("test/fixtures/eudi-ri-ts119612-tl.xml", "utf8");
    const result = await assessArtifactContent({
      content: xml,
      source: "https://trustedlist.serviceproviders.eudiw.dev/TL/EU/01.xml",
      contentType: "application/xml",
      timeoutMs: 1_000,
      strict: false,
      includeJsonLoteChecks: true,
    });

    expect(result.referenceProfiles.eudiRiTs119612.recognized).toBe(true);
    expect(result.standardApplicability).toMatchObject({ weBuildProfile: "not_applicable", eudiTrustRole: "applicable" });
    expect(result.ts119612.checks.some((check) => check.id.startsWith("eudi_ri.") || check.id.startsWith("we_build."))).toBe(false);
  });
});
