import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessJsonLote } from "../src/json/loteChecks.js";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(`test/fixtures/${name}`, "utf8"));
}

describe("assessJsonLote", () => {
  it("reports granular TS 119 602-style / JSON LoTE checks for a valid-ish artifact", async () => {
    const result = assessJsonLote(await fixture("json-lote.json"), true, new Date("2026-02-01T00:00:00Z"));
    expect(result.ts119602).toMatchObject({
      applicable: true,
      conformanceLevel: "unsupported",
    });
    expect(result.ts119602.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "json_lote.list_and_scheme_information", status: "pass" }),
        expect.objectContaining({ id: "json_lote.version_identifier", status: "pass" }),
        expect.objectContaining({ id: "json_lote.scheme_information_uri", status: "pass" }),
        expect.objectContaining({ id: "json_lote.pointers.service_digital_identities", status: "pass" }),
        expect.objectContaining({ id: "json_lote.signature.jades_baseline_b", status: "unsupported" }),
        expect.objectContaining({ id: "json_lote.dates.next_after_issue", status: "pass" }),
        expect.objectContaining({
          id: "ts119602.coverage.complete",
          status: "not_checked",
          evidence: expect.objectContaining({ total: 81, complete: false }),
        }),
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
    expect(result.ts119602.conformanceLevel).toBe("unsupported");
    expect(result.ts119602.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "json_lote.list_and_scheme_information", status: "warn" }),
        expect.objectContaining({ id: "json_lote.type", status: "warn" }),
      ]),
    );
  });

  it("reports a missing JSON signature object", async () => {
    const result = assessJsonLote(await fixture("json-lote-missing-signature.json"), true);
    expect(result.ts119602.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "json_lote.signature.jades_baseline_b",
          status: "unsupported",
          evidence: { legacySignatureObjectPresent: false },
        }),
      ]),
    );
  });

  it("warns when NextUpdate is expired", async () => {
    const result = assessJsonLote(
      await fixture("json-lote-expired.json"),
      true,
      new Date("2026-02-01T00:00:00Z"),
    );
    expect(result.ts119602.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "json_lote.dates.issue_valid", status: "pass" }),
        expect.objectContaining({ id: "json_lote.dates.next_update_valid", status: "pass" }),
        expect.objectContaining({ id: "json_lote.dates.next_update_expired", status: "warn" }),
      ]),
    );
  });

  it("runs local TS 119 602 evidence checks even when the legacy opt-in flag is false", async () => {
    const result = assessJsonLote(await fixture("json-lote.json"), false);
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "json_lote.root", status: "pass" }),
      expect.objectContaining({ id: "ts119602.coverage.complete", status: "not_checked" }),
    ]));
  });
});
