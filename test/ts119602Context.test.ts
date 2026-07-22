import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessArtifactContent, runAuditFromJson } from "../src/audit.js";
import { parseCompactJades } from "../src/json/jades.js";
import { inspectTs119602JsonPointerIdentity } from "../src/standards/ts119602Context.js";
import { inspectTs119602Certificate, matchTs119602IdentityMaterial } from "../src/standards/ts119602Identity.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("ETSI TS 119 602 contextual validation", () => {
  it("validates supplied prior evidence and bounded pointer, distribution, archive, supply-point, and signer trust evidence", async () => {
    const current = (await readFile("test/fixtures/ts119602-context-current.jws", "utf8")).trim();
    const parsed = parseCompactJades(current);
    const prior = structuredClone(parsed.parsedPayload) as ContextPayload;
    prior.LoTE.ListAndSchemeInformation.LoTESequenceNumber = 1;
    prior.LoTE.ListAndSchemeInformation.ListIssueDateTime = "2026-01-01T00:00:00Z";
    const signingCertificate = (parsed.protectedHeader?.x5c as string[])[0];
    const certificate = new X509Certificate(Buffer.from(signingCertificate, "base64"));
    const trustedFingerprint = certificate.fingerprint256.replace(/:/g, "").toLowerCase();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/current.jws")) return new Response(current, { status: 200, headers: { "content-type": "application/jose" } });
      if (url.endsWith("/archive")) return Response.json(prior);
      if (url.endsWith("/register")) return Response.json({ registrations: [] });
      return new Response("missing", { status: 404 });
    }) as typeof fetch;

    const result = await assessArtifactContent({
      content: current,
      source: "https://context.example.test/current.jws",
      contentType: "application/jose",
      strict: false,
      includeJsonLoteChecks: true,
      timeoutMs: 1_000,
      context: {
        dereference: true,
        priorArtifacts: [{ content: JSON.stringify(prior), source: "prior.json", contentType: "application/json" }],
        trustedSignerFingerprintsSha256: [trustedFingerprint],
        pointerSigners: [{
          location: "https://context.example.test/current.jws",
          trustAnchors: [signingCertificate],
          revocation: {
            status: "good",
            source: "test-status-evidence",
            checkedAt: "2026-07-21T00:00:00Z",
            nextUpdate: "2027-07-21T00:00:00Z",
            signerFingerprintSha256: trustedFingerprint,
          },
        }],
        maxDereferences: 8,
        maxBytesPerArtifact: 1_000_000,
        concurrency: 2,
      },
    });

    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.scheme.sequence.history", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.pointers.authentication", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.distribution_consistency", status: "pass" }),
      expect.objectContaining({ id: "ts119602.context.archive", status: "pass" }),
      expect.objectContaining({ id: "ts119602.context.supply_point", status: "pass" }),
      expect.objectContaining({ id: "ts119602.context.bounds", status: "pass" }),
      expect.objectContaining({ id: "json_lote.signature.jades_signer_trust", status: "pass" }),
    ]));
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(find(result, "ts119602.scheme.pointers.authentication")).toMatchObject({
      evidence: expect.objectContaining({
        results: [expect.objectContaining({
          signerTrustEvidence: expect.objectContaining({
            path: expect.objectContaining({ status: "pass" }),
            revocation: expect.objectContaining({ status: "pass" }),
          }),
        })],
      }),
    });
  });

  it("extracts and matches PublicKeyValue and X509SKI pointer identities", async () => {
    const current = (await readFile("test/fixtures/ts119602-context-current.jws", "utf8")).trim();
    const parsed = parseCompactJades(current);
    const signingCertificate = (parsed.protectedHeader?.x5c as string[])[0];
    const certificate = new X509Certificate(Buffer.from(signingCertificate, "base64"));
    const inspected = inspectTs119602Certificate(signingCertificate);
    const ski = Buffer.from(inspected.subjectKeyIdentifier!, "hex").toString("base64");
    const signer = {
      certificateFingerprintsSha256: [inspected.fingerprintSha256!],
      publicKeyHashesSha256: [inspected.publicKeySha256!],
      subjectKeyIdentifiers: [inspected.subjectKeyIdentifier!],
    };

    for (const identity of [
      { PublicKeyValues: [certificate.publicKey.export({ format: "jwk" })] },
      { X509SKIs: [ski] },
    ]) {
      const declared = inspectTs119602JsonPointerIdentity({ ServiceDigitalIdentities: [identity] });
      expect(declared.pointerIdentityDiagnostics).toEqual([]);
      expect(matchTs119602IdentityMaterial(declared.pointerIdentity, signer)).toMatchObject({ matched: true });
    }
  });

  it("rejects explicitly revoked pointer signers", async () => {
    const current = (await readFile("test/fixtures/ts119602-context-current.jws", "utf8")).trim();
    const parsed = parseCompactJades(current);
    const signingCertificate = (parsed.protectedHeader?.x5c as string[])[0];
    const fingerprint = inspectTs119602Certificate(signingCertificate).fingerprintSha256!;
    globalThis.fetch = vi.fn(async () => new Response(current, { status: 200, headers: { "content-type": "application/jose" } })) as typeof fetch;
    const result = await assessArtifactContent({
      content: current,
      contentType: "application/jose",
      strict: false,
      includeJsonLoteChecks: true,
      timeoutMs: 1_000,
      context: {
        dereference: true,
        maxDereferences: 8,
        maxBytesPerArtifact: 1_000_000,
        pointerSigners: [{
          location: "https://context.example.test/current.jws",
          trustAnchors: [signingCertificate],
          revocation: {
            status: "revoked",
            source: "test-status-evidence",
            checkedAt: "2026-07-21T00:00:00Z",
            nextUpdate: "2027-07-21T00:00:00Z",
            signerFingerprintSha256: fingerprint,
          },
        }],
      },
    });
    expect(find(result, "ts119602.scheme.pointers.authentication")).toMatchObject({ status: "fail" });
  });

  it("reports explicit bounds and unsupported pointer identity evidence without inventing success", async () => {
    const current = (await readFile("test/fixtures/ts119602-jades-compact.jws", "utf8")).trim();
    globalThis.fetch = vi.fn(async () => new Response(current, { status: 200, headers: { "content-type": "application/jose" } })) as typeof fetch;
    const result = await assessArtifactContent({
      content: current,
      contentType: "application/jose",
      strict: false,
      includeJsonLoteChecks: true,
      timeoutMs: 1_000,
      context: { dereference: true, maxDereferences: 1, maxBytesPerArtifact: 1_000_000 },
    });
    expect(find(result, "ts119602.scheme.pointers.authentication")).toMatchObject({ status: "inconclusive" });
    expect(find(result, "ts119602.context.bounds")).toMatchObject({ status: "inconclusive", evidence: expect.objectContaining({ omittedReferences: 1 }) });
  });

  it("fails contextual fetch evidence when the response exceeds the byte bound", async () => {
    const current = (await readFile("test/fixtures/ts119602-context-current.jws", "utf8")).trim();
    globalThis.fetch = vi.fn(async () => new Response(current, { status: 200, headers: { "content-type": "application/jose" } })) as typeof fetch;
    const result = await assessArtifactContent({
      content: current,
      contentType: "application/jose",
      strict: false,
      includeJsonLoteChecks: true,
      timeoutMs: 1_000,
      context: { dereference: true, maxDereferences: 8, maxBytesPerArtifact: 100 },
    });
    expect(find(result, "ts119602.scheme.pointers.authentication")).toMatchObject({ status: "fail" });
    expect(JSON.stringify(find(result, "ts119602.scheme.pointers.authentication")?.evidence)).toContain("byte limit");
  });

  it("keeps contextual findings identical across report JSON and Markdown rendering", async () => {
    const current = (await readFile("test/fixtures/ts119602-context-current.jws", "utf8")).trim();
    const prior = structuredClone(parseCompactJades(current).parsedPayload) as ContextPayload;
    prior.LoTE.ListAndSchemeInformation.LoTESequenceNumber = 1;
    prior.LoTE.ListAndSchemeInformation.ListIssueDateTime = "2026-01-01T00:00:00Z";
    globalThis.fetch = vi.fn(async () => new Response(current, { status: 200, headers: { "content-type": "application/jose" } })) as typeof fetch;
    const result = await runAuditFromJson({
      LoTE: {
        ListAndSchemeInformation: {
          PointersToOtherLoTE: [{ LoTELocation: "https://context.example.test/current.jws" }],
        },
      },
    }, {
      concurrency: 1,
      timeoutMs: 1_000,
      strict: false,
      includeJsonLoteChecks: true,
      fetch: true,
      context: { dereference: false, priorArtifacts: [{ content: JSON.stringify(prior), contentType: "application/json" }] },
    }, "test");
    expect(result.json.schemaVersion).toBe(6);
    expect(result.json.results[0].ts119602.checks).toContainEqual(expect.objectContaining({ id: "ts119602.scheme.sequence.history", status: "pass" }));
    expect(result.markdown).toContain("**ts119602.scheme.sequence.history**");
  });
});

function find(result: Awaited<ReturnType<typeof assessArtifactContent>>, id: string) {
  return result.ts119602.checks.find((entry) => entry.id === id);
}

interface ContextPayload {
  LoTE: {
    ListAndSchemeInformation: {
      LoTESequenceNumber: number;
      ListIssueDateTime: string;
    };
  };
}
