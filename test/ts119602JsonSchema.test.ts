import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateTs119602JsonSchema } from "../src/json/ts119602JsonSchema.js";

describe("official ETSI TS 119 602 JSON Schema validation", () => {
  it("validates the normative object/array fixture with pinned schema identity", async () => {
    const value: unknown = JSON.parse(await readFile("test/fixtures/json-lote.json", "utf8"));
    expect(validateTs119602JsonSchema(value)).toEqual({
      valid: true,
      schema: {
        standard: "ETSI TS 119 602",
        version: "1.1.1",
        draft: "http://json-schema.org/draft-07/schema#",
        sourcePath: "1960201_json_schema/1960201_json_schema.json",
        sourceRepository: "https://forge.etsi.org/rep/esi/x19_60201_lists_of_trusted_entities",
        sourceTag: "v1.1.1",
        sourceCommit: "e84f427f0cde99513b574ef4b5a155ac4a38eab6",
        sha256: "f16d60477359b936cefe0c74d5f1c598e3346daf84a6bad1846c712381ca36b4",
      },
      errors: [],
    });
  });

  it("reports type, format, cardinality, and additional-property diagnostics", () => {
    const result = validateTs119602JsonSchema({
      LoTE: {
        ListAndSchemeInformation: {
          LoTEVersionIdentifier: "1",
          LoTESequenceNumber: 1,
          SchemeOperatorName: [],
          ListIssueDateTime: "not-a-date",
          NextUpdate: "2026-02-01T00:00:00Z",
          Unexpected: true,
        },
        TrustedEntitiesList: [],
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        jsonPointer: "/LoTE/ListAndSchemeInformation/LoTEVersionIdentifier",
        keyword: "type",
        expected: { type: "integer" },
        observed: "1",
        observedType: "string",
      }),
      expect.objectContaining({
        jsonPointer: "/LoTE/ListAndSchemeInformation/SchemeOperatorName",
        keyword: "minItems",
        expected: { minimumItems: 1 },
        observed: [],
        observedType: "array",
      }),
      expect.objectContaining({
        jsonPointer: "/LoTE/ListAndSchemeInformation/ListIssueDateTime",
        keyword: "format",
        expected: { format: "date-time" },
        observed: "not-a-date",
      }),
      expect.objectContaining({
        jsonPointer: "/LoTE/ListAndSchemeInformation/Unexpected",
        keyword: "additionalProperties",
        expected: { additionalPropertyAllowed: false },
        observed: true,
      }),
      expect.objectContaining({
        jsonPointer: "/LoTE/TrustedEntitiesList",
        keyword: "minItems",
        observed: [],
      }),
    ]));
  });

  it("does not coerce primitive types or mutate additional properties", () => {
    const value = {
      LoTE: {
        ListAndSchemeInformation: {
          LoTEVersionIdentifier: "1",
          LoTESequenceNumber: 1,
          SchemeOperatorName: [{ lang: "en", value: "Operator" }],
          ListIssueDateTime: "2026-01-01T00:00:00Z",
          NextUpdate: "2026-02-01T00:00:00Z",
          Unexpected: "retained",
        },
      },
    };
    validateTs119602JsonSchema(value);
    expect(value.LoTE.ListAndSchemeInformation.LoTEVersionIdentifier).toBe("1");
    expect(value.LoTE.ListAndSchemeInformation.Unexpected).toBe("retained");
  });

  it("reports required fields in nested entity and service objects", () => {
    const result = validateTs119602JsonSchema({
      LoTE: {
        ListAndSchemeInformation: {
          LoTEVersionIdentifier: 1,
          LoTESequenceNumber: 1,
          SchemeOperatorName: [{ lang: "en", value: "Operator" }],
          ListIssueDateTime: "2026-01-01T00:00:00Z",
          NextUpdate: "2026-02-01T00:00:00Z",
        },
        TrustedEntitiesList: [{
          TrustedEntityInformation: {},
          TrustedEntityServices: [{ ServiceInformation: {} }],
        }],
      },
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        jsonPointer: "/LoTE/TrustedEntitiesList/0/TrustedEntityInformation/TEName",
        keyword: "required",
      }),
      expect.objectContaining({
        jsonPointer: "/LoTE/TrustedEntitiesList/0/TrustedEntityServices/0/ServiceInformation/ServiceName",
        keyword: "required",
      }),
      expect.objectContaining({
        jsonPointer: "/LoTE/TrustedEntitiesList/0/TrustedEntityServices/0/ServiceInformation/ServiceDigitalIdentity",
        keyword: "required",
      }),
    ]));
  });
});
