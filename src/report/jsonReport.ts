import type { AuditReport, TrustedListAuditResult } from "../types.js";

export function buildAuditReport(args: {
  generatedAt: string;
  input: AuditReport["input"];
  lotl: AuditReport["lotl"];
  results: TrustedListAuditResult[];
  version: string;
}): AuditReport {
  const results = args.results;
  return {
    schemaVersion: 2,
    tool: { name: "we-build-tl-audit", version: args.version },
    generatedAt: args.generatedAt,
    input: args.input,
    lotl: args.lotl,
    summary: {
      totalPointers: results.length,
      fetched: results.filter((r) => r.fetch.attempted && r.fetch.ok).length,
      fetchFailed: results.filter((r) => r.fetch.attempted && !r.fetch.ok).length,
      xmlArtifacts: results.filter((r) => r.detected.format === "xml").length,
      jsonArtifacts: results.filter((r) => r.detected.format === "json").length,
      unknownArtifacts: results.filter((r) => ["unknown", "text", "empty", "html"].includes(r.detected.format)).length,
      ts119612: {
        conformant: countLevel(results, "conformant"),
        partiallyConformant: countLevel(results, "partially_conformant"),
        nonConformant: countLevel(results, "non_conformant"),
        notApplicable: countLevel(results, "not_applicable"),
        notChecked: countLevel(results, "not_checked"),
        parseFailed: countLevel(results, "parse_failed"),
      },
    },
    results,
  };
}

function countLevel(results: TrustedListAuditResult[], level: string): number {
  return results.filter((result) => result.ts119612.conformanceLevel === level).length;
}
