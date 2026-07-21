/** Deterministic local validators for ETSI TS 119 602 V1.1.1 clause 6.1. */

export type Ts119602SyntaxOutcome = "valid" | "invalid" | "inconclusive";

export interface Ts119602SyntaxDiagnostic {
  code: string;
  message: string;
}

export interface Ts119602SyntaxValidation {
  outcome: Ts119602SyntaxOutcome;
  diagnostics: Ts119602SyntaxDiagnostic[];
  classification?: string;
}

export interface Ts119602MultilingualValue {
  language: unknown;
  value: unknown;
}

export interface Ts119602MultilingualValidation extends Ts119602SyntaxValidation {
  languages: string[];
}

const ISO_3166_ALPHA_2 = new Set([
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
]);

const ETSI_COUNTRY_EXCEPTIONS = new Set(["UK", "EL", "EU"]);
const ETSI_GROUPING_EXAMPLES = new Set(["AP", "ASIA", "GCC", "ASEAN"]);

export const TS119602_COUNTRY_CODE_POLICY = Object.freeze({
  policyVersion: "2026-07-21",
  source: "ETSI TS 119 602 V1.1.1 clause 6.1.5 and ISO 3166-1 alpha-2",
  iso3166Alpha2CodeCount: ISO_3166_ALPHA_2.size,
  etsiExceptions: ["UK", "EL", "EU"] as const,
  etsiGroupingExamples: ["AP", "ASIA", "GCC", "ASEAN"] as const,
  unlistedUpperCaseGroupingOutcome: "inconclusive" as const,
});

const GRANDFATHERED_LANGUAGE_TAGS = new Set([
  "art-lojban", "cel-gaulish", "en-gb-oed", "i-ami", "i-bnn", "i-default", "i-enochian", "i-hak", "i-klingon",
  "i-lux", "i-mingo", "i-navajo", "i-pwn", "i-tao", "i-tay", "i-tsu", "no-bok", "no-nyn", "sgn-be-fr",
  "sgn-be-nl", "sgn-ch-de", "zh-guoyu", "zh-hakka", "zh-min", "zh-min-nan", "zh-xiang",
]);

const URI_CHARACTERS = /^[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*$/;
const STRICT_UTC_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

export function validateTs119602Uri(value: unknown): Ts119602SyntaxValidation {
  if (typeof value !== "string" || value.length === 0) {
    return invalid("uri.non_empty", "The URI value must be a non-empty string.");
  }
  if (!/^[\x00-\x7f]+$/.test(value) || !URI_CHARACTERS.test(value)) {
    return invalid("uri.rfc3986_characters", "The URI contains characters outside the RFC 3986 URI character repertoire.");
  }
  if (/%(?![0-9A-Fa-f]{2})/.test(value)) {
    return invalid("uri.percent_encoding", "Each percent sign in a URI must be followed by two hexadecimal digits.");
  }
  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value);
  if (!schemeMatch) {
    return invalid("uri.absolute", "The URI must be absolute and begin with an RFC 3986 scheme.");
  }
  const scheme = schemeMatch[1].toLowerCase();
  if (scheme === "http" || scheme === "https") {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== `${scheme}:` || !parsed.hostname) {
        return invalid("uri.http_authority", "An HTTP(S) URI must contain a non-empty authority host.");
      }
    } catch {
      return invalid("uri.http_syntax", "The HTTP(S) URI is not syntactically valid.");
    }
  }
  if (scheme === "mailto") {
    const address = value.slice(schemeMatch[0].length).split("?", 1)[0];
    if (!/^[^@/?#]+@[^@/?#]+$/.test(address)) {
      return invalid("uri.mailto_address", "A mailto URI must contain one non-empty addr-spec.");
    }
  }
  if (scheme === "tel") {
    const subscriber = value.slice(schemeMatch[0].length);
    if (!/^\+?[0-9A-Fa-f*#().-]+(?:;[A-Za-z0-9-]+(?:=[A-Za-z0-9._~!$&'()*+,;=:%-]*)?)*$/.test(subscriber)) {
      return invalid("uri.tel_subscriber", "A tel URI must contain a syntactically valid telephone subscriber value.");
    }
  }
  return { outcome: "valid", diagnostics: [], classification: scheme };
}

export function validateTs119602UtcDateTime(value: unknown): Ts119602SyntaxValidation {
  if (typeof value !== "string") {
    return invalid("date_time.string", "The date-time value must be a string.");
  }
  const match = STRICT_UTC_DATE_TIME.exec(value);
  if (!match) {
    return invalid(
      "date_time.lexical_form",
      "The date-time must use YYYY-MM-DDThh:mm:ssZ with seconds, no decimal fraction, and the UTC Z designator.",
    );
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const maximumDay = daysInMonth(year, month);
  if (year === 0 || maximumDay === 0 || day < 1 || day > maximumDay || hour > 23 || minute > 59 || second > 59) {
    return invalid("date_time.calendar_value", "The date-time contains an invalid calendar or clock value.");
  }
  return { outcome: "valid", diagnostics: [], classification: "iso8601_utc_seconds" };
}

export function parseTs119602UtcDateTime(value: unknown): Date | undefined {
  return validateTs119602UtcDateTime(value).outcome === "valid" ? new Date(value as string) : undefined;
}

export function validateTs119602LanguageTag(value: unknown): Ts119602SyntaxValidation {
  if (typeof value !== "string" || value.length === 0) {
    return invalid("language.non_empty", "A language tag must be a non-empty string.");
  }
  if (value !== value.toLowerCase()) {
    return invalid("language.lower_case", "RFC 5646 language tags must be represented in lower case for this profile.");
  }
  if (!isRfc5646LanguageTag(value)) {
    return invalid("language.rfc5646", "The language tag does not match the supported RFC 5646 syntax.");
  }
  return { outcome: "valid", diagnostics: [], classification: "rfc5646_lower_case" };
}

export function validateTs119602CountryCode(value: unknown): Ts119602SyntaxValidation {
  if (typeof value !== "string" || value.length === 0) {
    return invalid("country.non_empty", "A country or grouping code must be a non-empty string.");
  }
  if (!/^[A-Z]+$/.test(value)) {
    return invalid("country.upper_case", "Country and grouping codes must contain capital ASCII letters only.");
  }
  if (value === "GB") {
    return invalid("country.uk_exception", "TS 119 602 requires UK instead of the ISO GB code for the United Kingdom.");
  }
  if (value === "GR") {
    return invalid("country.el_exception", "TS 119 602 requires EL instead of the ISO GR code for Greece.");
  }
  if (ETSI_COUNTRY_EXCEPTIONS.has(value)) {
    return { outcome: "valid", diagnostics: [], classification: "etsi_exception" };
  }
  if (ISO_3166_ALPHA_2.has(value)) {
    return { outcome: "valid", diagnostics: [], classification: "iso3166_alpha2" };
  }
  if (ETSI_GROUPING_EXAMPLES.has(value)) {
    return { outcome: "valid", diagnostics: [], classification: "etsi_grouping_example" };
  }
  return {
    outcome: "inconclusive",
    diagnostics: [{
      code: "country.grouping_recognition",
      message: "The uppercase value could be a regional or multi-state identifier, but its recognition is not established by the local pinned policy.",
    }],
    classification: "unverified_grouping",
  };
}

export function validateTs119602MultilingualValues(
  values: readonly Ts119602MultilingualValue[],
): Ts119602MultilingualValidation {
  const diagnostics: Ts119602SyntaxDiagnostic[] = [];
  const languages: string[] = [];
  if (values.length === 0) {
    diagnostics.push({ code: "multilingual.non_empty", message: "A multilingual value set must contain at least one entry." });
  }
  for (const entry of values) {
    const language = validateTs119602LanguageTag(entry.language);
    diagnostics.push(...language.diagnostics);
    if (typeof entry.language === "string" && language.outcome === "valid") languages.push(entry.language);
    if (typeof entry.value !== "string" || entry.value.length === 0) {
      diagnostics.push({ code: "multilingual.value_non_empty", message: "Each multilingual entry must contain a non-empty string value." });
    } else {
      diagnostics.push(...multilingualCharacterDiagnostics(entry.value));
    }
  }
  if (!languages.includes("en")) {
    diagnostics.push({ code: "multilingual.english_required", message: "The multilingual value set must include an English entry tagged en." });
  }
  const duplicates = languages.filter((language, index) => languages.indexOf(language) !== index);
  if (duplicates.length > 0) {
    diagnostics.push({ code: "multilingual.duplicate_language", message: "A multilingual value set must not repeat the same language tag." });
  }
  return {
    outcome: diagnostics.length === 0 ? "valid" : "invalid",
    diagnostics,
    languages,
    classification: "local_multilingual_structure",
  };
}

function invalid(code: string, message: string): Ts119602SyntaxValidation {
  return { outcome: "invalid", diagnostics: [{ code, message }] };
}

function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isRfc5646LanguageTag(value: string): boolean {
  if (GRANDFATHERED_LANGUAGE_TAGS.has(value)) return true;
  if (/^x(?:-[a-z0-9]{1,8})+$/.test(value)) return true;
  const parts = value.split("-");
  const language = parts.shift();
  if (!language || !/^(?:[a-z]{2,3}|[a-z]{4}|[a-z]{5,8})$/.test(language)) return false;
  if (/^[a-z]{2,3}$/.test(language)) {
    let extlangCount = 0;
    while (parts[0] && /^[a-z]{3}$/.test(parts[0]) && extlangCount < 3) {
      parts.shift();
      extlangCount += 1;
    }
  }
  if (parts[0] && /^[a-z]{4}$/.test(parts[0])) parts.shift();
  if (parts[0] && /^(?:[a-z]{2}|\d{3})$/.test(parts[0])) parts.shift();
  const variants = new Set<string>();
  while (parts[0] && /^(?:[a-z0-9]{5,8}|\d[a-z0-9]{3})$/.test(parts[0])) {
    const variant = parts.shift() as string;
    if (variants.has(variant)) return false;
    variants.add(variant);
  }
  const singletons = new Set<string>();
  while (parts[0] && /^[0-9a-wy-z]$/.test(parts[0])) {
    const singleton = parts.shift() as string;
    if (singletons.has(singleton)) return false;
    singletons.add(singleton);
    let extensionParts = 0;
    while (parts[0] && /^[a-z0-9]{2,8}$/.test(parts[0])) {
      parts.shift();
      extensionParts += 1;
    }
    if (extensionParts === 0) return false;
  }
  if (parts[0] === "x") {
    parts.shift();
    if (parts.length === 0 || parts.some((part) => !/^[a-z0-9]{1,8}$/.test(part))) return false;
    parts.length = 0;
  }
  return parts.length === 0;
}

function multilingualCharacterDiagnostics(value: string): Ts119602SyntaxDiagnostic[] {
  const diagnostics: Ts119602SyntaxDiagnostic[] = [];
  let controlCharacter = false;
  let privateUseCharacter = false;
  let tagCharacter = false;
  let byteOrderMark = false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) as number;
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) controlCharacter = true;
    if (
      (codePoint >= 0xe000 && codePoint <= 0xf8ff)
      || (codePoint >= 0xf0000 && codePoint <= 0xffffd)
      || (codePoint >= 0x100000 && codePoint <= 0x10fffd)
    ) privateUseCharacter = true;
    if (codePoint >= 0xe0000 && codePoint <= 0xe007f) tagCharacter = true;
    if (codePoint === 0xfeff) byteOrderMark = true;
  }
  if (controlCharacter) diagnostics.push({ code: "multilingual.control_character", message: "A multilingual character string must not contain control characters, including TAB, CR, or LF." });
  if (privateUseCharacter) diagnostics.push({ code: "multilingual.private_use_character", message: "A multilingual character string must not contain Unicode private-use characters." });
  if (tagCharacter) diagnostics.push({ code: "multilingual.tag_character", message: "A multilingual character string must not contain Unicode tag characters." });
  if (byteOrderMark) diagnostics.push({ code: "multilingual.byte_order_mark", message: "A multilingual character string must not contain a byte-order mark or UCS signature." });
  if (/<\/?[A-Za-z][^>]*>/.test(value)) diagnostics.push({ code: "multilingual.markup", message: "A multilingual character string must be plain text without markup elements." });
  return diagnostics;
}
