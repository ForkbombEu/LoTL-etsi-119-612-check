import type { AuditReport, CheckResult, TrustedListAuditResult } from "../types.js";

export function renderMarkdownReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push("# WE BUILD Trusted List Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
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
  lines.push("## Summary");
  lines.push("");
  lines.push("| # | Location | Declared type | Declared MIME | Detected format | TS 119 612 level | Critical failures | Warnings |");
  lines.push("|---:|---|---|---|---|---|---:|---:|");
  for (const result of report.results) {
    const critical = result.ts119612.checks.filter((c) => c.status === "fail" && c.severity === "critical").length;
    const warnings = result.ts119612.checks.filter((c) => c.status === "warn" || c.status === "not_checked").length;
    lines.push(
      `| ${result.index} | ${escapeCell(result.location)} | ${escapeCell(value(result.declared.loteType))} | ${escapeCell(value(result.declared.mimeType))} | ${result.detected.format} | ${result.ts119612.conformanceLevel} | ${critical} | ${warnings} |`,
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
  lines.push(`- Declared LoTE type: ${value(result.declared.loteType)}`);
  lines.push(`- Declared MIME type: ${value(result.declared.mimeType)}`);
  lines.push(`- Scheme operator: ${value(result.declared.schemeOperatorName)}`);
  lines.push(`- Scheme territory: ${value(result.declared.schemeTerritory)}`);
  lines.push(`- Fetch status: ${result.fetch.attempted ? fetchStatus(result) : "not attempted"}`);
  lines.push(`- Detected artifact: ${result.detected.artifactKind} (${result.detected.format})`);
  lines.push(`- SHA-256: ${value(result.fetch.sha256)}`);
  lines.push(`- TS 119 612 applicability: ${result.ts119612.applicable ? "applicable" : "not applicable"}`);
  lines.push(`- Conformance level: ${result.ts119612.conformanceLevel}`);
  lines.push(`- Score: ${value(result.ts119612.score)}`);
  lines.push("");
  renderChecks(lines, "Passed checks", result.ts119612.checks.filter((c) => c.status === "pass"));
  renderChecks(lines, "Failures", result.ts119612.checks.filter((c) => c.status === "fail"));
  renderChecks(lines, "Warnings", result.ts119612.checks.filter((c) => c.status === "warn" || c.status === "not_checked"));
  renderMetadata(lines, result);
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
    lines.push(`- **${check.id}** (${check.severity}): ${check.message}${evidence}`);
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
