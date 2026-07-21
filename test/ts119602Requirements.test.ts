import { describe, expect, it } from "vitest";
import {
  filterTs119602Requirements,
  findTs119602Requirement,
  summarizeTs119602Requirements,
  TS119602_BINDINGS,
  TS119602_PROFILES,
  TS119602_REQUIREMENTS,
  TS119602_SOURCE,
} from "../src/standards/ts119602Requirements.js";

describe("ETSI TS 119 602 requirements ledger", () => {
  it("pins the authoritative standard identity and text-over-schema precedence", () => {
    expect(TS119602_SOURCE).toEqual(expect.objectContaining({
      document: "ETSI TS 119 602",
      version: "V1.1.1",
      publicationDate: "2025-11",
      url: expect.stringMatching(/^https:\/\/www\.etsi\.org\/deliver\//),
      schemaPrecedence: "document_text_prevails",
      schemaPrecedenceCitation: "Annex A.1 and Annex A.2.1",
    }));
  });

  it("reserves unique stable check IDs with citations and explicit applicability", () => {
    const checkIds = TS119602_REQUIREMENTS.map((entry) => entry.checkId);
    expect(TS119602_REQUIREMENTS).toHaveLength(81);
    expect(new Set(checkIds).size).toBe(checkIds.length);
    for (const entry of TS119602_REQUIREMENTS) {
      expect(entry.checkId).toMatch(/^ts119602\.[a-z0-9_.]+$/);
      expect(entry.citations.length).toBeGreaterThan(0);
      expect(entry.applicability.bindings.length).toBeGreaterThan(0);
      expect(entry.applicability.profiles.length).toBeGreaterThan(0);
      expect(entry.applicability.schemeModes.length).toBeGreaterThan(0);
      expect(["info", "warning", "error", "critical"]).toContain(entry.defaultSeverity);
      if (entry.implementation.status === "partial" || entry.implementation.status === "implemented") {
        expect(entry.implementation.existingCheckIds.length).toBeGreaterThan(0);
      }
    }
  });

  it("covers every Annex D-I profile with binding, scheme, entity, service, and signature families", () => {
    for (const profile of TS119602_PROFILES) {
      const entries = TS119602_REQUIREMENTS.filter((entry) => entry.checkId.startsWith(`ts119602.profile.${profile}.`));
      expect(entries.map((entry) => entry.checkId.split(".").at(-1))).toEqual([
        "binding",
        "scheme_information",
        "trusted_entity",
        "service",
        "signature",
      ]);
      expect(entries.every((entry) => entry.applicability.profiles.length === 1 && entry.applicability.profiles[0] === profile)).toBe(true);
    }
  });

  it("records JSON-only profiles separately from the Pub-EAA JSON/XML profile", () => {
    const pidBinding = findTs119602Requirement("ts119602.profile.pid_providers.binding");
    const pubEaaBinding = findTs119602Requirement("ts119602.profile.pub_eaa_providers.binding");
    expect(pidBinding?.applicability.bindings).toEqual(["scheme_explicit_json"]);
    expect(pubEaaBinding?.applicability.bindings).toEqual(TS119602_BINDINGS);
  });

  it("filters requirements by binding, profile, and contextual evidence scope", () => {
    const contextual = filterTs119602Requirements({
      binding: "scheme_explicit_json",
      profile: "wallet_providers",
      evidenceScope: "contextual",
    });
    expect(contextual.map((entry) => entry.checkId)).toEqual(expect.arrayContaining([
      "ts119602.scheme.sequence.history",
      "ts119602.scheme.pointers.authentication",
      "ts119602.scheme.distribution_consistency",
    ]));
    expect(contextual.every((entry) => entry.applicability.evidenceScope === "contextual")).toBe(true);
  });

  it("reports coverage without implying complete normative validation", () => {
    expect(summarizeTs119602Requirements()).toMatchObject({
      total: 81,
      implemented: 3,
      partial: 31,
      notImplemented: 47,
      complete: false,
    });
  });
});
