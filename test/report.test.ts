import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAudit } from "../src/audit.js";

const originalFetch = globalThis.fetch;

async function signedFixture(): Promise<string> {
  return readFile("test/fixtures/tsl-signed-unsupported.xml", "utf8");
}

describe("runAudit", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("writes JSON and Markdown reports without treating JSON LoTE as TS 119 612 failure", async () => {
    const xml = await signedFixture();
    const json = await readFile("test/fixtures/json-lote.json", "utf8");
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/tl.xml")) {
        return new Response(xml, {
          status: 200,
          headers: { "content-type": "application/xml" },
        });
      }
      if (url.endsWith("/lote.json")) {
        return new Response(json, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("missing", { status: 404, statusText: "Not Found" });
    }) as typeof fetch;

    const outDir = await mkdtemp(join(tmpdir(), "we-build-tl-audit-test-"));
    const report = await runAudit(
      {
        input: "test/fixtures/lotl.json",
        outDir,
        concurrency: 2,
        timeoutMs: 1000,
        strict: false,
        includeJsonLoteChecks: true,
        fetch: true,
      },
      "0.0.0-test",
    );

    expect(report.summary.totalPointers).toBe(3);
    expect(report.summary.fetched).toBe(2);
    expect(report.summary.fetchFailed).toBe(1);
    expect(report.summary.jsonArtifacts).toBe(1);
    expect(report.schemaVersion).toBe(4);
    expect(report.results[0]).toMatchObject({
      id: expect.stringMatching(/^artifact-001-[a-f0-9]{12}$/),
      source: "https://example.test/tl.xml",
      detected: { artifactKind: "ts119612_xml_tsl" },
      standardApplicability: {
        ts119612: "applicable",
        ts119602: "not_applicable",
        weBuildProfile: "unknown",
        eudiTrustRole: "unknown",
      },
    });
    expect(report.results[1].ts119612.conformanceLevel).toBe("not_applicable");
    expect(report.results[1].ts119612.mandatoryFailures).toEqual([]);
    expect(report.results[1].ts119602).toMatchObject({
      applicable: true,
      conformanceLevel: "non_conformant",
    });
    expect(report.results[1].ts119602Classification).toMatchObject({
      dataModel: "ts119602",
      binding: "scheme_explicit_json",
      bindingStatus: "selected",
    });
    expect(report.summary.ts119602.nonConformant).toBe(1);
    expect(report.summary.ts119602.unsupported).toBe(0);
    expect(report.results[1].standardApplicability).toEqual({
      ts119612: "not_applicable",
      ts119602: "applicable",
      weBuildProfile: "applicable",
      eudiTrustRole: "unknown",
    });
    const reportJson = await readFile(join(outDir, "report.json"), "utf8");
    expect(reportJson).toContain("\"structure.scheme_information\"");
    expect(reportJson).toContain("\"schema.xsd\"");
    expect(reportJson).toContain("\"json_lote.version_identifier\"");
    expect(reportJson).toContain("\"ts119602.binding.json_schema\"");
    const markdown = await readFile(join(outDir, "report.md"), "utf8");
    expect(markdown).toContain("TS 119 602");
    expect(markdown).toContain("**structure.scheme_information**");
    expect(markdown).toContain("**structure.trust_service_provider_list**");
    expect(markdown).toContain("**schema.xsd**");
    expect(markdown).toContain("**signature.signing_certificate_present**");
    expect(markdown).toContain("### Certificate evidence");
    expect(markdown).toContain("Source: xml_signature");
    expect(markdown).toContain("**json_lote.pointers.service_digital_identities**");
    expect(markdown).toContain("### ETSI TS 119 602 assessment");
    expect(markdown).toContain("TS 119 602 classification: data model=ts119602; binding=scheme_explicit_json (selected)");
    expect(markdown).toContain("Can this trust-list bundle be used as a wallet trust fixture?");
    expect(markdown).toContain("## FCAF trusted_authorities fixture readiness");
    expect(report.fcafTrustedAuthorities.scenarios).toHaveLength(8);
    expect(markdown).toContain("## Negative fixture descriptors");
    expect(report.negativeFixtureDescriptors).toHaveLength(8);
  });

  it("adds WE BUILD list-type and pointer-consistency summary from a reduced fixture", async () => {
    const [xml, json] = await Promise.all([
      readFile("test/fixtures/tsl-valid-ish.xml", "utf8"),
      readFile("test/fixtures/json-lote.json", "utf8"),
    ]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(url.endsWith(".xml") ? xml : json, {
        status: 200,
        headers: { "content-type": url.endsWith(".xml") ? "application/xml" : "application/json" },
      });
    }) as typeof fetch;
    const outDir = await mkdtemp(join(tmpdir(), "we-build-profile-test-"));
    const report = await runAudit({
      input: "test/fixtures/we-build-lotl-profile.json",
      outDir,
      concurrency: 2,
      timeoutMs: 1000,
      strict: false,
      includeJsonLoteChecks: true,
      fetch: true,
    }, "0.0.0-test");
    expect(report.weBuildProfile).toMatchObject({
      recognized: true,
      listTypeCounts: { EUWalletProvidersList: 1, EUWRPACProvidersList: 1, unknown: 1 },
      roleCounts: { wallet_provider: 1, wrpac_provider: 1, unknown: 1 },
      pointerConsistency: { declaredMimeMismatches: 1, duplicateLocations: 2 },
    });
    expect(report.results[0].ts119612.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "we_build.pointer.declared_mime_matches_detected", status: "warn" }),
    ]));
    await expect(readFile(join(outDir, "report.md"), "utf8")).resolves.toContain("## WE BUILD profile");
  });
});
