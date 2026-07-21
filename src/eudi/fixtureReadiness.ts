import { tryCertificateFromBase64 } from "../certs.js";
import { asArray, getPath, isRecord } from "../lotl.js";
import type { ParsedLotl } from "../lotl.js";
import type { CheckResult, FixtureReadiness, TrustedListAuditResult } from "../types.js";
import { assessCertificateChain, type CertificateChainAssessment } from "./certificateChain.js";

export interface FixtureReadinessInput {
  source: string;
  lotl: ParsedLotl;
  results: TrustedListAuditResult[];
  weBuildRoleCounts: Record<string, number>;
  weBuildPointerConsistency: {
    declaredMimeMismatches: number;
  };
  rpacChain?: string | string[];
  assessmentDate?: Date;
}

export function assessFixtureReadiness(input: FixtureReadinessInput): FixtureReadiness {
  const checks: CheckResult[] = [];
  const caveats: string[] = [];
  const fetched = input.results.filter((result) => result.fetch.ok);
  checks.push(check("fixture_readiness.source_reachable", fetched.length > 0 ? "pass" : "warn", fetched.length > 0 ? "info" : "warning", fetched.length > 0 ? "At least one referenced artifact was fetched successfully." : "No referenced artifact was fetched successfully; fixture readiness cannot be established."));

  const recognizedArtifacts = input.results.filter((result) => result.detected.artifactKind === "ts119612_xml_tsl" || result.detected.artifactKind === "ts119612_xml_lotl" || result.detected.artifactKind === "xml_lote" || result.detected.artifactKind === "json_lote" || result.detected.artifactKind === "json_lotl");
  checks.push(check("fixture_readiness.artifact_type_detected", recognizedArtifacts.length > 0 ? "pass" : "warn", recognizedArtifacts.length > 0 ? "info" : "warning", recognizedArtifacts.length > 0 ? "Recognized TL/LoTE artifact types were detected." : "No recognized TL/LoTE artifact type was detected.", recognizedArtifacts.map((result) => result.detected.artifactKind)));

  checkAssessmentCoverage(checks, input.results, "xml", "fixture_readiness.ts119612_checks_run", "TS 119 612 XML checks");
  checkAssessmentCoverage(checks, input.results, "json", "fixture_readiness.json_lote_checks_run", "JSON LoTE checks");

  const accessRoleCount = input.weBuildRoleCounts.wrpac_provider ?? 0;
  checks.push(check("fixture_readiness.access_ca_or_wrpac_role_present", accessRoleCount > 0 ? "pass" : "warn", accessRoleCount > 0 ? "info" : "warning", accessRoleCount > 0 ? "A WE BUILD WRPAC/Access CA provider role is present." : "No WE BUILD WRPAC/Access CA provider role was identified.", accessRoleCount));

  const anchors = extractPointerCertificates(input.lotl, input.assessmentDate ?? new Date());
  checks.push(check("fixture_readiness.trust_anchor_extractable", anchors.length > 0 ? "pass" : "warn", anchors.length > 0 ? "info" : "warning", anchors.length > 0 ? "Parseable pointer certificate material is available as candidate trust-anchor evidence." : "No parseable pointer certificate material is available as candidate trust-anchor evidence.", anchors.length));

  const signingCertificates = input.results.flatMap((result) => result.extracted?.certificates?.filter((certificate) => certificate.source === "xml_signature") ?? []);
  checks.push(check("fixture_readiness.signing_certificate_evidence", signingCertificates.length > 0 ? "pass" : "warn", signingCertificates.length > 0 ? "info" : "warning", signingCertificates.length > 0 ? "Signing certificate evidence is present in fetched XML artifacts." : "No parsed XML signing certificate evidence is present.", signingCertificates.length));

  const expired = input.results.flatMap((result) => [
    ...result.ts119612.checks,
    ...result.ts119602.checks,
  ].filter((check) => check.id === "dates.next_update_expired" || check.id === "json_lote.dates.next_update_expired").filter((check) => check.status === "warn"));
  checks.push(check("fixture_readiness.next_update_current", expired.length === 0 && recognizedArtifacts.length > 0 ? "pass" : "warn", expired.length === 0 && recognizedArtifacts.length > 0 ? "info" : "warning", expired.length === 0 && recognizedArtifacts.length > 0 ? "Recognized artifacts have no reported expired NextUpdate." : "One or more artifacts are expired or no recognized artifact was available.", expired.map((check) => check.id)));

  const mimeMismatches = input.weBuildPointerConsistency.declaredMimeMismatches;
  checks.push(check("fixture_readiness.mime_type_consistency", mimeMismatches === 0 ? "pass" : "warn", mimeMismatches === 0 ? "info" : "warning", mimeMismatches === 0 ? "No WE BUILD declared-MIME/detected-format mismatches were reported." : "One or more WE BUILD declared-MIME/detected-format mismatches were reported.", mimeMismatches));

  let chainAssessment: CertificateChainAssessment | undefined;
  if (input.rpacChain) {
    chainAssessment = assessCertificateChain({
      chain: input.rpacChain,
      trustAnchors: anchors,
      declaredRole: "access_ca_or_wrpac_provider",
      assessmentDate: input.assessmentDate,
    });
    checks.push(check("fixture_readiness.rpac_chain_assessed", "pass", "info", "An RPAC/WRPAC chain was supplied and assessed against candidate pointer trust anchors.", { chainStructurallyValid: chainAssessment.chainStructurallyValid, trustedByTlLote: chainAssessment.trustedByTlLote }));
  } else {
    checks.push(check("fixture_readiness.rpac_chain_assessed", "not_checked", "info", "No RPAC/WRPAC chain was supplied; optional chain assessment was not run."));
  }

  const required = checks.filter((check) => ["fixture_readiness.source_reachable", "fixture_readiness.artifact_type_detected", "fixture_readiness.access_ca_or_wrpac_role_present", "fixture_readiness.trust_anchor_extractable", "fixture_readiness.next_update_current", "fixture_readiness.mime_type_consistency"].includes(check.id));
  const failures = required.filter((check) => check.status !== "pass");
  const usableForWalletTrustFixture = failures.length === 0;
  if (!usableForWalletTrustFixture) caveats.push(...failures.map((check) => `${check.id}: ${check.message}`));
  if (!chainAssessment) caveats.push("No RPAC/WRPAC chain was supplied, so end-entity chaining to an Access CA was not assessed.");
  if (chainAssessment && !chainAssessment.trustedByTlLote) caveats.push("The supplied RPAC/WRPAC chain did not match a candidate pointer trust anchor.");
  return {
    usableForWalletTrustFixture,
    verdict: usableForWalletTrustFixture ? chainAssessment?.trustedByTlLote === false ? "partially_ready" : "ready" : recognizedArtifacts.length === 0 ? "not_checked" : "not_ready",
    checks,
    caveats,
    rpacChain: chainAssessment ? { chainStructurallyValid: chainAssessment.chainStructurallyValid, trustedByTlLote: chainAssessment.trustedByTlLote } : undefined,
  };
}

function checkAssessmentCoverage(checks: CheckResult[], results: TrustedListAuditResult[], format: "xml" | "json", id: string, label: string): void {
  const artifacts = results.filter((result) => result.detected.format === format);
  if (artifacts.length === 0) {
    checks.push(check(id, "not_checked", "info", `${label} were not run because no ${format.toUpperCase()} artifacts were detected.`));
    return;
  }
  const ran = artifacts.every((result) => format === "json"
    ? result.ts119602.checks.some((check) => check.id.startsWith("json_lote."))
    : result.ts119612.checks.some((check) => check.id === "parse.xml"));
  checks.push(check(id, ran ? "pass" : "warn", ran ? "info" : "warning", ran ? `${label} ran for detected ${format.toUpperCase()} artifacts.` : `${label} did not run for every detected ${format.toUpperCase()} artifact.`, artifacts.length));
}

function extractPointerCertificates(lotl: ParsedLotl, assessmentDate: Date): string[] {
  const values: string[] = [];
  for (const pointer of lotl.pointers) {
    for (const identity of asArray(getPath(pointer.raw, ["ServiceDigitalIdentities"]))) visit(identity, values);
  }
  return values.filter((value) => Boolean(tryCertificateFromBase64(value, "pointer", assessmentDate)));
}

function visit(value: unknown, values: string[], certificateKey = false): void {
  if (typeof value === "string") {
    if (certificateKey && value.length > 100) values.push(value);
    return;
  }
  if (Array.isArray(value)) { value.forEach((item) => visit(item, values, certificateKey)); return; }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) visit(nested, values, certificateKey || /certificate/i.test(key));
}

function check(id: string, status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult {
  return { id, category: "profile", status, severity, message, evidence };
}
