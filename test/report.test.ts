import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAudit } from "../src/audit.js";

const originalFetch = globalThis.fetch;

describe("runAudit", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("writes JSON and Markdown reports without treating JSON LoTE as TS 119 612 failure", async () => {
    const xml = await readFile("test/fixtures/tsl-valid-ish.xml", "utf8");
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
    expect(report.schemaVersion).toBe(2);
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
    expect(report.results[1].standardApplicability).toEqual({
      ts119612: "not_applicable",
      ts119602: "applicable",
      weBuildProfile: "applicable",
      eudiTrustRole: "unknown",
    });
    await expect(readFile(join(outDir, "report.json"), "utf8")).resolves.toContain("\"results\"");
    await expect(readFile(join(outDir, "report.md"), "utf8")).resolves.toContain("TS 119 602");
  });
});
