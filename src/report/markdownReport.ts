import type { AuditReport, CheckResult, TrustedListAuditResult } from "../types.js";

export function renderMarkdownReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push("# WE BUILD Trusted List Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Report schema: v${report.schemaVersion}`);
  lines.push(`Input: ${report.input.source}`);
  lines.push("");
  lines.push("## LoTL summary");
  lines.push("");
  lines.push(`- Scheme operator: ${value(report.lotl.schemeOperatorName)}`);
  lines.push(`- Scheme name: ${value(report.lotl.schemeName)}`);
  lines.push(`- LoTE type: ${value(report.lotl.loteType)}`);
  lines.push(`- Sequence number: ${value(report.lotl.sequenceNumber)}`);
  lines.push(`- Issue date: ${value(report.lotl.issueDateTime)}`);
  lines.push(`- Next update: ${value(report.lotl.nextUpdate)}`);
  lines.push(`- Total pointers: ${report.lotl.pointerCount}`);
  lines.push(`- Unique locations: ${report.lotl.uniqueLocationCount}`);
  lines.push("");
  lines.push("## WE BUILD profile");
  lines.push("");
  lines.push(`- Recognized: ${report.weBuildProfile.recognized ? "yes" : "no"}`);
  lines.push(`- Recognition: ${report.weBuildProfile.recognitionReasons.join("; ") || "none"}`);
  lines.push(`- List types: ${countSummary(report.weBuildProfile.listTypeCounts)}`);
  lines.push(`- Roles: ${countSummary(report.weBuildProfile.roleCounts)}`);
  lines.push(`- MIME mismatches: ${report.weBuildProfile.pointerConsistency.declaredMimeMismatches}; duplicate pointers: ${report.weBuildProfile.pointerConsistency.duplicateLocations}; missing ServiceDigitalIdentities: ${report.weBuildProfile.pointerConsistency.pointersMissingServiceDigitalIdentities}; missing LoTEQualifiers: ${report.weBuildProfile.pointerConsistency.pointersMissingQualifiers}`);
  lines.push("");
  lines.push("## Fixture readiness");
  lines.push("");
  lines.push(`- Can this trust-list bundle be used as a wallet trust fixture? ${report.fixtureReadiness.usableForWalletTrustFixture ? "Yes" : "No"}`);
  lines.push(`- Verdict: ${report.fixtureReadiness.verdict}`);
  if (report.fixtureReadiness.rpacChain) {
    lines.push(`- RPAC/WRPAC chain: structurally valid=${report.fixtureReadiness.rpacChain.chainStructurallyValid}; trusted by candidate TL/LoTE anchor=${report.fixtureReadiness.rpacChain.trustedByTlLote}`);
  }
  lines.push(`- Caveats: ${report.fixtureReadiness.caveats.join("; ") || "none"}`);
  lines.push("");
  for (const fixtureCheck of report.fixtureReadiness.checks) {
    const evidence = fixtureCheck.evidence === undefined ? "" : ` Evidence: \`${shortJson(fixtureCheck.evidence)}\``;
    lines.push(`- **${fixtureCheck.id}** (${fixtureCheck.status}): ${fixtureCheck.message}${evidence}`);
  }
  lines.push("");
  lines.push("## FCAF trusted_authorities fixture readiness");
  lines.push("");
  lines.push("| Scenario | Status | Missing prerequisites |");
  lines.push("|---|---|---|");
  for (const scenario of report.fcafTrustedAuthorities.scenarios) {
    lines.push(`| ${scenario.id} | ${scenario.status} | ${escapeCell(scenario.missingPrerequisites.join("; ") || "none")} |`);
  }
  lines.push("");
  lines.push("## Negative fixture descriptors");
  lines.push("");
  lines.push("| Descriptor | Status | Missing prerequisites |");
  lines.push("|---|---|---|");
  for (const descriptor of report.negativeFixtureDescriptors) {
    lines.push(`| ${descriptor.id} | ${descriptor.status} | ${escapeCell(descriptor.missingPrerequisites.join("; ") || "none")} |`);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| # | Artifact ID | Source | Detected artifact | TS 119 612 | TS 119 602 | WE BUILD | EUDI role | TS 119 612 level | TS 119 602 level |");
  lines.push("|---:|---|---|---|---|---|---|---|---|---|");
  for (const result of report.results) {
    lines.push(
      `| ${result.index} | ${result.id} | ${escapeCell(result.source)} | ${result.detected.artifactKind} (${result.detected.format}) | ${result.standardApplicability.ts119612} | ${result.standardApplicability.ts119602} | ${result.standardApplicability.weBuildProfile} | ${result.standardApplicability.eudiTrustRole} | ${result.ts119612.conformanceLevel} | ${result.ts119602.conformanceLevel} |`,
    );
  }

  for (const result of report.results) {
    renderResult(lines, result);
  }

  return `${lines.join("\n")}\n`;
}

function renderResult(lines: string[], result: TrustedListAuditResult): void {
  lines.push("");
  lines.push(`## ${result.index}. ${result.location}`);
  lines.push("");
  lines.push(`- Result ID: ${result.id}`);
  lines.push(`- Source: ${result.source}`);
  lines.push(`- Declared LoTE type: ${value(result.declared.loteType)}`);
  lines.push(`- Declared MIME type: ${value(result.declared.mimeType)}`);
  lines.push(`- Scheme operator: ${value(result.declared.schemeOperatorName)}`);
  lines.push(`- Scheme territory: ${value(result.declared.schemeTerritory)}`);
  lines.push(`- Fetch status: ${result.fetch.attempted ? fetchStatus(result) : "not attempted"}`);
  lines.push(`- Detected artifact: ${result.detected.artifactKind} (${result.detected.format})`);
  lines.push(`- TS 119 602 classification: data model=${result.ts119602Classification.dataModel}; binding=${result.ts119602Classification.binding} (${result.ts119602Classification.bindingStatus}); profile=${result.ts119602Classification.profile} (${result.ts119602Classification.profileStatus})`);
  lines.push(`- TS 119 602 classification reasons: ${result.ts119602Classification.reasons.join("; ")}`);
  lines.push(`- SHA-256: ${value(result.fetch.sha256)}`);
  lines.push(`- Standard applicability: TS 119 612=${result.standardApplicability.ts119612}; TS 119 602=${result.standardApplicability.ts119602}; WE BUILD=${result.standardApplicability.weBuildProfile}; EUDI trust role=${result.standardApplicability.eudiTrustRole}`);
  renderReferenceProfile(lines, "EUDI RI TS 119 612 reference profile", result.referenceProfiles.eudiRiTs119612);
  renderReferenceProfile(lines, "WE BUILD TS 119 612 reference profile", result.referenceProfiles.weBuildTs119612);
  renderStandardAssessment(lines, "ETSI TS 119 612", result.ts119612);
  renderStandardAssessment(lines, "ETSI TS 119 602", result.ts119602);
  renderMetadata(lines, result);
  renderCertificateEvidence(lines, result);
}

function renderReferenceProfile(
  lines: string[],
  title: string,
  assessment: TrustedListAuditResult["referenceProfiles"]["eudiRiTs119612"],
): void {
  lines.push("");
  lines.push(`### ${title}`);
  lines.push("");
  lines.push(`- Applicability: ${assessment.applicability}`);
  lines.push(`- Recognized: ${assessment.recognized ? "yes" : "no"}`);
  lines.push(`- Recognition: ${assessment.recognitionReasons.join("; ") || "none"}`);
  lines.push(`- Observed EUDI roles: ${assessment.observedRoles.join(", ") || "none"}`);
  lines.push("");
  renderChecks(lines, "Profile findings", assessment.checks);
}

function renderStandardAssessment(
  lines: string[],
  title: string,
  assessment: TrustedListAuditResult["ts119612"],
): void {
  lines.push("");
  lines.push(`### ${title} assessment`);
  lines.push("");
  lines.push(`- Applicability: ${assessment.applicable ? "applicable" : "not applicable"}`);
  lines.push(`- Conformance level: ${assessment.conformanceLevel}`);
  lines.push(`- Score: ${value(assessment.score)}`);
  lines.push("");
  renderChecks(lines, "Passed checks", assessment.checks.filter((check) => check.status === "pass"));
  renderChecks(lines, "Failures", assessment.checks.filter((check) => check.status === "fail"));
  renderChecks(lines, "Not applicable", assessment.checks.filter((check) => check.status === "not_applicable"));
  renderChecks(
    lines,
    "Warnings and limitations",
    assessment.checks.filter((check) => ["warn", "not_checked", "unsupported", "inconclusive"].includes(check.status)),
  );
}

function renderCertificateEvidence(lines: string[], result: TrustedListAuditResult): void {
  lines.push("### Certificate evidence");
  lines.push("");
  const certificates = result.extracted?.certificates ?? [];
  if (certificates.length === 0) {
    lines.push("- None");
    lines.push("");
    return;
  }
  certificates.forEach((certificate, index) => {
    lines.push(`- ${index + 1}. Source: ${certificate.source}; subject: ${value(certificate.subject)}; issuer: ${value(certificate.issuer)}; serial: ${value(certificate.serialNumber)}; valid from: ${value(certificate.notBefore)}; valid to: ${value(certificate.notAfter)}; valid at assessment: ${value(certificate.validAtAssessmentTime)}; SHA-256: ${value(certificate.fingerprintSha256)}`);
  });
  lines.push("");
}

function renderChecks(lines: string[], title: string, checks: CheckResult[]): void {
  lines.push(`### ${title}`);
  lines.push("");
  if (checks.length === 0) {
    lines.push("- None");
    lines.push("");
    return;
  }
  for (const check of checks) {
    const evidence = check.evidence === undefined ? "" : ` Evidence: \`${shortJson(check.evidence)}\``;
    lines.push(`- **${check.id}** (${check.status}; ${check.severity}): ${check.message}${evidence}`);
  }
  lines.push("");
}

function renderMetadata(lines: string[], result: TrustedListAuditResult): void {
  lines.push("### Extracted metadata");
  lines.push("");
  if (!result.extracted) {
    lines.push("- None");
    lines.push("");
    return;
  }
  const entries: Array<[string, unknown]> = [
    ["TSL version identifier", result.extracted.tslVersionIdentifier],
    ["TSL sequence number", result.extracted.tslSequenceNumber],
    ["TSL type", result.extracted.tslType],
    ["Scheme operator name", result.extracted.schemeOperatorName?.join("; ")],
    ["Scheme name", result.extracted.schemeName?.join("; ")],
    ["Scheme territory", result.extracted.schemeTerritory],
    ["Status determination approach", result.extracted.statusDeterminationApproach],
    ["List issue date", result.extracted.listIssueDateTime],
    ["Next update", result.extracted.nextUpdate],
    ["Distribution points", result.extracted.distributionPoints?.join("; ")],
    ["Trust service providers", result.extracted.trustServiceProviderCount],
    ["Services", result.extracted.serviceCount],
    ["Certificates", result.extracted.certificates?.length],
  ];
  for (const [name, item] of entries) {
    if (item !== undefined && item !== "") lines.push(`- ${name}: ${value(item)}`);
  }
  if (result.extracted.jsonLote) {
    lines.push(`- JSON LoTE metadata: \`${shortJson(result.extracted.jsonLote)}\``);
  }
  lines.push("");
}

function fetchStatus(result: TrustedListAuditResult): string {
  if (!result.fetch.ok) return `failed (${value(result.fetch.error)})`;
  return `ok (${result.fetch.status} ${value(result.fetch.statusText)}, ${value(result.fetch.durationMs)} ms)`;
}

function value(value: unknown): string {
  if (value === undefined || value === null || value === "") return "not available";
  return String(value);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function shortJson(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function countSummary(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  return entries.length === 0 ? "none" : entries.map(([name, count]) => `${name}=${count}`).join(", ");
}
