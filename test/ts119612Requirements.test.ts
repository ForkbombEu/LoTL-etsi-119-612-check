import { describe, expect, it } from "vitest";
import {
  filterTs119612Requirements,
  findTs119612Requirement,
  summarizeTs119612Requirements,
  TS119612_COMPATIBILITY_INPUTS,
  TS119612_REQUIREMENTS,
  TS119612_SOURCE,
} from "../src/standards/ts119612Requirements.js";

describe("ETSI TS 119 612 requirements ledger", () => {
  it("identifies the supported normative source and keeps the observed namespace variant separate", () => {
    expect(TS119612_SOURCE).toEqual({
      document: "ETSI TS 119 612",
      version: "V2.4.1",
      publicationDate: "2025-08",
      title: "Electronic Signatures and Trust Infrastructures (ESI); Trusted Lists",
      url: "https://www.etsi.org/deliver/etsi_TS/119600_119699/119612/02.04.01_60/ts_119612v020401p.pdf",
      canonicalNamespace: "http://uri.etsi.org/02231/v2#",
      tslVersionIdentifier: 6,
      normativeSections: ["4", "5", "6", "Annex B", "Annex C", "Annex D", "Annex E", "Annex G", "Annex J"],
      schemaPrecedence: "document_text_prevails",
      schemaPrecedenceCitation: "Annex C",
    });
    expect(TS119612_COMPATIBILITY_INPUTS).toEqual([expect.objectContaining({
      namespace: "http://uri.etsi.org/19612/v2.4.1#",
      normativeStatus: "not_established",
    })]);
  });

  it("keeps stable unique check IDs and citations for every family", () => {
    const ids = TS119612_REQUIREMENTS.map((entry) => entry.checkId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("ts119612."))).toBe(true);
    expect(TS119612_REQUIREMENTS.every((entry) => entry.citations.length > 0)).toBe(true);
    expect(TS119612_REQUIREMENTS.every((entry) => entry.applicability.artifactKinds.length > 0)).toBe(true);
  });

  it("looks up implemented evidence and filters applicability/context", () => {
    expect(findTs119612Requirement("ts119612.scheme.version")).toMatchObject({
      citations: [{ location: "5.3.1" }],
      implementation: {
        status: "implemented",
        existingCheckIds: ["structure.tsl_version_identifier", "structure.tsl_version_identifier.value"],
      },
    });
    expect(filterTs119612Requirements({ artifactKind: "ts119612_xml_lotl" }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ checkId: "ts119612.scheme.pointers.structure" })]));
    expect(filterTs119612Requirements({ artifactKind: "ts119612_xml_tsl" }))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ checkId: "ts119612.scheme.pointers.structure" })]));
    expect(filterTs119612Requirements({ evidenceScope: "contextual" }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ checkId: "ts119612.operations.availability" })]));
  });

  it("reports incomplete coverage without implying conformance", () => {
    expect(summarizeTs119612Requirements()).toMatchObject({
      total: 69,
      implemented: 1,
      partial: 30,
      notImplemented: 38,
      complete: false,
    });
  });
});
