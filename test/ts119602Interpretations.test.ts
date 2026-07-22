import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  findTs119602Interpretation,
  TS119602_INTERPRETATIONS,
  TS119602_INTERPRETATION_REGISTRY_VERSION,
} from "../src/standards/ts119602Interpretations.js";

describe("ETSI TS 119 602 standards interpretation registry", () => {
  it("is versioned, uniquely identified, and evidence-backed", () => {
    expect(TS119602_INTERPRETATION_REGISTRY_VERSION).toBe("2026-07-22");
    expect(TS119602_INTERPRETATIONS).toHaveLength(12);
    expect(new Set(TS119602_INTERPRETATIONS.map((entry) => entry.id)).size).toBe(TS119602_INTERPRETATIONS.length);
    for (const entry of TS119602_INTERPRETATIONS) {
      expect(entry.sources.length).toBeGreaterThan(0);
      expect(entry.policy.length).toBeGreaterThan(20);
    }
  });

  it("matches the complete versioned regression fixture", async () => {
    const expected: unknown = JSON.parse(await readFile("test/fixtures/ts119602-interpretations-v1.1.1.json", "utf8"));
    expect({
      registryVersion: TS119602_INTERPRETATION_REGISTRY_VERSION,
      interpretations: TS119602_INTERPRETATIONS.map(({ id, status, sources }) => ({ id, status, sources })),
    }).toEqual(expected);
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
    expect(findTs119602Interpretation("ts119602-v1.1.1-alternative-binding-version")).toMatchObject({
      status: "unresolved",
      policy: expect.stringContaining("do not normalize 6 to 1"),
    });
    expect(findTs119602Interpretation("ts119602-v1.1.1-alternative-binding-tag")).toMatchObject({
      status: "unresolved",
      policy: expect.stringContaining("do not silently treat"),
    });
    expect(findTs119602Interpretation("ts119602-v1.1.1-xml-extension-base-import")).toMatchObject({
      status: "unresolved",
      policy: expect.stringContaining("composition schema"),
    });
  });
});
