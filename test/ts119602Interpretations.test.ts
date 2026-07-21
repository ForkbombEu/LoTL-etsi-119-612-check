import { describe, expect, it } from "vitest";
import {
  findTs119602Interpretation,
  TS119602_INTERPRETATIONS,
  TS119602_INTERPRETATION_REGISTRY_VERSION,
} from "../src/standards/ts119602Interpretations.js";

describe("ETSI TS 119 602 standards interpretation registry", () => {
  it("is versioned, uniquely identified, and evidence-backed", () => {
    expect(TS119602_INTERPRETATION_REGISTRY_VERSION).toBe("2026-07-21");
    expect(TS119602_INTERPRETATIONS).toHaveLength(9);
    expect(new Set(TS119602_INTERPRETATIONS.map((entry) => entry.id)).size).toBe(TS119602_INTERPRETATIONS.length);
    for (const entry of TS119602_INTERPRETATIONS) {
      expect(entry.sources.length).toBeGreaterThan(0);
      expect(entry.policy.length).toBeGreaterThan(20);
    }
  });

  it("records document-text precedence for metadata binding conflicts", () => {
    expect(findTs119602Interpretation("ts119602-v1.1.1-next-update-null")).toMatchObject({
      status: "document_text_prevails",
      policy: expect.stringContaining("Accept null JSON"),
    });
    expect(findTs119602Interpretation("ts119602-v1.1.1-table1-xml-cardinality")).toMatchObject({
      status: "document_text_prevails",
      policy: expect.stringContaining("Apply Table 1"),
    });
    expect(findTs119602Interpretation("ts119602-v1.1.1-implicit-container-binding")).toMatchObject({
      status: "document_text_prevails",
      policy: expect.stringContaining("direct core fields"),
    });
  });
});
