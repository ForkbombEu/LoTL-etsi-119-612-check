import { getPath, isRecord, numberValue, asArray, firstString } from "../lotl.js";
import type { CheckResult, TrustedListAuditResult } from "../types.js";

const JSON_LOTE_REASON =
  "Artifact is JSON LoTE/LoTL-style. ETSI TS 119 612 is XML Trusted List format; this artifact should be assessed under implemented TS 119 602-style / JSON LoTE checks and applicable WE BUILD profile checks.";

export function assessJsonLote(
  parsed: unknown,
  includeChecks: boolean,
  assessmentDate = new Date(),
): Pick<TrustedListAuditResult, "ts119612" | "extracted"> {
  const info = getPath(parsed, ["LoTE", "ListAndSchemeInformation"]);
  const pointers = asArray(getPath(info, ["PointersToOtherLoTE"]));
  const trustedEntities = asArray(getPath(parsed, ["LoTE", "TrustedEntitiesList", "TrustServiceProvider"]));
  const signature = getPath(parsed, ["signature"]) ?? getPath(parsed, ["LoTE", "signature"]) ?? getPath(parsed, ["LoTE", "Signature"]);
  const issueDateTime = firstString(getPath(info, ["ListIssueDateTime"]));
  const nextUpdate = firstString(getPath(info, ["NextUpdate"]));
  const checks: CheckResult[] = [
    check("profile.ts119612_applicability", "not_applicable", "info", JSON_LOTE_REASON),
  ];

  if (includeChecks) {
    addJsonCheck(checks, "json_lote.root", Boolean(getPath(parsed, ["LoTE"])), "JSON root contains LoTE.");
    addJsonCheck(checks, "json_lote.list_and_scheme_information", isRecord(info), "LoTE.ListAndSchemeInformation exists.");
    addJsonCheck(checks, "json_lote.version_identifier", Boolean(firstString(getPath(info, ["LoTEVersionIdentifier"]))), "LoTEVersionIdentifier exists.");
    addJsonCheck(checks, "json_lote.sequence_number", numberValue(getPath(info, ["LoTESequenceNumber"])) !== undefined, "LoTESequenceNumber exists.");
    addJsonCheck(checks, "json_lote.type", Boolean(firstString(getPath(info, ["LoTEType"]))), "LoTEType exists.");
    addJsonCheck(checks, "json_lote.scheme_operator_name", Boolean(firstString(getPath(info, ["SchemeOperatorName"]))), "SchemeOperatorName exists.");
    addJsonCheck(checks, "json_lote.scheme_information_uri", Boolean(firstString(getPath(info, ["SchemeInformationURI"]))), "SchemeInformationURI exists.");
    addJsonCheck(checks, "json_lote.status_determination_approach", Boolean(firstString(getPath(info, ["StatusDeterminationApproach"]))), "StatusDeterminationApproach exists.");
    addJsonCheck(checks, "json_lote.scheme_territory", Boolean(firstString(getPath(info, ["SchemeTerritory"]))), "SchemeTerritory exists.");
    addJsonCheck(checks, "json_lote.list_issue_date_time", Boolean(issueDateTime), "ListIssueDateTime exists.");
    addJsonCheck(checks, "json_lote.next_update", Boolean(nextUpdate), "NextUpdate exists.");
    addJsonCheck(checks, "json_lote.distribution_points", Boolean(getPath(info, ["DistributionPoints"])), "DistributionPoints exists.");
    checks.push(
      check("json_lote.pointers.count", "pass", "info", "PointersToOtherLoTE entries counted.", pointers.length),
      pointerIdentityCheck(pointers),
      check(
        "json_lote.signature_object_present",
        isJsonObject(signature) ? "pass" : "warn",
        isJsonObject(signature) ? "info" : "warning",
        isJsonObject(signature) ? "JSON signature object is present." : "JSON signature object is absent.",
      ),
      ...dateChecks(issueDateTime, nextUpdate, assessmentDate),
    );
  }

  return {
    ts119612: {
      applicable: false,
      conformanceLevel: "not_applicable",
      score: null,
      checks,
      mandatoryFailures: [],
      warnings: checks.filter((check) => check.status === "warn" || check.status === "not_checked").map((check) => `${check.id}: ${check.message}`),
    },
    extracted: {
      schemeOperatorName: [firstString(getPath(info, ["SchemeOperatorName"]))].filter((v): v is string => Boolean(v)),
      schemeName: [firstString(getPath(info, ["SchemeName"]))].filter((v): v is string => Boolean(v)),
      schemeTerritory: firstString(getPath(info, ["SchemeTerritory"])),
      statusDeterminationApproach: firstString(getPath(info, ["StatusDeterminationApproach"])),
      listIssueDateTime: issueDateTime,
      nextUpdate,
      distributionPoints: stringValues(getPath(info, ["DistributionPoints"])),
      jsonLote: {
        assessmentProfile: "TS 119 602-style / JSON LoTE checks (not full normative conformance)",
        LoTEVersionIdentifier: firstString(getPath(info, ["LoTEVersionIdentifier"])),
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
        PointersToOtherLoTECount: pointers.length,
        pointersWithServiceDigitalIdentities: pointers.filter(hasServiceDigitalIdentities).length,
        signatureObjectPresent: isJsonObject(signature),
      },
    },
  };
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
    return check("json_lote.pointers.service_digital_identities", "not_checked", "info", "ServiceDigitalIdentities presence was not checked because there are no pointers.");
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

function addJsonCheck(checks: CheckResult[], id: string, ok: boolean, message: string): void {
  checks.push(check(id, ok ? "pass" : "warn", ok ? "info" : "warning", message));
}

function check(
  id: string,
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): CheckResult {
  return { id, category: id.includes("dates") ? "dates" : "profile", status, severity, message, evidence };
}
