import type { AuditReport, TrustedListAuditResult } from "../types.js";

export function buildAuditReport(args: {
  generatedAt: string;
  input: AuditReport["input"];
  lotl: AuditReport["lotl"];
  weBuildProfile: AuditReport["weBuildProfile"];
  fixtureReadiness: AuditReport["fixtureReadiness"];
  fcafTrustedAuthorities: AuditReport["fcafTrustedAuthorities"];
  negativeFixtureDescriptors: AuditReport["negativeFixtureDescriptors"];
  results: TrustedListAuditResult[];
  version: string;
}): AuditReport {
  const results = args.results;
  return {
    schemaVersion: 5,
    tool: { name: "we-build-tl-audit", version: args.version },
    generatedAt: args.generatedAt,
    input: args.input,
    lotl: args.lotl,
    weBuildProfile: args.weBuildProfile,
    fixtureReadiness: args.fixtureReadiness,
    fcafTrustedAuthorities: args.fcafTrustedAuthorities,
    negativeFixtureDescriptors: args.negativeFixtureDescriptors,
    summary: {
      totalPointers: results.length,
      fetched: results.filter((r) => r.fetch.attempted && r.fetch.ok).length,
      fetchFailed: results.filter((r) => r.fetch.attempted && !r.fetch.ok).length,
      xmlArtifacts: results.filter((r) => r.detected.format === "xml").length,
      jsonArtifacts: results.filter((r) => r.detected.format === "json").length,
      unknownArtifacts: results.filter((r) => ["unknown", "text", "empty", "html"].includes(r.detected.format)).length,
      ts119612: {
        conformant: countLevel(results, "ts119612", "conformant"),
        partiallyConformant: countLevel(results, "ts119612", "partially_conformant"),
        nonConformant: countLevel(results, "ts119612", "non_conformant"),
        notApplicable: countLevel(results, "ts119612", "not_applicable"),
        notChecked: countLevel(results, "ts119612", "not_checked"),
        parseFailed: countLevel(results, "ts119612", "parse_failed"),
      },
      ts119602: {
        conformant: countLevel(results, "ts119602", "conformant"),
        partiallyConformant: countLevel(results, "ts119602", "partially_conformant"),
        nonConformant: countLevel(results, "ts119602", "non_conformant"),
        notApplicable: countLevel(results, "ts119602", "not_applicable"),
        notChecked: countLevel(results, "ts119602", "not_checked"),
        unsupported: countLevel(results, "ts119602", "unsupported"),
        inconclusive: countLevel(results, "ts119602", "inconclusive"),
        parseFailed: countLevel(results, "ts119602", "parse_failed"),
      },
    },
    results,
  };
}

function countLevel(
  results: TrustedListAuditResult[],
  standard: "ts119612" | "ts119602",
  level: string,
): number {
  return results.filter((result) => result[standard].conformanceLevel === level).length;
}
