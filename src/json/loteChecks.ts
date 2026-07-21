import { getPath, isRecord, numberValue, asArray, firstString } from "../lotl.js";
import { buildStandardAssessment } from "../standards/assessment.js";
import { summarizeTs119602Requirements } from "../standards/ts119602Requirements.js";
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
  const pointers = asArray(getPath(info, ["PointersToOtherLoTE"]));
  const trustedEntities = legacy?.trustedEntities ?? (Array.isArray(officialTrustedEntities) ? officialTrustedEntities : []);
  const signature = getPath(parsed, ["signature"]) ?? getPath(loteValue, ["signature"]) ?? getPath(loteValue, ["Signature"]);
  const issueDateTime = firstString(getPath(info, ["ListIssueDateTime"]));
  const nextUpdate = firstString(getPath(info, ["NextUpdate"]));
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
  addRequiredJsonCheck(checks, "json_lote.next_update", Boolean(nextUpdate), "NextUpdate is present.");
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
    ...dateChecks(issueDateTime, nextUpdate, assessmentDate),
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

function dateChecks(issueValue: string | undefined, nextValue: string | undefined, assessmentDate: Date): CheckResult[] {
  const issue = parseDate(issueValue);
  const next = parseDate(nextValue);
  const checks = [
    check("json_lote.dates.issue_valid", issue ? "pass" : "warn", issue ? "info" : "warning", "ListIssueDateTime is a valid ISO timestamp.", issueValue),
    check("json_lote.dates.next_update_valid", next ? "pass" : "warn", next ? "info" : "warning", "NextUpdate is a valid ISO timestamp.", nextValue),
  ];
  if (!issue || !next) {
    checks.push(
      check("json_lote.dates.next_after_issue", "not_checked", "info", "NextUpdate ordering was not checked because one or both timestamps are invalid or absent."),
      check("json_lote.dates.update_period_days", "not_checked", "info", "Update period was not checked because one or both timestamps are invalid or absent."),
    );
    return checks;
  }
  checks.push(
    check("json_lote.dates.next_after_issue", next > issue ? "pass" : "warn", next > issue ? "info" : "warning", "NextUpdate is after ListIssueDateTime.", { issue: issue.toISOString(), nextUpdate: next.toISOString() }),
  );
  const days = Math.round((next.getTime() - issue.getTime()) / 86_400_000);
  checks.push(check("json_lote.dates.update_period_days", days <= 183 ? "pass" : "warn", days <= 183 ? "info" : "warning", "Update period is not longer than six months.", days));
  if (assessmentDate > next) {
    checks.push(check("json_lote.dates.next_update_expired", "warn", "warning", "JSON LoTE NextUpdate is before assessment time.", { nextUpdate: next.toISOString(), assessmentDate: assessmentDate.toISOString() }));
  }
  return checks;
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

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
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
