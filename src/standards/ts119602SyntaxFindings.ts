import type { CheckResult } from "../types.js";
import {
  TS119602_COUNTRY_CODE_POLICY,
  validateTs119602CountryCode,
  validateTs119602MultilingualValues,
  validateTs119602Transliteration,
  validateTs119602Uri,
  validateTs119602UtcDateTime,
  type Ts119602MultilingualValue,
  type Ts119602SyntaxOutcome,
  type Ts119602SyntaxValidation,
} from "./ts119602Syntax.js";

export interface LocatedSyntaxValue {
  path: string;
  value: unknown;
}

export interface LocatedMultilingualSet {
  path: string;
  values: Ts119602MultilingualValue[];
}

export interface Ts119602SyntaxInputs {
  uris: LocatedSyntaxValue[];
  dateTimes: LocatedSyntaxValue[];
  countries: LocatedSyntaxValue[];
  multilingual: LocatedMultilingualSet[];
}

export function buildTs119602SyntaxFindings(inputs: Ts119602SyntaxInputs): CheckResult[] {
  const uri = aggregateFinding(
    "ts119602.syntax.uri",
    "structure",
    "RFC 3986 URI syntax",
    inputs.uris,
    validateTs119602Uri,
  );
  const dateTime = aggregateFinding(
    "ts119602.syntax.date_time",
    "dates",
    "strict UTC date-time lexical form",
    inputs.dateTimes,
    validateTs119602UtcDateTime,
  );
  const country = aggregateFinding(
    "ts119602.syntax.country_code",
    "structure",
    "country and grouping code syntax",
    inputs.countries,
    validateTs119602CountryCode,
  );
  const multilingualResults = inputs.multilingual.map((entry) => ({
    path: entry.path,
    value: entry.values,
    validation: validateTs119602MultilingualValues(entry.values),
  }));
  const language = findingFromResults(
    "ts119602.syntax.language",
    "structure",
    "local multilingual structure and language tags",
    multilingualResults,
  );
  const transliterationResults = inputs.multilingual.map((entry) => ({
    path: entry.path,
    value: entry.values,
    validation: validateTs119602Transliteration(entry.values),
  }));
  const transliteration = findingFromResults(
    "ts119602.language.transliteration",
    "structure",
    "Annex B native-term transliteration",
    transliterationResults,
  );
  const annexB: CheckResult = {
    id: "ts119602.language.annex_b",
    category: "structure",
    status: "not_checked",
    severity: "warning",
    message: "Local language tags, English coverage, character restrictions, and native-term transliteration were checked; dereferenced pointer content and parser interoperability remain not checked.",
    evidence: {
      localMultilingualSetCount: inputs.multilingual.length,
      checked: ["language_tag", "english_entry", "non_empty_value", "control_characters", "private_use_characters", "unicode_tag_characters", "byte_order_mark", "plain_text_markup", "native_term_transliteration"],
      transliterationStatus: transliteration.status,
      notChecked: ["source_byte_encoding", "combining_character_recommendation", "dereferenced_pointer_content", "parser_interoperability"],
      citation: "ETSI TS 119 602 V1.1.1 Annex B",
    },
  };
  return [uri, dateTime, language, country, transliteration, annexB];
}

function aggregateFinding(
  id: string,
  category: CheckResult["category"],
  label: string,
  values: LocatedSyntaxValue[],
  validate: (value: unknown) => Ts119602SyntaxValidation,
): CheckResult {
  return findingFromResults(
    id,
    category,
    label,
    values.map((entry) => ({ ...entry, validation: validate(entry.value) })),
  );
}

function findingFromResults(
  id: string,
  category: CheckResult["category"],
  label: string,
  results: Array<{ path: string; value: unknown; validation: Ts119602SyntaxValidation }>,
): CheckResult {
  if (results.length === 0) {
    return {
      id,
      category,
      status: "not_applicable",
      severity: "info",
      message: `No ${label} values were present in the selected binding.`,
      evidence: { checkedCount: 0, results: [] },
    };
  }
  const outcome = aggregateOutcome(results.map((result) => result.validation.outcome));
  const status: CheckResult["status"] = outcome === "valid" ? "pass" : outcome === "invalid" ? "fail" : "inconclusive";
  return {
    id,
    category,
    status,
    severity: status === "pass" ? "info" : status === "inconclusive" ? "warning" : "error",
    message: status === "pass"
      ? `All ${results.length} checked ${label} value(s) passed local validation.`
      : status === "fail"
        ? `One or more checked ${label} values failed local validation.`
        : `One or more checked ${label} values require external recognition evidence.`,
    evidence: {
      checkedCount: results.length,
      results,
      citation: citationFor(id),
      ...(id.endsWith(".country_code") ? { policy: TS119602_COUNTRY_CODE_POLICY } : {}),
    },
  };
}

function aggregateOutcome(outcomes: Ts119602SyntaxOutcome[]): Ts119602SyntaxOutcome {
  if (outcomes.includes("invalid")) return "invalid";
  if (outcomes.includes("inconclusive")) return "inconclusive";
  return "valid";
}

function citationFor(id: string): string {
  if (id.endsWith(".uri")) return "ETSI TS 119 602 V1.1.1 clause 6.1.2";
  if (id.endsWith(".date_time")) return "ETSI TS 119 602 V1.1.1 clause 6.1.3";
  if (id.endsWith(".language")) return "ETSI TS 119 602 V1.1.1 clause 6.1.4 and Annex B";
  return "ETSI TS 119 602 V1.1.1 clause 6.1.5";
}
