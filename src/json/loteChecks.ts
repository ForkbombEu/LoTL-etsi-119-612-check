import { getPath, isRecord, numberValue, asArray, firstString } from "../lotl.js";
import type { CheckResult, TrustedListAuditResult } from "../types.js";

const JSON_LOTE_REASON =
  "Artifact is JSON LoTE/LoTL-style. ETSI TS 119 612 is XML Trusted List format; this artifact should be assessed under ETSI TS 119 602 / WE BUILD profile rules instead.";

export function assessJsonLote(
  parsed: unknown,
  includeChecks: boolean,
  assessmentDate = new Date(),
): Pick<TrustedListAuditResult, "ts119612" | "extracted"> {
  const info = getPath(parsed, ["LoTE", "ListAndSchemeInformation"]);
  const checks: CheckResult[] = [
    {
      id: "profile.ts119612_applicability",
      category: "profile",
      status: "not_applicable",
      severity: "info",
      message: JSON_LOTE_REASON,
    },
  ];

  const nextUpdate = firstString(getPath(info, ["NextUpdate"]));
  if (includeChecks) {
    addJsonCheck(checks, "json_lote.root", Boolean(getPath(parsed, ["LoTE"])), "JSON root contains LoTE.");
    addJsonCheck(checks, "json_lote.list_information", isRecord(info), "LoTE.ListAndSchemeInformation exists.");
    addJsonCheck(checks, "json_lote.lote_type", Boolean(firstString(getPath(info, ["LoTEType"]))), "LoTEType exists.");
    addJsonCheck(checks, "json_lote.sequence_number", numberValue(getPath(info, ["LoTESequenceNumber"])) !== undefined, "LoTESequenceNumber exists.");
    addJsonCheck(checks, "json_lote.next_update", Boolean(nextUpdate), "NextUpdate exists.");
    if (nextUpdate) {
      const date = new Date(nextUpdate);
      if (!Number.isNaN(date.getTime()) && assessmentDate > date) {
        checks.push({
          id: "json_lote.next_update_expired",
          category: "dates",
          status: "warn",
          severity: "warning",
          message: "JSON LoTE NextUpdate is before assessment time.",
          evidence: { nextUpdate, assessmentDate: assessmentDate.toISOString() },
        });
      }
    }
  }

  const trustedEntities = asArray(getPath(parsed, ["LoTE", "TrustedEntitiesList", "TrustServiceProvider"]));
  const pointers = asArray(getPath(info, ["PointersToOtherLoTE"]));
  const signature = getPath(parsed, ["signature"]) ?? getPath(parsed, ["LoTE", "signature"]) ?? getPath(parsed, ["LoTE", "Signature"]);

  return {
    ts119612: {
      applicable: false,
      conformanceLevel: "not_applicable",
      score: null,
      checks,
      mandatoryFailures: [],
      warnings: checks.filter((check) => check.status === "warn").map((check) => `${check.id}: ${check.message}`),
    },
    extracted: {
      schemeOperatorName: [firstString(getPath(info, ["SchemeOperatorName"]))].filter((v): v is string => Boolean(v)),
      schemeName: [firstString(getPath(info, ["SchemeName"]))].filter((v): v is string => Boolean(v)),
      schemeTerritory: firstString(getPath(info, ["SchemeTerritory"])),
      listIssueDateTime: firstString(getPath(info, ["ListIssueDateTime"])),
      nextUpdate,
      jsonLote: {
        LoTEType: firstString(getPath(info, ["LoTEType"])),
        LoTESequenceNumber: numberValue(getPath(info, ["LoTESequenceNumber"])),
        SchemeOperatorName: firstString(getPath(info, ["SchemeOperatorName"])),
        SchemeTerritory: firstString(getPath(info, ["SchemeTerritory"])),
        ListIssueDateTime: firstString(getPath(info, ["ListIssueDateTime"])),
        NextUpdate: nextUpdate,
        TrustedEntitiesListCount: trustedEntities.length,
        PointersToOtherLoTECount: pointers.length,
        signatureObjectPresent: isRecord(signature),
      },
    },
  };
}

function addJsonCheck(checks: CheckResult[], id: string, ok: boolean, message: string): void {
  checks.push({
    id,
    category: "profile",
    status: ok ? "pass" : "warn",
    severity: ok ? "info" : "warning",
    message,
  });
}
