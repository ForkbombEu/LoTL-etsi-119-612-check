import { tryCertificateFromBase64 } from "../certs.js";
import { asArray, getPath, isRecord } from "../lotl.js";
import type { ParsedLotl } from "../lotl.js";
import type { CheckResult, TrustedListAuditResult } from "../types.js";

export type WeBuildRole = "wallet_provider" | "pid_provider" | "wrpac_provider" | "wrprc_provider" | "pub_eaa_provider" | "registrar_or_register" | "qeaa_provider" | "unknown";

export interface WeBuildProfileSummary {
  recognized: boolean;
  recognitionReasons: string[];
  listTypeCounts: Record<string, number>;
  roleCounts: Record<string, number>;
  pointerConsistency: {
    declaredMimeMismatches: number;
    duplicateLocations: number;
    pointersMissingServiceDigitalIdentities: number;
    pointersMissingQualifiers: number;
    pointerCertificatesParsed: number;
    pointerCertificatesInvalidAtAssessment: number;
  };
}

const WEBUILD_LOTL_TYPE = "http://uri.etsi.org/19602/LoTLType/EUListOfTrustedLists";

export function assessWeBuildProfile(lotl: ParsedLotl, results: TrustedListAuditResult[], assessmentDate = new Date()): WeBuildProfileSummary {
  const recognitionReasons = recognitionReasonsFor(lotl);
  const summary: WeBuildProfileSummary = {
    recognized: recognitionReasons.length > 0,
    recognitionReasons,
    listTypeCounts: {},
    roleCounts: {},
    pointerConsistency: { declaredMimeMismatches: 0, duplicateLocations: 0, pointersMissingServiceDigitalIdentities: 0, pointersMissingQualifiers: 0, pointerCertificatesParsed: 0, pointerCertificatesInvalidAtAssessment: 0 },
  };
  if (!summary.recognized) return summary;
  for (const pointer of lotl.pointers) {
    const result = results[pointer.index - 1];
    if (!result) continue;
    const classification = classifyWeBuildListType(pointer.declared.loteType, result.detected.artifactKind);
    increment(summary.listTypeCounts, classification.listType);
    increment(summary.roleCounts, classification.role);
    const checks = pointerChecks(pointer, result, lotl.summary.duplicateLocations, summary, assessmentDate, classification);
    result.ts119612.checks.push(...checks);
    result.ts119612.warnings.push(...checks.filter((check) => check.status === "warn" || check.status === "not_checked").map((check) => `${check.id}: ${check.message}`));
  }
  return summary;
}

export function classifyWeBuildListType(loteType: string | undefined, artifactKind?: TrustedListAuditResult["detected"]["artifactKind"]): { listType: string; role: WeBuildRole } {
  const value = loteType ?? "";
  if (/EUWalletProvidersList/i.test(value)) return { listType: "EUWalletProvidersList", role: "wallet_provider" };
  if (/EUPIDProvidersList/i.test(value)) return { listType: "EUPIDProvidersList", role: "pid_provider" };
  if (/EUWRPACProvidersList/i.test(value)) return { listType: "EUWRPACProvidersList", role: "wrpac_provider" };
  if (/EUWRPRCProvidersList/i.test(value)) return { listType: "EUWRPRCProvidersList", role: "wrprc_provider" };
  if (/EUPubEAAProvidersList/i.test(value)) return { listType: "EUPubEAAProvidersList", role: "pub_eaa_provider" };
  if (/EURegistrarsAndRegistersList/i.test(value)) return { listType: "EURegistrarsAndRegistersList", role: "registrar_or_register" };
  if (/EUgeneric|QEAA/i.test(value) || artifactKind === "ts119612_xml_tsl") return { listType: "EUgeneric_or_qeaa_xml_tl", role: "qeaa_provider" };
  return { listType: "unknown", role: "unknown" };
}

function recognitionReasonsFor(lotl: ParsedLotl): string[] {
  const reasons: string[] = [];
  if (lotl.summary.loteType === WEBUILD_LOTL_TYPE) reasons.push("LoTEType matches the WE BUILD WP4 LoTL URI.");
  const metadata = [lotl.summary.schemeOperatorName, lotl.summary.schemeName].filter((value): value is string => Boolean(value)).join(" ");
  if (/WE\s*BUILD/i.test(metadata) && /WP\s*4|WP4/i.test(metadata)) reasons.push("Scheme/operator metadata identifies WE BUILD WP4.");
  return reasons;
}

function pointerChecks(pointer: ParsedLotl["pointers"][number], result: TrustedListAuditResult, duplicateLocations: string[], summary: WeBuildProfileSummary, assessmentDate: Date, classification: ReturnType<typeof classifyWeBuildListType>): CheckResult[] {
  const checks: CheckResult[] = [check("we_build.pointer.list_type", classification.role === "unknown" ? "warn" : "pass", classification.role === "unknown" ? "warning" : "info", classification.role === "unknown" ? "Pointer LoTE type is not in the implemented WE BUILD classification set." : "Pointer LoTE type is classified for the WE BUILD profile.", { loteType: pointer.declared.loteType, listType: classification.listType, role: classification.role })];
  const expectedFormat = declaredFormat(pointer.declared.mimeType);
  if (!expectedFormat || !result.fetch.ok) {
    checks.push(check("we_build.pointer.declared_mime_matches_detected", "not_checked", "info", "Declared MIME consistency was not checked because MIME is absent or the artifact was not fetched."));
  } else {
    const matches = expectedFormat === result.detected.format;
    if (!matches) summary.pointerConsistency.declaredMimeMismatches += 1;
    checks.push(check("we_build.pointer.declared_mime_matches_detected", matches ? "pass" : "warn", matches ? "info" : "warning", matches ? "Declared MIME type matches detected artifact format." : "Declared MIME type does not match detected artifact format.", { declaredMimeType: pointer.declared.mimeType, expectedFormat, detectedFormat: result.detected.format }));
  }
  const duplicate = duplicateLocations.includes(pointer.location);
  if (duplicate) summary.pointerConsistency.duplicateLocations += 1;
  checks.push(check("we_build.pointer.duplicate_location", duplicate ? "warn" : "pass", duplicate ? "warning" : "info", duplicate ? "Pointer location is duplicated in the LoTL." : "Pointer location is unique in the LoTL.", pointer.location));
  const identities = asArray(getPath(pointer.raw, ["ServiceDigitalIdentities"]));
  if (identities.length === 0) summary.pointerConsistency.pointersMissingServiceDigitalIdentities += 1;
  checks.push(check("we_build.pointer.service_digital_identities", identities.length > 0 ? "pass" : "warn", identities.length > 0 ? "info" : "warning", identities.length > 0 ? "Pointer includes ServiceDigitalIdentities." : "Pointer is missing ServiceDigitalIdentities.", identities.length));
  const qualifiers = asArray(getPath(pointer.raw, ["LoTEQualifiers"]));
  if (qualifiers.length === 0) summary.pointerConsistency.pointersMissingQualifiers += 1;
  checks.push(check("we_build.pointer.lote_qualifiers", qualifiers.length > 0 ? "pass" : "warn", qualifiers.length > 0 ? "info" : "warning", qualifiers.length > 0 ? "Pointer includes LoTEQualifiers." : "Pointer is missing LoTEQualifiers.", qualifiers.length));
  const certificates = certificateValues(identities);
  if (certificates.length === 0) {
    checks.push(check("we_build.pointer.certificate_evidence", "not_checked", "info", "Pointer certificate parsing was not checked because no embedded certificate material is present."));
  } else {
    const parsed = certificates.map((certificate) => tryCertificateFromBase64(certificate, "pointer", assessmentDate));
    const parseable = parsed.filter((certificate): certificate is NonNullable<typeof certificate> => Boolean(certificate));
    const invalid = parseable.filter((certificate) => certificate.validAtAssessmentTime === false);
    summary.pointerConsistency.pointerCertificatesParsed += parseable.length;
    summary.pointerConsistency.pointerCertificatesInvalidAtAssessment += invalid.length;
    checks.push(check("we_build.pointer.certificate_evidence", parseable.length === certificates.length && invalid.length === 0 ? "pass" : "warn", parseable.length === certificates.length && invalid.length === 0 ? "info" : "warning", parseable.length === certificates.length ? invalid.length === 0 ? "Pointer certificates parsed and are valid at assessment time." : "Pointer certificates parsed, but one or more are expired or not yet valid." : "One or more pointer certificates could not be parsed.", { present: certificates.length, parsed: parseable.length, invalidAtAssessment: invalid.length, certificates: parseable }));
  }
  return checks;
}

function declaredFormat(mimeType: string | undefined): "xml" | "json" | undefined { if (!mimeType) return undefined; if (/xml/i.test(mimeType)) return "xml"; if (/json/i.test(mimeType)) return "json"; return undefined; }
function certificateValues(identities: unknown[]): string[] { const values: string[] = []; const visit = (value: unknown, certificateKey = false): void => { if (typeof value === "string") { if (certificateKey && value.length > 100) values.push(value); return; } if (Array.isArray(value)) { value.forEach((item) => visit(item, certificateKey)); return; } if (!isRecord(value)) return; for (const [key, nested] of Object.entries(value)) visit(nested, certificateKey || /certificate/i.test(key)); }; identities.forEach((identity) => visit(identity)); return values; }
function increment(counts: Record<string, number>, key: string): void { counts[key] = (counts[key] ?? 0) + 1; }
function check(id: string, status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult { return { id, category: "profile", status, severity, message, evidence }; }
