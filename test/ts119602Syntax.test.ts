import { describe, expect, it } from "vitest";
import {
  parseTs119602UtcDateTime,
  TS119602_COUNTRY_CODE_POLICY,
  validateTs119602CountryCode,
  validateTs119602LanguageTag,
  validateTs119602MultilingualValues,
  validateTs119602Uri,
  validateTs119602UtcDateTime,
} from "../src/standards/ts119602Syntax.js";

describe("ETSI TS 119 602 clause 6.1 syntax validators", () => {
  it.each([
    "https://example.test/path?key=value#fragment",
    "urn:example:trusted-entity",
    "mailto:audit@example.test",
    "tel:+39-06-1234567",
  ])("accepts RFC 3986 URI value %s", (value) => {
    expect(validateTs119602Uri(value)).toMatchObject({ outcome: "valid" });
  });

  it.each([
    ["relative/path", "uri.absolute"],
    ["https://", "uri.http_syntax"],
    ["https://example.test/a b", "uri.rfc3986_characters"],
    ["urn:example:%xx", "uri.percent_encoding"],
    ["mailto:not-an-address", "uri.mailto_address"],
    ["tel:call me", "uri.rfc3986_characters"],
  ])("rejects malformed URI %s", (value, code) => {
    expect(validateTs119602Uri(value)).toMatchObject({
      outcome: "invalid",
      diagnostics: [expect.objectContaining({ code })],
    });
  });

  it("requires the exact UTC date-time lexical form and a real calendar value", () => {
    expect(validateTs119602UtcDateTime("2024-02-29T23:59:59Z")).toMatchObject({ outcome: "valid" });
    expect(parseTs119602UtcDateTime("2024-02-29T23:59:59Z")?.toISOString()).toBe("2024-02-29T23:59:59.000Z");
    for (const value of [
      "2026-01-01T00:00Z",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T01:00:00+01:00",
      "2023-02-29T00:00:00Z",
      "2026-01-01T24:00:00Z",
    ]) {
      expect(validateTs119602UtcDateTime(value).outcome).toBe("invalid");
      expect(parseTs119602UtcDateTime(value)).toBeUndefined();
    }
  });

  it("validates lower-case RFC 5646 language tags", () => {
    for (const value of ["en", "en-gb", "zh-hant-tw", "de-ch-1901", "x-audit"]) {
      expect(validateTs119602LanguageTag(value)).toMatchObject({ outcome: "valid" });
    }
    expect(validateTs119602LanguageTag("en-GB")).toMatchObject({
      outcome: "invalid",
      diagnostics: [expect.objectContaining({ code: "language.lower_case" })],
    });
    expect(validateTs119602LanguageTag("en--gb")).toMatchObject({ outcome: "invalid" });
  });

  it("requires English and validates every multilingual entry", () => {
    expect(validateTs119602MultilingualValues([
      { language: "en", value: "Example" },
      { language: "it", value: "Esempio" },
    ])).toMatchObject({ outcome: "valid", languages: ["en", "it"] });

    const result = validateTs119602MultilingualValues([
      { language: "it-IT", value: "" },
      { language: "it-it", value: "Esempio" },
    ]);
    expect(result).toMatchObject({ outcome: "invalid" });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "language.lower_case",
      "multilingual.value_non_empty",
      "multilingual.english_required",
    ]));
  });

  it("rejects Annex B control, private-use, tag, BOM, and markup characters", () => {
    const result = validateTs119602MultilingualValues([
      { language: "en", value: "line one\nline two\uE000\u{E0001}\uFEFF<strong>markup</strong>" },
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "multilingual.control_character",
      "multilingual.private_use_character",
      "multilingual.tag_character",
      "multilingual.byte_order_mark",
      "multilingual.markup",
    ]));
  });

  it("pins country exceptions and preserves open grouping recognition as inconclusive", () => {
    expect(TS119602_COUNTRY_CODE_POLICY).toMatchObject({
      policyVersion: "2026-07-21",
      iso3166Alpha2CodeCount: 249,
      etsiExceptions: ["UK", "EL", "EU"],
      unlistedUpperCaseGroupingOutcome: "inconclusive",
    });
    expect(validateTs119602CountryCode("SE")).toMatchObject({ outcome: "valid", classification: "iso3166_alpha2" });
    expect(validateTs119602CountryCode("UK")).toMatchObject({ outcome: "valid", classification: "etsi_exception" });
    expect(validateTs119602CountryCode("EL")).toMatchObject({ outcome: "valid", classification: "etsi_exception" });
    expect(validateTs119602CountryCode("EU")).toMatchObject({ outcome: "valid", classification: "etsi_exception" });
    expect(validateTs119602CountryCode("ASEAN")).toMatchObject({ outcome: "valid", classification: "etsi_grouping_example" });
    expect(validateTs119602CountryCode("GB")).toMatchObject({
      outcome: "invalid",
      diagnostics: [expect.objectContaining({ code: "country.uk_exception" })],
    });
    expect(validateTs119602CountryCode("ZZ")).toMatchObject({
      outcome: "inconclusive",
      diagnostics: [expect.objectContaining({ code: "country.grouping_recognition" })],
    });
    expect(validateTs119602CountryCode("se")).toMatchObject({ outcome: "invalid" });
  });
});
