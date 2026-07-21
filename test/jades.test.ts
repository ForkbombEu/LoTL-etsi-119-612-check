import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessArtifactContent } from "../src/audit.js";
import { assessCompactJades, parseCompactJades } from "../src/json/jades.js";

const TRUSTED_FINGERPRINT = "7cbb81e9f14b9cc97074f841bfb8b467883c021cff66dfab14e0aeedd93afb5e";

async function compactFixture(): Promise<string> {
  return (await readFile("test/fixtures/ts119602-jades-compact.jws", "utf8")).trim();
}

describe("compact JAdES Baseline B", () => {
  it("recovers and verifies the exact signed JSON payload with signer evidence and explicit trust", async () => {
    const compact = await compactFixture();
    const parsed = parseCompactJades(compact);
    expect(parsed).toMatchObject({
      serializationValid: true,
      detachedPayload: false,
      protectedHeader: expect.objectContaining({ alg: "RS256", iat: expect.any(Number), x5c: [expect.any(String)] }),
      parsedPayload: expect.objectContaining({ LoTE: expect.any(Object) }),
    });

    const result = assessCompactJades(compact, parsed.parsedPayload, {
      assessmentDate: new Date("2026-07-22T00:00:00Z"),
      schemeTerritory: "EU",
      schemeOperatorNames: ["JSON-Operator"],
      trustedSignerFingerprintsSha256: [TRUSTED_FINGERPRINT],
    });
    for (const id of [
      "json_lote.signature.jades_compact_serialization",
      "json_lote.signature.jades_protected_header",
      "json_lote.signature.jades_baseline_b",
      "json_lote.signature.jades_critical_headers",
      "json_lote.signature.jades_signing_time",
      "json_lote.signature.jades_payload_recovered",
      "json_lote.signature.jades_payload_match",
      "json_lote.signature.jades_signing_certificate_present",
      "json_lote.signature.jades_signing_certificate_parsed",
      "json_lote.signature.jades_signing_certificate_reference",
      "json_lote.signature.jades_algorithm",
      "json_lote.signature.jades_cryptographic_verification_attempted",
      "json_lote.signature.jades_cryptographic_verification_result",
      "json_lote.signature.jades_signing_certificate_validity",
      "json_lote.signature.jades_signer_subject.country",
      "json_lote.signature.jades_signer_subject.organization",
      "json_lote.signature.jades_signer_trust",
    ]) {
      expect(result.checks).toContainEqual(expect.objectContaining({ id, status: "pass" }));
    }
    expect(result.certificates[0]).toMatchObject({
      source: "json_signature",
      subject: expect.stringContaining("O=JSON-Operator"),
      fingerprintSha256: TRUSTED_FINGERPRINT,
      validAtAssessmentTime: true,
    });
  });

  it("separates payload mismatch and cryptographic failure from certificate and trust evidence", async () => {
    const compact = await compactFixture();
    const parsed = parseCompactJades(compact);
    const [headerSegment, payloadSegment, signatureSegment] = compact.split(".");
    const corruptedSignature = `${signatureSegment.startsWith("A") ? "B" : "A"}${signatureSegment.slice(1)}`;
    const corrupted = `${headerSegment}.${payloadSegment}.${corruptedSignature}`;
    const result = assessCompactJades(corrupted, { LoTE: { different: true } }, {
      assessmentDate: new Date("2026-07-22T00:00:00Z"),
      schemeTerritory: "DE",
      schemeOperatorNames: ["Different Operator"],
      trustedSignerFingerprintsSha256: ["00".repeat(32)],
    });

    for (const id of [
      "json_lote.signature.jades_payload_match",
      "json_lote.signature.jades_cryptographic_verification_result",
      "json_lote.signature.jades_signer_subject.country",
      "json_lote.signature.jades_signer_subject.organization",
      "json_lote.signature.jades_signer_trust",
    ]) {
      expect(result.checks).toContainEqual(expect.objectContaining({ id, status: "fail" }));
    }
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: "json_lote.signature.jades_signing_certificate_validity",
      status: "pass",
    }));
    expect(parsed.parsedPayload).toBeDefined();
  });

  it("reports an unsupported algorithm as unsupported without attempting verification", async () => {
    const compact = await compactFixture();
    const [headerSegment, payloadSegment, signatureSegment] = compact.split(".");
    const header = JSON.parse(Buffer.from(headerSegment, "base64url").toString("utf8")) as Record<string, unknown>;
    header.alg = "HS256";
    const unsupported = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${payloadSegment}.${signatureSegment}`;
    const parsed = parseCompactJades(unsupported);
    const result = assessCompactJades(unsupported, parsed.parsedPayload, {
      assessmentDate: new Date("2026-07-22T00:00:00Z"),
      schemeTerritory: "EU",
      schemeOperatorNames: ["JSON-Operator"],
    });

    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "json_lote.signature.jades_baseline_b", status: "pass" }),
      expect.objectContaining({ id: "json_lote.signature.jades_algorithm", status: "unsupported" }),
      expect.objectContaining({ id: "json_lote.signature.jades_cryptographic_verification_attempted", status: "not_checked" }),
      expect.objectContaining({ id: "json_lote.signature.jades_cryptographic_verification_result", status: "unsupported" }),
      expect.objectContaining({ id: "json_lote.signature.jades_signer_trust", status: "not_checked" }),
    ]));
  });

  it("rejects prohibited, missing, and malformed protected Baseline B properties", async () => {
    const compact = await compactFixture();
    const [headerSegment, payloadSegment, signatureSegment] = compact.split(".");
    const header = JSON.parse(Buffer.from(headerSegment, "base64url").toString("utf8")) as Record<string, unknown>;
    delete header.iat;
    header.sigT = "2026-07-21T13:15:00Z";
    header.x5t = "prohibited-sha1-reference";
    header["x5t#o"] = { digAlg: "sha-256", digVal: "not_base64url!" };
    header.crit = ["missing-property"];
    const malformed = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${payloadSegment}.${signatureSegment}`;
    const parsed = parseCompactJades(malformed);
    const result = assessCompactJades(malformed, parsed.parsedPayload);

    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "json_lote.signature.jades_baseline_b", status: "fail" }),
      expect.objectContaining({ id: "json_lote.signature.jades_critical_headers", status: "fail" }),
      expect.objectContaining({ id: "json_lote.signature.jades_signing_time", status: "fail" }),
    ]));
  });

  it("routes a compact JAdES artifact through JSON LoTE assessment", async () => {
    const compact = await compactFixture();
    const result = await assessArtifactContent({
      content: compact,
      contentType: "application/jose",
      strict: false,
      includeJsonLoteChecks: true,
    });

    expect(result.detected).toEqual({ format: "jws", artifactKind: "json_lote" });
    expect(result.ts119602Classification).toMatchObject({
      binding: "scheme_explicit_json",
      profile: "pub_eaa_providers",
      profileStatus: "selected",
    });
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "pass" }),
      expect.objectContaining({ id: "json_lote.signature.jades_payload_match", status: "pass" }),
      expect.objectContaining({ id: "json_lote.signature.jades_cryptographic_verification_result", status: "pass" }),
      expect.objectContaining({ id: "json_lote.signature.jades_signer_subject.country", status: "pass" }),
      expect.objectContaining({ id: "json_lote.signature.jades_signer_subject.organization", status: "pass" }),
      expect.objectContaining({ id: "json_lote.signature.jades_signer_trust", status: "not_checked" }),
    ]));
    expect(result.extracted?.certificates).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "json_signature", fingerprintSha256: TRUSTED_FINGERPRINT }),
    ]));
  });
});
