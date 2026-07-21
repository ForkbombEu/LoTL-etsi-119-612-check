import { getPath, isRecord, numberValue, asArray, firstString } from "../lotl.js";
import { buildStandardAssessment } from "../standards/assessment.js";
import {
  buildTs119602MetadataFindings,
  TS119602_SCHEME_FIELDS,
  type Ts119602MetadataInput,
} from "../standards/ts119602Metadata.js";
import { summarizeTs119602Requirements } from "../standards/ts119602Requirements.js";
import { parseTs119602UtcDateTime } from "../standards/ts119602Syntax.js";
import {
  buildTs119602SyntaxFindings,
  type LocatedMultilingualSet,
  type LocatedSyntaxValue,
} from "../standards/ts119602SyntaxFindings.js";
import type { CheckResult, TrustedListAuditResult } from "../types.js";
import { adaptLegacyTslLikeJsonLote } from "./legacyLoteAdapter.js";
import { validateTs119602JsonSchema, type Ts119602JsonSchemaValidation } from "./ts119602JsonSchema.js";

type JsonBindingModel = "official_ts119602" | "legacy_we_build_tsl_like" | "unrecognized";

export function assessJsonLote(
  parsed: unknown,
  _includeChecks: boolean,
  assessmentDate = new Date(),
): Pick<TrustedListAuditResult, "ts119602" | "extracted"> {
  const loteValue = getPath(parsed, ["LoTE"]);
  const legacy = adaptLegacyTslLikeJsonLote(parsed);
  const officialTrustedEntities = getPath(loteValue, ["TrustedEntitiesList"]);
  const model: JsonBindingModel = legacy
    ? "legacy_we_build_tsl_like"
    : isRecord(loteValue) && (officialTrustedEntities === undefined || Array.isArray(officialTrustedEntities))
      ? "official_ts119602"
      : "unrecognized";
  const infoValue = legacy?.listAndSchemeInformation ?? getPath(loteValue, ["ListAndSchemeInformation"]);
  const info = isRecord(infoValue) ? infoValue : undefined;
  const metadataInfo = info ?? (isRecord(loteValue) ? loteValue : {});
  const pointers = asArray(getPath(info, ["PointersToOtherLoTE"]));
  const trustedEntities = legacy?.trustedEntities ?? (Array.isArray(officialTrustedEntities) ? officialTrustedEntities : []);
  const signature = getPath(parsed, ["signature"]) ?? getPath(loteValue, ["signature"]) ?? getPath(loteValue, ["Signature"]);
  const issueDateTime = firstString(getPath(info, ["ListIssueDateTime"]));
  const nextUpdateValue = getPath(info, ["NextUpdate"]);
  const nextUpdate = firstString(nextUpdateValue);
  const schemaValidation = validateTs119602JsonSchema(parsed);
  const checks: CheckResult[] = [
    schemaCheck(schemaValidation),
    compatibilityCheck(model, legacy),
  ];

  addRequiredJsonCheck(checks, "json_lote.root", isRecord(loteValue), "JSON root contains the required LoTE object.", "critical");
  addRequiredJsonCheck(checks, "json_lote.list_and_scheme_information", Boolean(info), "LoTE.ListAndSchemeInformation exists.", "critical");
  addRequiredJsonCheck(checks, "json_lote.version_identifier", Number.isInteger(numberValue(getPath(info, ["LoTEVersionIdentifier"]))), "LoTEVersionIdentifier is an integer.");
  addRequiredJsonCheck(checks, "json_lote.sequence_number", Number.isInteger(numberValue(getPath(info, ["LoTESequenceNumber"]))), "LoTESequenceNumber is an integer.");
  addOptionalJsonCheck(checks, "json_lote.type", Boolean(firstString(getPath(info, ["LoTEType"]))), "LoTEType is present.");
  addRequiredJsonCheck(checks, "json_lote.scheme_operator_name", Boolean(firstString(getPath(info, ["SchemeOperatorName"]))), "SchemeOperatorName is present.");
  addOptionalJsonCheck(checks, "json_lote.scheme_information_uri", Boolean(firstString(getPath(info, ["SchemeInformationURI"]))), "SchemeInformationURI is present.");
  addOptionalJsonCheck(checks, "json_lote.status_determination_approach", Boolean(firstString(getPath(info, ["StatusDeterminationApproach"]))), "StatusDeterminationApproach is present.");
  addOptionalJsonCheck(checks, "json_lote.scheme_territory", Boolean(firstString(getPath(info, ["SchemeTerritory"]))), "SchemeTerritory is present.");
  addRequiredJsonCheck(checks, "json_lote.list_issue_date_time", Boolean(issueDateTime), "ListIssueDateTime is present.");
  addRequiredJsonCheck(checks, "json_lote.next_update", Boolean(info && Object.hasOwn(info, "NextUpdate")), "NextUpdate is present.");
  addOptionalJsonCheck(checks, "json_lote.distribution_points", getPath(info, ["DistributionPoints"]) !== undefined, "DistributionPoints is present.");
  checks.push(
    check("json_lote.pointers.count", "pass", "info", "PointersToOtherLoTE entries counted.", pointers.length),
    pointerIdentityCheck(pointers),
    check(
      "json_lote.signature.jades_baseline_b",
      "unsupported",
      "warning",
      "Compact JAdES Baseline B validation is not implemented; a JSON signature property is not treated as signature evidence.",
      { legacySignatureObjectPresent: isJsonObject(signature) },
    ),
    ...buildTs119602MetadataFindings(collectJsonMetadataInput(metadataInfo, info !== undefined, assessmentDate, loteValue)),
    ...buildTs119602SyntaxFindings(collectJsonSyntaxInputs(parsed)),
    ...dateChecks(issueDateTime, nextUpdateValue, assessmentDate),
    check(
      "ts119602.coverage.complete",
      "not_checked",
      "warning",
      "Complete ETSI TS 119 602 V1.1.1 semantic, signature, and Annex D-I profile coverage is not implemented.",
      summarizeTs119602Requirements(),
    ),
  );

  return {
    ts119602: buildStandardAssessment(checks, { coverageComplete: false }),
    extracted: {
      schemeOperatorName: stringValues(getPath(info, ["SchemeOperatorName"])),
      schemeName: stringValues(getPath(info, ["SchemeName"])),
      schemeTerritory: firstString(getPath(info, ["SchemeTerritory"])),
      statusDeterminationApproach: firstString(getPath(info, ["StatusDeterminationApproach"])),
      listIssueDateTime: issueDateTime,
      nextUpdate,
      distributionPoints: stringValues(getPath(info, ["DistributionPoints"])),
      jsonLote: {
        assessmentProfile: "ETSI TS 119 602 V1.1.1 JSON binding with offline schema validation (incomplete semantic/profile coverage)",
        jsonBindingModel: model,
        schemaValid: schemaValidation.valid,
        schemaSha256: schemaValidation.schema.sha256,
        LoTEVersionIdentifier: numberValue(getPath(info, ["LoTEVersionIdentifier"])),
        LoTEType: firstString(getPath(info, ["LoTEType"])),
        LoTESequenceNumber: numberValue(getPath(info, ["LoTESequenceNumber"])),
        SchemeOperatorName: firstString(getPath(info, ["SchemeOperatorName"])),
        SchemeInformationURI: firstString(getPath(info, ["SchemeInformationURI"])),
        StatusDeterminationApproach: firstString(getPath(info, ["StatusDeterminationApproach"])),
        SchemeTerritory: firstString(getPath(info, ["SchemeTerritory"])),
        ListIssueDateTime: issueDateTime,
        NextUpdate: nextUpdate,
        DistributionPoints: stringValues(getPath(info, ["DistributionPoints"])),
        TrustedEntitiesListCount: trustedEntities.length,
        TrustedEntityServicesCount: countTrustedEntityServices(trustedEntities),
        PointersToOtherLoTECount: pointers.length,
        pointersWithServiceDigitalIdentities: pointers.filter(hasServiceDigitalIdentities).length,
        signatureObjectPresent: isJsonObject(signature),
        ...(legacy ? { compatibility: { observedPath: legacy.observedPath, normativePath: legacy.normativePath } } : {}),
      },
    },
  };
}

function schemaCheck(validation: Ts119602JsonSchemaValidation): CheckResult {
  return check(
    "ts119602.binding.json_schema",
    validation.valid ? "pass" : "fail",
    validation.valid ? "info" : "critical",
    validation.valid
      ? "JSON artifact passes the pinned official ETSI TS 119 602 V1.1.1 Draft-07 schema."
      : `JSON artifact fails the pinned official ETSI TS 119 602 V1.1.1 Draft-07 schema with ${validation.errors.length} error(s).`,
    { schema: validation.schema, errors: validation.errors },
  );
}

function compatibilityCheck(
  model: JsonBindingModel,
  legacy: ReturnType<typeof adaptLegacyTslLikeJsonLote>,
): CheckResult {
  if (model === "legacy_we_build_tsl_like" && legacy) {
    return check(
      "json_lote.compatibility.legacy_tsl_model",
      "fail",
      "critical",
      "The legacy WE BUILD/TSL-like JSON structure is retained for evidence extraction but is not the ETSI TS 119 602 V1.1.1 scheme-explicit JSON binding.",
      {
        model,
        observedPath: legacy.observedPath,
        normativePath: legacy.normativePath,
        adaptedTrustedEntityCount: legacy.trustedEntities.length,
      },
    );
  }
  return check(
    "json_lote.compatibility.legacy_tsl_model",
    "not_applicable",
    "info",
    model === "official_ts119602"
      ? "The legacy JSON compatibility adapter is not applicable to the official array binding."
      : "No supported legacy WE BUILD/TSL-like JSON compatibility structure was identified.",
    { model },
  );
}

function dateChecks(issueValue: string | undefined, nextRaw: unknown, assessmentDate: Date): CheckResult[] {
  const issue = parseTs119602UtcDateTime(issueValue);
  const closed = nextRaw === null;
  const nextValue = typeof nextRaw === "string" ? nextRaw : undefined;
  const next = parseTs119602UtcDateTime(nextValue);
  const checks = [
    check("json_lote.dates.issue_valid", issue ? "pass" : "fail", issue ? "info" : "error", "ListIssueDateTime uses the strict TS 119 602 UTC lexical form.", issueValue),
    check("json_lote.dates.next_update_valid", closed ? "not_applicable" : next ? "pass" : "fail", closed || next ? "info" : "error", closed ? "NextUpdate date-time syntax is not applicable to a closed LoTE." : "NextUpdate uses the strict TS 119 602 UTC lexical form.", nextValue ?? nextRaw),
  ];
  if (closed || !issue || !next) {
    checks.push(
      check("json_lote.dates.next_after_issue", closed ? "not_applicable" : "not_checked", "info", closed ? "NextUpdate ordering is not applicable to a closed LoTE." : "NextUpdate ordering was not checked because one or both timestamps are invalid or absent."),
      check("json_lote.dates.update_period_days", "not_checked", "info", "A maximum update interval is profile-specific and was not checked by the base metadata assessment."),
    );
    return checks;
  }
  checks.push(
    check("json_lote.dates.next_after_issue", next > issue ? "pass" : "warn", next > issue ? "info" : "warning", "NextUpdate is after ListIssueDateTime.", { issue: issue.toISOString(), nextUpdate: next.toISOString() }),
  );
  const milliseconds = next.getTime() - issue.getTime();
  checks.push(check("json_lote.dates.update_period_days", "not_checked", "info", "A maximum update interval is profile-specific and was not checked by the base metadata assessment.", { milliseconds, days: milliseconds / 86_400_000 }));
  if (assessmentDate > next) {
    checks.push(check("json_lote.dates.next_update_expired", "fail", "error", "JSON LoTE NextUpdate is before assessment time and the LoTE is expired.", { nextUpdate: next.toISOString(), assessmentDate: assessmentDate.toISOString() }));
  }
  return checks;
}

function collectJsonMetadataInput(
  info: Record<string, unknown>,
  schemeInformationContainerPresent: boolean,
  assessmentDate: Date,
  loteValue: unknown,
): Ts119602MetadataInput {
  const fields = Object.fromEntries(TS119602_SCHEME_FIELDS.map((field) => {
    const present = Object.hasOwn(info, field);
    const value = info[field];
    return [field, { present, count: present ? Array.isArray(value) ? value.length : 1 : 0 }];
  })) as Ts119602MetadataInput["fields"];
  const addressValue = info.SchemeOperatorAddress;
  const address = isRecord(addressValue) ? addressValue : {};
  const postal = asArray(address.SchemeOperatorPostalAddress);
  const electronic = asArray(address.SchemeOperatorElectronicAddress);
  const policyEntries = asArray(info.PolicyOrLegalNotice);
  const pointerEntries = asArray(info.PointersToOtherLoTE);
  const extensionEntries = asArray(info.SchemeExtensions);
  return {
    binding: "json",
    schemeInformationContainerPresent,
    fields,
    loteTag: { present: false },
    version: info.LoTEVersionIdentifier,
    sequence: info.LoTESequenceNumber,
    schemeNames: asArray(info.SchemeName).map((entry) => ({
      language: getPath(entry, ["lang"]),
      value: getPath(entry, ["value"]),
    })),
    territory: info.SchemeTerritory,
    address: {
      present: fields.SchemeOperatorAddress.present,
      postalAddresses: postal.map((entry, index) => ({
        path: `/LoTE/ListAndSchemeInformation/SchemeOperatorAddress/SchemeOperatorPostalAddress/${index}`,
        streetPresent: typeof getPath(entry, ["StreetAddress"]) === "string" && Boolean(firstString(getPath(entry, ["StreetAddress"]))),
        countryPresent: typeof getPath(entry, ["Country"]) === "string" && Boolean(firstString(getPath(entry, ["Country"]))),
      })),
      electronicUris: electronic.map((entry, index) => ({
        path: `/LoTE/ListAndSchemeInformation/SchemeOperatorAddress/SchemeOperatorElectronicAddress/${index}/uriValue`,
        value: getPath(entry, ["uriValue"]),
      })),
    },
    policy: {
      present: fields.PolicyOrLegalNotice.present,
      policyPointerCount: policyEntries.filter((entry) => getPath(entry, ["LoTEPolicy"]) !== undefined).length,
      legalNoticeCount: policyEntries.filter((entry) => getPath(entry, ["LoTELegalNotice"]) !== undefined).length,
      unknownEntryCount: policyEntries.filter((entry) =>
        getPath(entry, ["LoTEPolicy"]) === undefined && getPath(entry, ["LoTELegalNotice"]) === undefined).length,
    },
    historyPeriod: info.HistoricalInformationPeriod,
    pointers: pointerEntries.map((pointer, pointerIndex) => ({
      path: `/LoTE/ListAndSchemeInformation/PointersToOtherLoTE/${pointerIndex}`,
      location: getPath(pointer, ["LoTELocation"]),
      identityCount: asArray(getPath(pointer, ["ServiceDigitalIdentities"])).length,
      qualifiers: asArray(getPath(pointer, ["LoTEQualifiers"])).map((qualifier, qualifierIndex) => ({
        path: `/LoTE/ListAndSchemeInformation/PointersToOtherLoTE/${pointerIndex}/LoTEQualifiers/${qualifierIndex}`,
        typePresent: Boolean(firstString(getPath(qualifier, ["LoTEType"]))),
        operatorNamePresent: asArray(getPath(qualifier, ["SchemeOperatorName"])).length > 0,
        mimeTypePresent: Boolean(firstString(getPath(qualifier, ["MimeType"]))),
      })),
    })),
    issueDateTime: info.ListIssueDateTime,
    nextUpdate: { present: fields.NextUpdate.present, value: info.NextUpdate },
    serviceStatuses: collectJsonPropertyValues(loteValue, "ServiceStatus"),
    distributionPoints: { present: fields.DistributionPoints.present, values: asArray(info.DistributionPoints) },
    extensions: {
      present: fields.SchemeExtensions.present,
      values: extensionEntries.map((extension, index) => ({
        path: `/LoTE/ListAndSchemeInformation/SchemeExtensions/${index}`,
        critical: getPath(extension, ["Critical"]),
        identifier: jsonExtensionIdentifier(extension),
        recognized: false,
      })),
    },
    assessmentDate,
  };
}

function collectJsonPropertyValues(value: unknown, property: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap((entry) => collectJsonPropertyValues(entry, property));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    ...(key === property ? [entry] : []),
    ...collectJsonPropertyValues(entry, property),
  ]);
}

function jsonExtensionIdentifier(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const property of ["id", "type", "name", "$type"]) {
    if (typeof value[property] === "string") return value[property];
  }
  return Object.keys(value).find((property) => property !== "Critical");
}

function pointerIdentityCheck(pointers: unknown[]): CheckResult {
  if (pointers.length === 0) {
    return check("json_lote.pointers.service_digital_identities", "not_applicable", "info", "ServiceDigitalIdentities are not applicable because there are no pointers.");
  }
  const missing = pointers
    .map((pointer, index) => ({ index: index + 1, present: hasServiceDigitalIdentities(pointer) }))
    .filter((pointer) => !pointer.present)
    .map((pointer) => pointer.index);
  return check(
    "json_lote.pointers.service_digital_identities",
    missing.length === 0 ? "pass" : "warn",
    missing.length === 0 ? "info" : "warning",
    missing.length === 0 ? "All pointers contain ServiceDigitalIdentities." : "One or more pointers are missing ServiceDigitalIdentities.",
    { pointerCount: pointers.length, missingPointerIndexes: missing },
  );
}

function hasServiceDigitalIdentities(pointer: unknown): boolean {
  return asArray(getPath(pointer, ["ServiceDigitalIdentities"])).length > 0;
}

function countTrustedEntityServices(entities: unknown[]): number {
  return entities.reduce<number>((count, entity) => count + asArray(getPath(entity, ["TrustedEntityServices"])).length, 0);
}

function stringValues(value: unknown): string[] {
  return asArray(value).flatMap((item) => firstString(item) ?? []);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

const JSON_URI_PROPERTIES = new Set([
  "LoTEType",
  "StatusDeterminationApproach",
  "LoTELocation",
  "encoding",
  "uriValue",
  "ServiceTypeIdentifier",
  "ServiceStatus",
  "ServiceType",
  "ServiceUniqueIdentifier",
  "AssociatedBodyTypeIdentifier",
]);
const JSON_URI_ARRAY_PROPERTIES = new Set(["DistributionPoints"]);
const JSON_DATE_TIME_PROPERTIES = new Set(["ListIssueDateTime", "NextUpdate", "StatusStartingTime"]);
const JSON_COUNTRY_PROPERTIES = new Set(["Country", "SchemeTerritory"]);

function collectJsonSyntaxInputs(value: unknown): {
  uris: LocatedSyntaxValue[];
  dateTimes: LocatedSyntaxValue[];
  countries: LocatedSyntaxValue[];
  multilingual: LocatedMultilingualSet[];
} {
  const uris: LocatedSyntaxValue[] = [];
  const dateTimes: LocatedSyntaxValue[] = [];
  const countries: LocatedSyntaxValue[] = [];
  const multilingual: LocatedMultilingualSet[] = [];

  function visit(current: unknown, path: string): void {
    if (Array.isArray(current)) {
      const multilingualEntries = current.filter(isLanguageBearingRecord);
      if (multilingualEntries.length > 0) {
        multilingual.push({
          path,
          values: multilingualEntries.map((entry) => ({
            language: entry.lang,
            value: multilingualContent(entry),
          })),
        });
      }
      current.forEach((entry, index) => visit(entry, `${path}/${index}`));
      return;
    }
    if (!isRecord(current)) return;
    for (const [property, propertyValue] of Object.entries(current)) {
      const propertyPath = `${path}/${escapeJsonPointer(property)}`;
      if (JSON_URI_PROPERTIES.has(property)) uris.push({ path: propertyPath, value: propertyValue });
      if (JSON_DATE_TIME_PROPERTIES.has(property) && !(property === "NextUpdate" && propertyValue === null)) {
        dateTimes.push({ path: propertyPath, value: propertyValue });
      }
      if (JSON_COUNTRY_PROPERTIES.has(property)) countries.push({ path: propertyPath, value: propertyValue });
      if (JSON_URI_ARRAY_PROPERTIES.has(property) && Array.isArray(propertyValue)) {
        propertyValue.forEach((entry, index) => uris.push({ path: `${propertyPath}/${index}`, value: entry }));
      }
      visit(propertyValue, propertyPath);
    }
  }

  visit(value, "");
  return { uris, dateTimes, countries, multilingual };
}

function isLanguageBearingRecord(value: unknown): value is Record<string, unknown> & { lang: unknown } {
  return isRecord(value) && Object.hasOwn(value, "lang");
}

function multilingualContent(value: Record<string, unknown>): unknown {
  if (Object.hasOwn(value, "value")) return value.value;
  if (Object.hasOwn(value, "uriValue")) return value.uriValue;
  const addressParts = Object.entries(value)
    .filter(([property, entry]) => property !== "lang" && typeof entry === "string")
    .map(([, entry]) => entry as string);
  return addressParts.length > 0 ? addressParts.join(" ") : undefined;
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function addRequiredJsonCheck(
  checks: CheckResult[],
  id: string,
  ok: boolean,
  message: string,
  severity: "error" | "critical" = "error",
): void {
  checks.push(check(id, ok ? "pass" : "fail", ok ? "info" : severity, message));
}

function addOptionalJsonCheck(checks: CheckResult[], id: string, present: boolean, message: string): void {
  checks.push(check(
    id,
    present ? "pass" : "not_applicable",
    "info",
    present ? message : `${message.replace(/ is present\.$/, "")} is optional and absent in the base binding.`,
  ));
}

function check(
  id: string,
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): CheckResult {
  const category: CheckResult["category"] = id.includes("dates")
    ? "dates"
    : id.includes("schema")
      ? "schema"
      : id.includes("compatibility") || id.includes("root") || id.includes("list_and_scheme")
        ? "structure"
        : "profile";
  return { id, category, status, severity, message, evidence };
}
