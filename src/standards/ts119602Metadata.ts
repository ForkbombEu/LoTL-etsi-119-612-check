import type { CheckResult } from "../types.js";
import { parseTs119602UtcDateTime, validateTs119602Uri } from "./ts119602Syntax.js";

export type Ts119602SchemeMode = "implicit" | "explicit";

export const TS119602_SCHEME_FIELDS = [
  "LoTEVersionIdentifier",
  "LoTESequenceNumber",
  "LoTEType",
  "SchemeOperatorName",
  "SchemeOperatorAddress",
  "SchemeName",
  "SchemeInformationURI",
  "StatusDeterminationApproach",
  "SchemeTypeCommunityRules",
  "SchemeTerritory",
  "PolicyOrLegalNotice",
  "HistoricalInformationPeriod",
  "PointersToOtherLoTE",
  "ListIssueDateTime",
  "NextUpdate",
  "DistributionPoints",
  "SchemeExtensions",
] as const;

export type Ts119602SchemeField = typeof TS119602_SCHEME_FIELDS[number];
type Presence = "mandatory" | "optional" | "prohibited";

export interface Ts119602AddressObservation {
  present: boolean;
  postalAddresses: Array<{ path: string; streetPresent: boolean; countryPresent: boolean }>;
  electronicUris: Array<{ path: string; value: unknown }>;
}

export interface Ts119602PolicyObservation {
  present: boolean;
  policyPointerCount: number;
  legalNoticeCount: number;
  unknownEntryCount: number;
}

export interface Ts119602PointerObservation {
  path: string;
  location: unknown;
  identityCount: number;
  qualifiers: Array<{
    path: string;
    typePresent: boolean;
    operatorNamePresent: boolean;
    mimeTypePresent: boolean;
  }>;
}

export interface Ts119602ExtensionObservation {
  path: string;
  critical: unknown;
  identifier?: string;
  recognized: boolean;
}

export interface Ts119602MetadataInput {
  binding: "json" | "xml";
  schemeInformationContainerPresent: boolean;
  fields: Record<Ts119602SchemeField, { present: boolean; count: number }>;
  loteTag: { present: boolean; value?: unknown };
  version: unknown;
  sequence: unknown;
  schemeNames: Array<{ language: unknown; value: unknown }>;
  territory: unknown;
  address: Ts119602AddressObservation;
  policy: Ts119602PolicyObservation;
  historyPeriod: unknown;
  pointers: Ts119602PointerObservation[];
  issueDateTime: unknown;
  nextUpdate: { present: boolean; value: unknown };
  serviceStatuses: unknown[];
  distributionPoints: { present: boolean; values: unknown[] };
  extensions: { present: boolean; values: Ts119602ExtensionObservation[] };
  assessmentDate: Date;
}

export const TS119602_SCHEME_EXTENSION_REGISTRY = Object.freeze({
  registryVersion: "2026-07-21",
  recognizedIdentifiers: [] as readonly string[],
  unknownCriticalPolicy: "reject" as const,
  unknownNonCriticalPolicy: "ignore" as const,
  citation: "ETSI TS 119 602 V1.1.1 clause 6.3.17",
});

const EXPLICIT_SIGNAL_FIELDS = [
  "SchemeName",
  "SchemeInformationURI",
  "StatusDeterminationApproach",
  "SchemeTypeCommunityRules",
  "PolicyOrLegalNotice",
] as const satisfies readonly Ts119602SchemeField[];

const TABLE_1: Record<Ts119602SchemeMode, Record<Ts119602SchemeField, Presence>> = {
  implicit: {
    LoTEVersionIdentifier: "mandatory",
    LoTESequenceNumber: "mandatory",
    LoTEType: "optional",
    SchemeOperatorName: "mandatory",
    SchemeOperatorAddress: "optional",
    SchemeName: "prohibited",
    SchemeInformationURI: "prohibited",
    StatusDeterminationApproach: "prohibited",
    SchemeTypeCommunityRules: "prohibited",
    SchemeTerritory: "optional",
    PolicyOrLegalNotice: "prohibited",
    HistoricalInformationPeriod: "optional",
    PointersToOtherLoTE: "optional",
    ListIssueDateTime: "mandatory",
    NextUpdate: "mandatory",
    DistributionPoints: "optional",
    SchemeExtensions: "optional",
  },
  explicit: {
    LoTEVersionIdentifier: "mandatory",
    LoTESequenceNumber: "mandatory",
    LoTEType: "mandatory",
    SchemeOperatorName: "mandatory",
    SchemeOperatorAddress: "mandatory",
    SchemeName: "mandatory",
    SchemeInformationURI: "mandatory",
    StatusDeterminationApproach: "mandatory",
    SchemeTypeCommunityRules: "mandatory",
    SchemeTerritory: "mandatory",
    PolicyOrLegalNotice: "mandatory",
    HistoricalInformationPeriod: "optional",
    PointersToOtherLoTE: "optional",
    ListIssueDateTime: "mandatory",
    NextUpdate: "mandatory",
    DistributionPoints: "optional",
    SchemeExtensions: "optional",
  },
};

export function buildTs119602MetadataFindings(input: Ts119602MetadataInput): CheckResult[] {
  const mode = inferSchemeMode(input.fields);
  return [
    loteTagFinding(input),
    table1Finding(input, mode),
    integerFinding("ts119602.scheme.version", "LoTE version identifier", input.version, false, "6.3.1"),
    integerFinding("ts119602.scheme.sequence.local", "LoTE sequence number", input.sequence, true, "6.3.2"),
    schemeNameFinding(input, mode),
    addressFinding(input, mode),
    policyFinding(input, mode),
    historyPeriodFinding(input),
    pointerFinding(input),
    pointerAuthenticationFinding(input),
    issueTimeFinding(input),
    nextUpdateFinding(input),
    distributionFinding(input),
    distributionConsistencyFinding(input),
    extensionsFinding(input),
  ];
}

export function inferTs119602SchemeMode(
  fields: Record<Ts119602SchemeField, { present: boolean }>,
): Ts119602SchemeMode {
  return inferSchemeMode(fields);
}

export function ts119602Table1Presence(
  mode: Ts119602SchemeMode,
  field: Ts119602SchemeField,
): Presence {
  return TABLE_1[mode][field];
}

function inferSchemeMode(fields: Record<Ts119602SchemeField, { present: boolean }>): Ts119602SchemeMode {
  return EXPLICIT_SIGNAL_FIELDS.some((field) => fields[field].present) ? "explicit" : "implicit";
}

function loteTagFinding(input: Ts119602MetadataInput): CheckResult {
  if (input.binding === "json") {
    return finding(
      "ts119602.structure.lote_tag",
      "not_applicable",
      "info",
      "The scheme-explicit JSON binding has no LoTE tag member; clause 6.2 is represented only by the XML LOTETag attribute.",
      { binding: "json", representation: "not_defined" },
    );
  }
  const validation = validateTs119602Uri(input.loteTag.value);
  const valid = input.loteTag.present && validation.outcome === "valid";
  return finding(
    "ts119602.structure.lote_tag",
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    valid ? "The XML LOTETag attribute is present and contains an absolute URI." : "The XML LOTETag attribute is missing or is not an absolute URI.",
    { binding: "xml", ...input.loteTag, validation, citation: "ETSI TS 119 602 V1.1.1 clause 6.2" },
  );
}

function table1Finding(input: Ts119602MetadataInput, mode: Ts119602SchemeMode): CheckResult {
  const expectations = TABLE_1[mode];
  const fields = TS119602_SCHEME_FIELDS.map((name) => ({
    name,
    expected: expectations[name],
    present: input.fields[name].present,
    count: input.fields[name].count,
  }));
  const violations: Array<{ name: string; expected: Presence; present: boolean; count: number }> = fields.filter((field) =>
    (field.expected === "mandatory" && !field.present)
    || (field.expected === "prohibited" && field.present));
  if (mode === "explicit" && !input.schemeInformationContainerPresent) {
    violations.push({ name: "ListAndSchemeInformation", expected: "mandatory", present: false, count: 0 });
  }
  return finding(
    "ts119602.structure.scheme_information_presence",
    violations.length === 0 ? "pass" : "fail",
    violations.length === 0 ? "info" : "critical",
    violations.length === 0
      ? `The ${mode} scheme-information fields satisfy the local Table 1 presence matrix.`
      : `The inferred ${mode} scheme-information mode violates the Table 1 presence matrix.`,
    {
      mode,
      modeSource: "local_field_inference",
      explicitSignalFields: EXPLICIT_SIGNAL_FIELDS.filter((field) => input.fields[field].present),
      schemeInformationContainerPresent: input.schemeInformationContainerPresent,
      fields,
      violations,
      citation: "ETSI TS 119 602 V1.1.1 clause 6.3.0 and Table 1",
    },
  );
}

function integerFinding(
  id: string,
  label: string,
  value: unknown,
  positive: boolean,
  clause: string,
): CheckResult {
  const valid = Number.isInteger(value) && (!positive || (value as number) > 0);
  return finding(
    id,
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    valid ? `${label} has a locally valid integer representation.` : `${label} must be ${positive ? "a positive integer" : "an integer"}.`,
    {
      observed: value ?? null,
      profileSpecificValueChecked: false,
      citation: `ETSI TS 119 602 V1.1.1 clause ${clause}`,
    },
  );
}

function schemeNameFinding(input: Ts119602MetadataInput, mode: Ts119602SchemeMode): CheckResult {
  if (!input.fields.SchemeName.present) {
    return finding(
      "ts119602.scheme.name",
      mode === "explicit" ? "fail" : "not_applicable",
      mode === "explicit" ? "error" : "info",
      mode === "explicit" ? "SchemeName is mandatory for explicit scheme information." : "SchemeName is prohibited and absent for implicit scheme information.",
    );
  }
  const territory = typeof input.territory === "string" ? input.territory : undefined;
  const results = input.schemeNames.map((entry) => ({
    ...entry,
    valid: typeof entry.value === "string" && Boolean(territory) && entry.value.startsWith(`${territory}:`) && entry.value.length > (territory?.length ?? 0) + 1,
  }));
  const english = results.find((entry) => entry.language === "en");
  const valid = Boolean(territory) && Boolean(english?.valid) && results.every((entry) => entry.valid);
  return finding(
    "ts119602.scheme.name",
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    valid ? "SchemeName values use the SchemeTerritory:name form and include English." : "SchemeName values must include English and use the SchemeTerritory:name form.",
    { territory: territory ?? null, results, citation: "ETSI TS 119 602 V1.1.1 clause 6.3.6" },
  );
}

function addressFinding(input: Ts119602MetadataInput, mode: Ts119602SchemeMode): CheckResult {
  const address = input.address;
  if (!address.present) {
    return finding(
      "ts119602.scheme.operator_address",
      mode === "explicit" ? "fail" : "not_applicable",
      mode === "explicit" ? "error" : "info",
      mode === "explicit" ? "SchemeOperatorAddress is mandatory for explicit scheme information." : "SchemeOperatorAddress is optional and absent.",
    );
  }
  const invalidPostal = address.postalAddresses.filter((entry) => !entry.streetPresent || !entry.countryPresent);
  const uriSchemes = address.electronicUris.map((entry) => ({
    ...entry,
    scheme: typeof entry.value === "string" ? /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(entry.value)?.[1].toLowerCase() : undefined,
  }));
  const hasEmail = uriSchemes.some((entry) => entry.scheme === "mailto");
  const hasWebsite = uriSchemes.some((entry) => entry.scheme === "http" || entry.scheme === "https");
  const valid = address.postalAddresses.length > 0
    && invalidPostal.length === 0
    && address.electronicUris.length > 0
    && hasEmail
    && hasWebsite;
  return finding(
    "ts119602.scheme.operator_address",
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    valid ? "SchemeOperatorAddress contains postal, email, and website contact structures." : "SchemeOperatorAddress must contain valid postal entries plus a mailto URI and an HTTP(S) website URI.",
    { postalAddressCount: address.postalAddresses.length, invalidPostal, electronicUris: uriSchemes, hasEmail, hasWebsite, citation: "ETSI TS 119 602 V1.1.1 clauses 6.3.5.1 and 6.3.5.2" },
  );
}

function policyFinding(input: Ts119602MetadataInput, mode: Ts119602SchemeMode): CheckResult {
  const policy = input.policy;
  if (!policy.present) {
    return finding(
      "ts119602.scheme.policy_or_legal_notice",
      mode === "explicit" ? "fail" : "not_applicable",
      mode === "explicit" ? "error" : "info",
      mode === "explicit" ? "PolicyOrLegalNotice is mandatory for explicit scheme information." : "PolicyOrLegalNotice is prohibited and absent for implicit scheme information.",
    );
  }
  const alternatives = Number(policy.policyPointerCount > 0) + Number(policy.legalNoticeCount > 0);
  const valid = alternatives === 1 && policy.unknownEntryCount === 0;
  return finding(
    "ts119602.scheme.policy_or_legal_notice",
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    valid ? "PolicyOrLegalNotice contains one non-empty policy-pointer or legal-notice alternative." : "PolicyOrLegalNotice must contain exactly one supported non-empty alternative.",
    { ...policy, citation: "ETSI TS 119 602 V1.1.1 clause 6.3.11" },
  );
}

function historyPeriodFinding(input: Ts119602MetadataInput): CheckResult {
  if (!input.fields.HistoricalInformationPeriod.present) {
    return finding(
      "ts119602.scheme.history_period",
      "not_applicable",
      "info",
      "HistoricalInformationPeriod is absent, which locally indicates that service history is not retained.",
      { retention: "not_kept", citation: "ETSI TS 119 602 V1.1.1 clause 6.3.12" },
    );
  }
  const valid = Number.isInteger(input.historyPeriod) && (input.historyPeriod as number) >= 0;
  return finding(
    "ts119602.scheme.history_period",
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    valid ? "HistoricalInformationPeriod is a non-negative integer." : "HistoricalInformationPeriod must be a non-negative integer.",
    {
      observed: input.historyPeriod ?? null,
      retention: input.historyPeriod === 65535 ? "never_remove" : valid ? "finite" : "invalid",
      citation: "ETSI TS 119 602 V1.1.1 clause 6.3.12",
    },
  );
}

function pointerFinding(input: Ts119602MetadataInput): CheckResult {
  if (!input.fields.PointersToOtherLoTE.present) {
    return finding("ts119602.scheme.pointers.structure", "not_applicable", "info", "PointersToOtherLoTE is optional and absent.");
  }
  const results = input.pointers.map((pointer) => {
    const locationValid = validateTs119602Uri(pointer.location).outcome === "valid";
    const qualifierValid = pointer.qualifiers.length > 0 && pointer.qualifiers.every((qualifier) =>
      qualifier.typePresent && qualifier.operatorNamePresent && qualifier.mimeTypePresent);
    return {
      ...pointer,
      locationValid,
      identitiesValid: pointer.identityCount > 0,
      qualifiersValid: qualifierValid,
      valid: locationValid && pointer.identityCount > 0 && qualifierValid,
    };
  });
  const valid = results.length > 0 && results.every((result) => result.valid);
  return finding(
    "ts119602.scheme.pointers.structure",
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    valid ? "Every pointer contains a location, one or more identities, and complete qualifier information." : "PointersToOtherLoTE must be non-empty and every pointer must contain a location, identity, and complete qualifier information.",
    { pointerCount: results.length, results, citation: "ETSI TS 119 602 V1.1.1 clause 6.3.13" },
  );
}

function pointerAuthenticationFinding(input: Ts119602MetadataInput): CheckResult {
  return finding(
    "ts119602.scheme.pointers.authentication",
    input.pointers.length > 0 ? "not_checked" : "not_applicable",
    input.pointers.length > 0 ? "warning" : "info",
    input.pointers.length > 0
      ? "Pointer identity authentication requires the fetched target and is not checked by the local metadata assessment."
      : "Pointer authentication is not applicable because no pointers are present.",
    { pointerCount: input.pointers.length, citation: "ETSI TS 119 602 V1.1.1 clause 6.3.13" },
  );
}

function issueTimeFinding(input: Ts119602MetadataInput): CheckResult {
  const issue = parseTs119602UtcDateTime(input.issueDateTime);
  if (!issue) {
    return finding("ts119602.scheme.issue_time", "fail", "error", "ListIssueDateTime is absent or does not use the strict UTC lexical form.", { observed: input.issueDateTime ?? null });
  }
  const future = issue.getTime() > input.assessmentDate.getTime();
  return finding(
    "ts119602.scheme.issue_time",
    future ? "warn" : "pass",
    future ? "warning" : "info",
    future ? "ListIssueDateTime is after the assessment time; clock or issuance evidence should be reviewed." : "ListIssueDateTime is a valid UTC issuance time not later than the assessment time.",
    { issueDateTime: issue.toISOString(), assessmentDate: input.assessmentDate.toISOString(), citation: "ETSI TS 119 602 V1.1.1 clause 6.3.14" },
  );
}

function nextUpdateFinding(input: Ts119602MetadataInput): CheckResult {
  if (!input.nextUpdate.present) {
    return finding("ts119602.scheme.next_update", "fail", "error", "NextUpdate is mandatory for both implicit and explicit scheme information.");
  }
  if (input.nextUpdate.value === null || input.nextUpdate.value === undefined || input.nextUpdate.value === "") {
    const statuses = input.serviceStatuses.filter((status): status is string => typeof status === "string");
    const nonExpired = statuses.filter((status) => !/(?:\/|:)expired$/i.test(status));
    const valid = nonExpired.length === 0;
    return finding(
      "ts119602.scheme.next_update",
      valid ? "pass" : "fail",
      valid ? "info" : "error",
      valid ? "NextUpdate is null, representing a closed LoTE whose observed service statuses are expired." : "A closed LoTE with null NextUpdate contains a service status that is not expired.",
      {
        closed: true,
        serviceStatusCount: statuses.length,
        nonExpired,
        schemaConflict: "The document text permits null while the published JSON/XML schema representations do not consistently model it.",
        interpretationId: "ts119602-v1.1.1-next-update-null",
        citation: "ETSI TS 119 602 V1.1.1 clause 6.3.15",
      },
    );
  }
  const issue = parseTs119602UtcDateTime(input.issueDateTime);
  const next = parseTs119602UtcDateTime(input.nextUpdate.value);
  if (!next) {
    return finding("ts119602.scheme.next_update", "fail", "error", "NextUpdate is neither null nor a strict UTC date-time.", { observed: input.nextUpdate.value });
  }
  const afterIssue = Boolean(issue && next.getTime() > issue.getTime());
  const expired = next.getTime() < input.assessmentDate.getTime();
  const valid = afterIssue && !expired;
  return finding(
    "ts119602.scheme.next_update",
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    !afterIssue
      ? "NextUpdate must be later than ListIssueDateTime."
      : expired
        ? "NextUpdate is in the past and the LoTE is expired."
        : "NextUpdate is later than ListIssueDateTime and has not expired.",
    {
      closed: false,
      issueDateTime: issue?.toISOString() ?? null,
      nextUpdate: next.toISOString(),
      assessmentDate: input.assessmentDate.toISOString(),
      profileMaximumInterval: "not_checked_until_profile_dispatch",
      citation: "ETSI TS 119 602 V1.1.1 clause 6.3.15",
    },
  );
}

function distributionFinding(input: Ts119602MetadataInput): CheckResult {
  if (!input.distributionPoints.present) {
    return finding("ts119602.scheme.distribution_points", "not_applicable", "info", "DistributionPoints is optional and absent.");
  }
  const results = input.distributionPoints.values.map((value) => ({ value, validation: validateTs119602Uri(value) }));
  const valid = results.length > 0 && results.every((entry) => entry.validation.outcome === "valid");
  return finding(
    "ts119602.scheme.distribution_points",
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    valid ? "DistributionPoints contains a non-empty sequence of absolute URIs." : "DistributionPoints must contain a non-empty sequence of absolute URIs.",
    { count: results.length, results, citation: "ETSI TS 119 602 V1.1.1 clause 6.3.16" },
  );
}

function distributionConsistencyFinding(input: Ts119602MetadataInput): CheckResult {
  return finding(
    "ts119602.scheme.distribution_consistency",
    input.distributionPoints.present ? "not_checked" : "not_applicable",
    input.distributionPoints.present ? "warning" : "info",
    input.distributionPoints.present
      ? "Distribution-point byte equality and latest-update behavior require bounded dereferencing and were not checked locally."
      : "Distribution consistency is not applicable because no distribution points are present.",
    { distributionPointCount: input.distributionPoints.values.length, citation: "ETSI TS 119 602 V1.1.1 clause 6.3.16" },
  );
}

function extensionsFinding(input: Ts119602MetadataInput): CheckResult {
  if (!input.extensions.present) {
    return finding("ts119602.scheme.extensions", "not_applicable", "info", "SchemeExtensions is optional and absent.", { registry: TS119602_SCHEME_EXTENSION_REGISTRY });
  }
  const results = input.extensions.values.map((extension) => ({
    ...extension,
    criticalValid: typeof extension.critical === "boolean",
    reject: extension.critical === true && !extension.recognized,
  }));
  const valid = results.length > 0 && results.every((extension) => extension.criticalValid && !extension.reject);
  return finding(
    "ts119602.scheme.extensions",
    valid ? "pass" : "fail",
    valid ? "info" : "critical",
    valid ? "Every scheme extension has a criticality indication and no unknown critical extension was encountered." : "A scheme extension lacks criticality or is both critical and unrecognized; the LoTE must be rejected.",
    { extensionCount: results.length, results, registry: TS119602_SCHEME_EXTENSION_REGISTRY },
  );
}

function finding(
  id: string,
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): CheckResult {
  const category: CheckResult["category"] = id.includes("issue_time") || id.includes("next_update") ? "dates" : "structure";
  return { id, category, status, severity, message, evidence };
}
