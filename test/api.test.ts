import { readFile } from "node:fs/promises";
import { describe, expect, it, afterEach, vi } from "vitest";
import YAML from "yaml";
import { buildServer } from "../src/api/server.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

describe("API server", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns healthz", async () => {
    const app = await buildServer();
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      name: "we-build-tl-audit",
      version: "0.1.0",
    });
    await app.close();
  });

  it("parses LoTL pointers without fetching", async () => {
    const app = await buildServer();
    const lotl = JSON.parse(await readFile("test/fixtures/lotl.json", "utf8"));
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/lotl/parse",
      payload: { lotl },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.summary).toMatchObject({ pointerCount: 3, uniqueLocationCount: 3 });
    expect(body.pointers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        index: 1,
        location: "https://example.test/tl.xml",
      }),
    ]));
    await app.close();
  });

  it("audits JSON LoTL and returns JSON report plus Markdown", async () => {
    const app = await buildServer();
    const lotl = JSON.parse(await readFile("test/fixtures/lotl.json", "utf8"));
    const xml = await readFile("test/fixtures/tsl-valid-ish.xml", "utf8");
    const json = await readFile("test/fixtures/json-lote.json", "utf8");
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/tl.xml")) {
        return new Response(xml, { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (url.endsWith("/lote.json")) {
        return new Response(json, { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("missing", { status: 404, statusText: "Not Found" });
    }) as typeof fetch;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/audit/json",
      payload: {
        lotl,
        options: {
          concurrency: 2,
          timeoutMs: 1000,
          strict: false,
          includeJsonLoteChecks: true,
          fetch: true,
        },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.report.summary.totalPointers).toBe(3);
    expect(body.report.summary.jsonArtifacts).toBe(1);
    expect(body.report.results[1].ts119612.conformanceLevel).toBe("not_applicable");
    expect(body.report.results[1].ts119602.conformanceLevel).toBe("non_conformant");
    expect(body.report.results[1].ts119602Classification).toMatchObject({
      binding: "scheme_explicit_json",
      bindingStatus: "selected",
    });
    expect(body.markdown).toContain("# WE BUILD Trusted List Audit");
    await app.close();
  });

  it("assesses a single artifact URL", async () => {
    const app = await buildServer();
    const xml = await readFile("test/fixtures/tsl-valid-ish.xml", "utf8");
    globalThis.fetch = vi.fn(async () => new Response(xml, { status: 200, headers: { "content-type": "application/xml" } })) as typeof fetch;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/artifact/assess-url",
      payload: {
        url: "https://example.test/tl.xml",
        declared: {
          mimeType: "application/xml",
          pointerCertificateFingerprintsSha256: [],
        },
        options: {
          timeoutMs: 1000,
          strict: false,
          includeJsonLoteChecks: true,
        },
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().result).toMatchObject({
      index: 1,
      location: "https://example.test/tl.xml",
      detected: { format: "xml" },
    });
    await app.close();
  });

  it("exposes the expanded assessment core through POST endpoints", async () => {
    const app = await buildServer();
    const [lotl, xml, jades] = await Promise.all([
      readFile("test/fixtures/lotl.json", "utf8"),
      readFile("test/fixtures/tsl-valid-ish.xml", "utf8"),
      readFile("test/fixtures/ts119602-jades-compact.jws", "utf8"),
    ]);
    const lotlResponse = await app.inject({
      method: "POST",
      url: "/api/audit/lotl",
      payload: { content: lotl, options: { fetch: false } },
    });
    expect(lotlResponse.statusCode).toBe(200);
    expect(lotlResponse.json().report.summary.totalPointers).toBe(3);

    const artifactResponse = await app.inject({
      method: "POST",
      url: "/api/audit/artifact",
      payload: { content: xml, source: "fixture.xml", contentType: "application/xml", options: { strict: false, includeJsonLoteChecks: true } },
    });
    expect(artifactResponse.statusCode).toBe(200);
    expect(artifactResponse.json().result).toMatchObject({ source: "fixture.xml", fetch: { attempted: false }, detected: { format: "xml" } });

    const jadesResponse = await app.inject({
      method: "POST",
      url: "/api/audit/artifact",
      payload: { content: jades, source: "fixture.jws", contentType: "application/jose", options: { strict: false } },
    });
    expect(jadesResponse.statusCode).toBe(200);
    expect(jadesResponse.json().result).toMatchObject({
      source: "fixture.jws",
      detected: { format: "jws", artifactKind: "json_lote" },
      ts119602: {
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "json_lote.signature.jades_cryptographic_verification_result", status: "pass" }),
        ]),
      },
    });

    const chainResponse = await app.inject({
      method: "POST",
      url: "/api/audit/certificate-chain",
      payload: { chain: ["malformed-certificate"], declaredRole: "access_ca_or_wrpac_provider" },
    });
    expect(chainResponse.statusCode).toBe(200);
    expect(chainResponse.json().assessment.chainStructurallyValid).toBe(false);

    const fixtureResponse = await app.inject({
      method: "POST",
      url: "/api/audit/fixture-readiness",
      payload: { lotl: JSON.parse(lotl), options: { fetch: false } },
    });
    expect(fixtureResponse.statusCode).toBe(200);
    expect(fixtureResponse.json()).toMatchObject({
      fixtureReadiness: { verdict: "not_checked" },
      fcafTrustedAuthorities: { scenarios: expect.any(Array) },
      negativeFixtureDescriptors: expect.any(Array),
    });
    await app.close();
  });

  it("renders Markdown from supplied report", async () => {
    const app = await buildServer();
    const report = {
      schemaVersion: 4,
      tool: { name: "we-build-tl-audit", version: "0.1.0" },
      generatedAt: "2026-07-16T00:00:00.000Z",
      input: { source: "request-body", kind: "json" },
      lotl: { pointerCount: 0, uniqueLocationCount: 0, duplicateLocations: [] },
      weBuildProfile: {
        recognized: false,
        recognitionReasons: [],
        listTypeCounts: {},
        roleCounts: {},
        pointerConsistency: {
          declaredMimeMismatches: 0,
          duplicateLocations: 0,
          pointersMissingServiceDigitalIdentities: 0,
          pointersMissingQualifiers: 0,
          pointerCertificatesParsed: 0,
          pointerCertificatesInvalidAtAssessment: 0,
        },
      },
      fixtureReadiness: {
        usableForWalletTrustFixture: false,
        verdict: "not_checked",
        checks: [],
        caveats: ["No referenced artifact was assessed."],
      },
      fcafTrustedAuthorities: { scenarios: [] },
      negativeFixtureDescriptors: [],
      summary: {
        totalPointers: 0,
        fetched: 0,
        fetchFailed: 0,
        xmlArtifacts: 0,
        jsonArtifacts: 0,
        unknownArtifacts: 0,
        ts119612: {
          conformant: 0,
          partiallyConformant: 0,
          nonConformant: 0,
          notApplicable: 0,
          notChecked: 0,
          parseFailed: 0,
        },
        ts119602: {
          conformant: 0,
          partiallyConformant: 0,
          nonConformant: 0,
          notApplicable: 0,
          notChecked: 0,
          unsupported: 0,
          inconclusive: 0,
          parseFailed: 0,
        },
      },
      results: [],
    };
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/report/markdown",
      payload: { report },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().markdown).toContain("# WE BUILD Trusted List Audit");
    await app.close();
  });

  it("returns stable 400 error for invalid body", async () => {
    const app = await buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/audit/url",
      payload: { options: {} },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "invalid_request",
        message: "Invalid request body.",
      },
    });
    await app.close();
  });

  it("serves loadable OpenAPI specs with required paths", async () => {
    const app = await buildServer();
    const yamlResponse = await app.inject({ method: "GET", url: "/openapi.yaml" });
    const jsonResponse = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(yamlResponse.statusCode).toBe(200);
    expect(jsonResponse.statusCode).toBe(200);
    const parsedYaml = YAML.parse(yamlResponse.body);
    const parsedJson = jsonResponse.json();
    for (const path of [
      "/healthz",
      "/api/v1/audit/url",
      "/api/v1/audit/json",
      "/api/v1/lotl/parse",
      "/api/v1/artifact/assess-url",
      "/api/v1/report/markdown",
      "/api/audit/lotl",
      "/api/audit/artifact",
      "/api/audit/certificate-chain",
      "/api/audit/fixture-readiness",
      "/api/reports/markdown",
      "/docs",
    ]) {
      expect(parsedYaml.paths[path]).toBeDefined();
      expect(parsedJson.paths[path]).toBeDefined();
    }
    await app.close();
  });

  it("uses request origin in served OpenAPI specs", async () => {
    const app = await buildServer();
    const headers = { host: "127.0.0.1:8088" };
    const yamlResponse = await app.inject({ method: "GET", url: "/openapi.yaml", headers });
    const jsonResponse = await app.inject({ method: "GET", url: "/openapi.json", headers });
    expect(YAML.parse(yamlResponse.body).servers[0].url).toBe("http://127.0.0.1:8088");
    expect(jsonResponse.json().servers[0].url).toBe("http://127.0.0.1:8088");
    await app.close();
  });

  it("uses PUBLIC_BASE_URL ahead of request origin", async () => {
    process.env.PUBLIC_BASE_URL = "https://audit.example.test/";
    const app = await buildServer();
    const response = await app.inject({ method: "GET", url: "/openapi.json", headers: { host: "127.0.0.1:8088" } });
    expect(response.json().servers[0].url).toBe("https://audit.example.test");
    await app.close();
  });

  it("uses env audit defaults when request options are omitted", async () => {
    process.env.AUDIT_FETCH = "false";
    process.env.AUDIT_CONCURRENCY = "2";
    process.env.AUDIT_TIMEOUT_MS = "500";
    const app = await buildServer();
    const lotl = JSON.parse(await readFile("test/fixtures/lotl.json", "utf8"));
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/audit/json",
      payload: { lotl },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().report.summary).toMatchObject({ fetched: 0, fetchFailed: 0, unknownArtifacts: 3 });
    await app.close();
  });

  it("serves Stoplight Elements docs HTML", async () => {
    const app = await buildServer();
    const response = await app.inject({ method: "GET", url: "/docs" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("@stoplight/elements");
    expect(response.body).toContain("/openapi.yaml");
    await app.close();
  });
});
