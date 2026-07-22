import { createHash, X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessArtifactContent, runAuditFromJson } from "../src/audit.js";
import { parseCompactJades } from "../src/json/jades.js";
import { inspectTs119602JsonPointerIdentity } from "../src/standards/ts119602Context.js";
import { inspectTs119602Certificate, matchTs119602IdentityMaterial } from "../src/standards/ts119602Identity.js";
import type { Ts119602ResourceAssertion } from "../src/types.js";

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

  it("binds reviewed scheme pages and authoritative records to the assessed claims", async () => {
    const current = (await readFile("test/fixtures/ts119602-context-current.jws", "utf8")).trim();
    const pages = new Map([
      ["https://operator.example.test/wallet-providers", "reviewed scheme information"],
      ["http://uri.etsi.org/19602/WalletProvidersList/schemerules/EU", "reviewed scheme rules"],
      ["https://operator.example.test/policy", "reviewed legal policy"],
    ]);
    const parsed = parseCompactJades(current);
    const prior = structuredClone(parsed.parsedPayload) as ContextPayload;
    prior.LoTE.ListAndSchemeInformation.LoTESequenceNumber = 1;
    prior.LoTE.ListAndSchemeInformation.ListIssueDateTime = "2026-01-01T00:00:00Z";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (pages.has(url)) return new Response(pages.get(url), { status: 200, headers: { "content-type": "text/html" } });
      if (url.endsWith("/current.jws")) return new Response(current, { status: 200, headers: { "content-type": "application/jose" } });
      if (url.endsWith("/archive")) return Response.json(prior);
      if (url.endsWith("/register")) return Response.json({ registrations: [] });
      return new Response("missing", { status: 404 });
    }) as typeof fetch;
    const reviewedAt = "2026-07-21T00:00:00Z";
    const result = await assessArtifactContent({
      content: current,
      contentType: "application/jose",
      strict: false,
      includeJsonLoteChecks: true,
      timeoutMs: 1_000,
      context: {
        dereference: true,
        maxDereferences: 16,
        ts119602: {
          resources: [
            resourceEvidence("https://operator.example.test/wallet-providers", pages, ["scheme_scope_and_context", "approval_scheme", "operator_approval_process", "entity_approval_process", "approval_criteria", "assessor_selection_and_rules", "separate_body_responsibilities_and_liabilities", "scheme_contact_information"], reviewedAt),
            resourceEvidence("http://uri.etsi.org/19602/WalletProvidersList/schemerules/EU", pages, ["scheme_policy_and_rules", "list_usage_and_interpretation"], reviewedAt),
            resourceEvidence("https://operator.example.test/policy", pages, ["policy_or_legal_notice"], reviewedAt),
          ],
          authoritative: {
            schemeOperator: {
              source: "authoritative-register", checkedAt: reviewedAt, names: ["JSON-Operator"],
              postalAddresses: [{ streetAddress: "1 Commission Street", country: "EU" }],
              electronicAddresses: ["mailto:operator@example.test", "https://operator.example.test"],
            },
            entities: [{
              entityPath: "/LoTE/TrustedEntitiesList/0", source: "authoritative-register", checkedAt: reviewedAt,
              names: ["JSON-Operator"], registrationIdentifiers: ["VATDE-123456789"],
              postalAddresses: [{ streetAddress: "2 Wallet Street", country: "DE" }],
              electronicAddresses: ["mailto:wallet@example.test", "tel:+4930123456", "https://wallet.example.test"],
            }],
          },
        },
      },
    });
    expect(find(result, "ts119602.context.scheme_resources")).toMatchObject({ status: "pass" });
    expect(find(result, "ts119602.context.authoritative_identity")).toMatchObject({ status: "pass" });
  });

  it("traverses bounded same-origin archive indexes to establish complete previous-instance coverage", async () => {
    const current = (await readFile("test/fixtures/ts119602-context-current.jws", "utf8")).trim();
    const prior = structuredClone(parseCompactJades(current).parsedPayload) as ContextPayload;
    prior.LoTE.ListAndSchemeInformation.LoTESequenceNumber = 1;
    prior.LoTE.ListAndSchemeInformation.ListIssueDateTime = "2026-01-01T00:00:00Z";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/current.jws")) return new Response(current, { status: 200, headers: { "content-type": "application/jose" } });
      if (url.endsWith("/archive")) return new Response('<html><a href="/previous.json">previous</a></html>', { status: 200, headers: { "content-type": "text/html" } });
      if (url.endsWith("/previous.json")) return Response.json(prior);
      if (url.endsWith("/register")) return Response.json({ registrations: [] });
      return new Response("missing", { status: 404 });
    }) as typeof fetch;
    const result = await assessArtifactContent({
      content: current, contentType: "application/jose", strict: false, includeJsonLoteChecks: true, timeoutMs: 1_000,
      context: { dereference: true, maxDereferences: 8, maxTraversalDepth: 2 },
    });
    expect(find(result, "ts119602.context.archive")).toMatchObject({
      status: "pass",
      evidence: expect.objectContaining({ foundSequences: [1], completeSequence: true }),
    });
  });

  it("authenticates Annex I register data with its declaring service certificate", async () => {
    const signedRegister = (await readFile("test/fixtures/ts119602-context-current.jws", "utf8")).trim();
    const signingCertificate = (parseCompactJades(signedRegister).protectedHeader?.x5c as string[])[0];
    const lote = registrarList(signingCertificate);
    globalThis.fetch = vi.fn(async () => new Response(signedRegister, { status: 200, headers: { "content-type": "application/jose" } })) as typeof fetch;
    const result = await assessArtifactContent({
      content: JSON.stringify(lote), contentType: "application/json", strict: false, includeJsonLoteChecks: true, timeoutMs: 1_000,
      context: { dereference: true, maxDereferences: 4 },
    });
    expect(find(result, "ts119602.context.register_authentication")).toMatchObject({ status: "pass" });

    const mismatch = registrarList("AA==");
    const negative = await assessArtifactContent({
      content: JSON.stringify(mismatch), contentType: "application/json", strict: false, includeJsonLoteChecks: true, timeoutMs: 1_000,
      context: { dereference: true, maxDereferences: 4 },
    });
    expect(find(negative, "ts119602.context.register_authentication")).toMatchObject({ status: "fail" });
  });

  it("checks never-remove service history and final closed-list status semantics", async () => {
    const currentJws = (await readFile("test/fixtures/ts119602-context-current.jws", "utf8")).trim();
    const certificate = (parseCompactJades(currentJws).protectedHeader?.x5c as string[])[0];
    const inspected = inspectTs119602Certificate(certificate);
    const ski = Buffer.from(inspected.subjectKeyIdentifier!, "hex").toString("base64");
    const prior = pubEaaHistoryList(certificate, ski, 1, false);
    const current = pubEaaHistoryList(certificate, ski, 2, true);
    const result = await assessArtifactContent({
      content: JSON.stringify(current), contentType: "application/json", strict: false, includeJsonLoteChecks: true, timeoutMs: 1_000,
      context: { priorArtifacts: [{ content: JSON.stringify(prior), contentType: "application/json" }] },
    });
    expect(find(result, "ts119602.scheme.sequence.history")).toMatchObject({ status: "pass" });
    expect(find(result, "ts119602.service.history_retention")).toMatchObject({ status: "pass" });

    const missingHistory = pubEaaHistoryList(certificate, ski, 2, false);
    const negative = await assessArtifactContent({
      content: JSON.stringify(missingHistory), contentType: "application/json", strict: false, includeJsonLoteChecks: true, timeoutMs: 1_000,
      context: { priorArtifacts: [{ content: JSON.stringify(prior), contentType: "application/json" }] },
    });
    expect(find(negative, "ts119602.service.history_retention")).toMatchObject({ status: "fail" });

    const closed = pubEaaHistoryList(certificate, ski, 2, true);
    (closed.LoTE.ListAndSchemeInformation as { NextUpdate: string | null }).NextUpdate = null;
    closed.LoTE.TrustedEntitiesList[0].TrustedEntityServices[0].ServiceInformation.ServiceStatus = "urn:example:status:expired";
    const closedResult = await assessArtifactContent({
      content: JSON.stringify(closed), contentType: "application/json", strict: false, includeJsonLoteChecks: true, timeoutMs: 1_000,
      context: { ts119602: { expiredServiceStatusUris: ["urn:example:status:expired"] } },
    });
    expect(find(closedResult, "ts119602.scheme.final_closed_list")).toMatchObject({ status: "pass" });
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

function resourceEvidence(location: string, pages: Map<string, string>, assertions: Ts119602ResourceAssertion[], checkedAt: string) {
  return {
    location,
    sha256: createHash("sha256").update(pages.get(location)!).digest("hex"),
    assertions,
    source: "manual-review-record",
    checkedAt,
  };
}

function registrarList(certificate: string) {
  return {
    LoTE: {
      ListAndSchemeInformation: {
        LoTEVersionIdentifier: 1,
        LoTESequenceNumber: 1,
        LoTEType: "http://uri.etsi.org/19602/LoTEType/EURegistrarsAndRegistersList",
        SchemeOperatorName: [{ lang: "en", value: "Registrar Operator" }],
        ListIssueDateTime: "2026-07-01T00:00:00Z",
        NextUpdate: "2026-12-31T00:00:00Z",
      },
      TrustedEntitiesList: [{
        TrustedEntityInformation: { TEName: [{ lang: "en", value: "Registrar Operator" }] },
        TrustedEntityServices: [{ ServiceInformation: {
          ServiceTypeIdentifier: "http://uri.etsi.org/19602/SvcType/Register",
          ServiceName: [{ lang: "en", value: "Register" }],
          ServiceDigitalIdentity: { X509Certificates: [{ val: certificate }] },
          ServiceSupplyPoints: [{ uriValue: "https://register.example.test/data.jws" }],
        } }],
      }],
    },
  };
}

function pubEaaHistoryList(certificate: string, ski: string, sequence: number, includeHistory: boolean) {
  return {
    LoTE: {
      ListAndSchemeInformation: {
        LoTEVersionIdentifier: 1,
        LoTESequenceNumber: sequence,
        LoTEType: "http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList",
        SchemeOperatorName: [{ lang: "en", value: "Pub-EAA Operator" }],
        HistoricalInformationPeriod: 65535,
        ListIssueDateTime: sequence === 1 ? "2026-01-01T00:00:00Z" : "2026-02-01T00:00:00Z",
        NextUpdate: "2026-07-01T00:00:00Z",
      },
      TrustedEntitiesList: [{
        TrustedEntityInformation: { TEName: [{ lang: "en", value: "Public Body" }] },
        TrustedEntityServices: [{
          ServiceInformation: {
            ServiceTypeIdentifier: "http://uri.etsi.org/19602/SvcType/PubEAA/Issuance",
            ServiceName: [{ lang: "en", value: "Public EAA issuance" }],
            ServiceDigitalIdentity: { X509Certificates: [{ val: certificate }] },
            ServiceStatus: sequence === 1 ? "http://uri.etsi.org/19602/PubEAAProvidersList/SvcStatus/notified" : "http://uri.etsi.org/19602/PubEAAProvidersList/SvcStatus/withdrawn",
            StatusStartingTime: sequence === 1 ? "2026-01-01T00:00:00Z" : "2026-02-01T00:00:00Z",
          },
          ...(includeHistory ? { ServiceHistory: [{
            ServiceName: [{ lang: "en", value: "Public EAA issuance" }],
            ServiceDigitalIdentity: { X509SKIs: [ski] },
            ServiceStatus: "http://uri.etsi.org/19602/PubEAAProvidersList/SvcStatus/notified",
            StatusStartingTime: "2026-01-01T00:00:00Z",
          }] } : {}),
        }],
      }],
    },
  };
}
