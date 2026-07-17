import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessJsonLote } from "../src/json/loteChecks.js";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(`test/fixtures/${name}`, "utf8"));
}

describe("assessJsonLote", () => {
  it("reports granular TS 119 602-style / JSON LoTE checks for a valid-ish artifact", async () => {
    const result = assessJsonLote(await fixture("json-lote.json"), true, new Date("2026-02-01T00:00:00Z"));
    expect(result.ts119612).toMatchObject({
      applicable: false,
      conformanceLevel: "not_applicable",
      mandatoryFailures: [],
    });
    expect(result.ts119612.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "profile.ts119612_applicability", status: "not_applicable" }),
        expect.objectContaining({ id: "json_lote.list_and_scheme_information", status: "pass" }),
        expect.objectContaining({ id: "json_lote.version_identifier", status: "pass" }),
        expect.objectContaining({ id: "json_lote.scheme_information_uri", status: "pass" }),
        expect.objectContaining({ id: "json_lote.pointers.service_digital_identities", status: "pass" }),
        expect.objectContaining({ id: "json_lote.signature_object_present", status: "pass" }),
        expect.objectContaining({ id: "json_lote.dates.next_after_issue", status: "pass" }),
      ]),
    );
    expect(result.extracted?.jsonLote).toMatchObject({
      assessmentProfile: "TS 119 602-style / JSON LoTE checks (not full normative conformance)",
      PointersToOtherLoTECount: 1,
      pointersWithServiceDigitalIdentities: 1,
      signatureObjectPresent: true,
    });
  });

  it("reports a missing ListAndSchemeInformation structure without a TS 119 612 failure", async () => {
    const result = assessJsonLote(await fixture("json-lote-missing-list-information.json"), true);
    expect(result.ts119612.conformanceLevel).toBe("not_applicable");
    expect(result.ts119612.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "json_lote.list_and_scheme_information", status: "warn" }),
        expect.objectContaining({ id: "json_lote.type", status: "warn" }),
      ]),
    );
  });

  it("reports a missing JSON signature object", async () => {
    const result = assessJsonLote(await fixture("json-lote-missing-signature.json"), true);
    expect(result.ts119612.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "json_lote.signature_object_present", status: "warn" }),
      ]),
    );
  });

  it("warns when NextUpdate is expired", async () => {
    const result = assessJsonLote(
      await fixture("json-lote-expired.json"),
      true,
      new Date("2026-02-01T00:00:00Z"),
    );
    expect(result.ts119612.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "json_lote.dates.issue_valid", status: "pass" }),
        expect.objectContaining({ id: "json_lote.dates.next_update_valid", status: "pass" }),
        expect.objectContaining({ id: "json_lote.dates.next_update_expired", status: "warn" }),
      ]),
    );
  });
});
