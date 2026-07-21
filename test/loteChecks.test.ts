import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessJsonLote } from "../src/json/loteChecks.js";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(`test/fixtures/${name}`, "utf8"));
}

describe("assessJsonLote", () => {
  it("validates and extracts the official TS 119 602 object/array binding", async () => {
    const result = assessJsonLote(await fixture("json-lote.json"), true, new Date("2026-02-01T00:00:00Z"));
    expect(result.ts119602).toMatchObject({
      applicable: true,
      conformanceLevel: "non_conformant",
    });
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "pass" }),
      expect.objectContaining({ id: "json_lote.compatibility.legacy_tsl_model", status: "not_applicable" }),
      expect.objectContaining({ id: "json_lote.list_and_scheme_information", status: "pass" }),
      expect.objectContaining({ id: "json_lote.version_identifier", status: "pass" }),
      expect.objectContaining({ id: "json_lote.scheme_information_uri", status: "pass" }),
      expect.objectContaining({ id: "json_lote.pointers.service_digital_identities", status: "pass" }),
      expect.objectContaining({ id: "json_lote.signature.jades_baseline_b", status: "fail" }),
      expect.objectContaining({ id: "json_lote.dates.next_after_issue", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.uri", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.date_time", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.language", status: "pass" }),
      expect.objectContaining({ id: "ts119602.syntax.country_code", status: "pass" }),
      expect.objectContaining({ id: "ts119602.language.annex_b", status: "not_checked" }),
      expect.objectContaining({ id: "ts119602.structure.lote_tag", status: "not_applicable" }),
      expect.objectContaining({
        id: "ts119602.structure.scheme_information_presence",
        status: "pass",
        evidence: expect.objectContaining({ mode: "explicit", violations: [] }),
      }),
      expect.objectContaining({ id: "ts119602.scheme.version", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.sequence.local", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.operator_address", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.name", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.policy_or_legal_notice", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.pointers.structure", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.distribution_points", status: "pass" }),
      expect.objectContaining({ id: "ts119602.entities.list", status: "pass" }),
      expect.objectContaining({ id: "ts119602.entities.structure", status: "pass" }),
      expect.objectContaining({ id: "ts119602.entity.information", status: "pass" }),
      expect.objectContaining({ id: "ts119602.entity.address", status: "pass" }),
      expect.objectContaining({ id: "ts119602.entity.information_uri", status: "pass" }),
      expect.objectContaining({ id: "ts119602.service.information", status: "pass" }),
      expect.objectContaining({ id: "ts119602.service.digital_identity", status: "pass" }),
      expect.objectContaining({ id: "ts119602.service.history", status: "not_applicable" }),
      expect.objectContaining({
        id: "ts119602.coverage.complete",
        status: "not_checked",
        evidence: expect.objectContaining({ total: 81, complete: false }),
      }),
    ]));
    expect(result.extracted?.jsonLote).toMatchObject({
      assessmentProfile: "ETSI TS 119 602 V1.1.1 JSON binding with offline schema validation (incomplete semantic/profile coverage)",
      jsonBindingModel: "official_ts119602",
      schemaValid: true,
      LoTEVersionIdentifier: 1,
      TrustedEntitiesListCount: 1,
      TrustedEntityServicesCount: 1,
      PointersToOtherLoTECount: 1,
      pointersWithServiceDigitalIdentities: 1,
      signatureObjectPresent: false,
    });
  });

  it("accepts the Table 1 implicit scheme-information field set", async () => {
    const result = assessJsonLote(
      await fixture("ts119602-implicit.json"),
      true,
      new Date("2026-07-21T00:00:00Z"),
    );
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "pass" }),
      expect.objectContaining({
        id: "ts119602.structure.scheme_information_presence",
        status: "pass",
        evidence: expect.objectContaining({
          mode: "implicit",
          explicitSignalFields: [],
          violations: [],
        }),
      }),
      expect.objectContaining({ id: "ts119602.scheme.name", status: "not_applicable" }),
      expect.objectContaining({ id: "ts119602.scheme.operator_address", status: "not_applicable" }),
      expect.objectContaining({ id: "ts119602.scheme.next_update", status: "pass" }),
    ]));
  });

  it("keeps the closed-LoTE semantic rule separate from the published JSON schema conflict", async () => {
    const result = assessJsonLote(
      await fixture("ts119602-closed.json"),
      true,
      new Date("2026-07-21T00:00:00Z"),
    );
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "fail" }),
      expect.objectContaining({ id: "ts119602.syntax.date_time", status: "pass" }),
      expect.objectContaining({
        id: "ts119602.scheme.next_update",
        status: "pass",
        evidence: expect.objectContaining({
          closed: true,
          interpretationId: "ts119602-v1.1.1-next-update-null",
        }),
      }),
    ]));
  });

  it("rejects an unregistered critical scheme extension", async () => {
    const result = assessJsonLote(
      await fixture("ts119602-critical-extension.json"),
      true,
      new Date("2026-07-21T00:00:00Z"),
    );
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "pass" }),
      expect.objectContaining({
        id: "ts119602.scheme.extensions",
        status: "fail",
        severity: "critical",
        evidence: expect.objectContaining({
          registry: expect.objectContaining({ unknownCriticalPolicy: "reject" }),
        }),
      }),
    ]));
  });

  it("reports clause 6.1 failures separately from permissive binding formats", async () => {
    const result = assessJsonLote(await fixture("ts119602-clause61-invalid.json"), true);
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "ts119602.syntax.uri",
        status: "fail",
        evidence: expect.objectContaining({
          results: expect.arrayContaining([
            expect.objectContaining({
              path: "/LoTE/ListAndSchemeInformation/LoTEType",
              validation: expect.objectContaining({
                diagnostics: [expect.objectContaining({ code: "uri.absolute" })],
              }),
            }),
          ]),
        }),
      }),
      expect.objectContaining({ id: "ts119602.syntax.date_time", status: "fail" }),
      expect.objectContaining({ id: "ts119602.syntax.language", status: "fail" }),
      expect.objectContaining({ id: "ts119602.syntax.country_code", status: "fail" }),
      expect.objectContaining({ id: "json_lote.dates.issue_valid", status: "fail" }),
      expect.objectContaining({ id: "json_lote.dates.next_update_valid", status: "fail" }),
    ]));
  });

  it("catches schema-permitted empty identities and missing status required by retained history", async () => {
    const result = assessJsonLote(
      await fixture("ts119602-entities-invalid.json"),
      true,
      new Date("2026-07-21T00:00:00Z"),
    );
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "pass" }),
      expect.objectContaining({ id: "ts119602.service.digital_identity", status: "fail", severity: "critical" }),
      expect.objectContaining({ id: "ts119602.service.status", status: "fail" }),
    ]));
  });

  it("reports actionable schema errors for missing list information", async () => {
    const result = assessJsonLote(await fixture("json-lote-missing-list-information.json"), true);
    expect(result.ts119602.conformanceLevel).toBe("non_conformant");
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "ts119602.binding.json_schema",
        status: "fail",
        evidence: expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({
              jsonPointer: "/LoTE/ListAndSchemeInformation",
              keyword: "required",
              observed: null,
              observedType: "missing",
            }),
          ]),
        }),
      }),
      expect.objectContaining({ id: "json_lote.list_and_scheme_information", status: "fail" }),
    ]));
  });

  it("isolates legacy WE BUILD/TSL-like JSON behind a failing compatibility adapter", async () => {
    const result = assessJsonLote(await fixture("json-lote-legacy.json"), true);
    expect(result.ts119602.conformanceLevel).toBe("non_conformant");
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "fail" }),
      expect.objectContaining({
        id: "json_lote.compatibility.legacy_tsl_model",
        status: "fail",
        evidence: expect.objectContaining({
          observedPath: "/LoTE/TrustedEntitiesList/TrustServiceProvider",
          normativePath: "/LoTE/TrustedEntitiesList[]",
        }),
      }),
    ]));
    expect(result.extracted?.jsonLote).toMatchObject({
      jsonBindingModel: "legacy_we_build_tsl_like",
      schemaValid: false,
      TrustedEntitiesListCount: 1,
      signatureObjectPresent: true,
    });
  });

  it("fails unsigned JSON without treating a signature object as JAdES evidence", async () => {
    const result = assessJsonLote(await fixture("json-lote-missing-signature.json"), true);
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "pass" }),
      expect.objectContaining({
        id: "json_lote.signature.jades_baseline_b",
        status: "fail",
      }),
      expect.objectContaining({ id: "json_lote.signature.jades_compact_serialization", status: "fail" }),
      expect.objectContaining({ id: "json_lote.signature.jades_cryptographic_verification_result", status: "not_checked" }),
    ]));
  });

  it("warns when NextUpdate is expired", async () => {
    const result = assessJsonLote(
      await fixture("json-lote-expired.json"),
      true,
      new Date("2026-02-01T00:00:00Z"),
    );
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "pass" }),
      expect.objectContaining({ id: "json_lote.dates.issue_valid", status: "pass" }),
      expect.objectContaining({ id: "json_lote.dates.next_update_valid", status: "pass" }),
      expect.objectContaining({ id: "json_lote.dates.next_update_expired", status: "fail" }),
      expect.objectContaining({ id: "ts119602.scheme.next_update", status: "fail" }),
    ]));
  });

  it("runs local TS 119 602 checks even when the legacy opt-in flag is false", async () => {
    const result = assessJsonLote(await fixture("json-lote.json"), false);
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "pass" }),
      expect.objectContaining({ id: "json_lote.root", status: "pass" }),
      expect.objectContaining({ id: "ts119602.coverage.complete", status: "not_checked" }),
    ]));
  });
});
