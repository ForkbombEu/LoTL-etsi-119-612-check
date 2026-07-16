import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { detectArtifact } from "./detect.js";
import { fetchArtifact, saveFetchedArtifact } from "./fetcher.js";
import { loadInput } from "./input.js";
import { assessJsonLote } from "./json/loteChecks.js";
import { parseLotlJson } from "./lotl.js";
import { buildAuditReport } from "./report/jsonReport.js";
import { renderMarkdownReport } from "./report/markdownReport.js";
import type { AuditReport, CheckResult, CliOptions, PointerInfo, TrustedListAuditResult } from "./types.js";
import { assessTs119612Xml } from "./xml/ts119612Checks.js";

export async function runAudit(options: CliOptions, version: string): Promise<AuditReport> {
  const input = await loadInput(options.input, options.timeoutMs);
  const parsedLotl = parseLotlJson(input.text);
  const generatedAt = new Date().toISOString();

  const results = await mapConcurrent(parsedLotl.pointers, options.concurrency, (pointer) =>
    auditPointer(pointer, options),
  );

  const report = buildAuditReport({
    generatedAt,
    input: {
      source: options.input,
      kind: input.kind,
      sha256: input.sha256,
    },
    lotl: parsedLotl.summary,
    results,
    version,
  });

  await mkdir(options.outDir, { recursive: true });
  await writeFile(join(options.outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(options.outDir, "report.md"), renderMarkdownReport(report));
  return report;
}

async function auditPointer(pointer: PointerInfo, options: CliOptions): Promise<TrustedListAuditResult> {
  const base: TrustedListAuditResult = {
    index: pointer.index,
    location: pointer.location,
    declared: pointer.declared,
    fetch: {
      attempted: false,
      ok: false,
    },
    detected: {
      format: "unknown",
      artifactKind: "unknown",
    },
    ts119612: {
      applicable: false,
      conformanceLevel: "not_checked",
      score: null,
      checks: [],
      mandatoryFailures: [],
      warnings: [],
    },
  };

  if (!options.fetch) {
    base.ts119612.checks.push(check("fetch.not_attempted", "fetch", "not_checked", "warning", "Fetch disabled by --no-fetch; referenced location was not assessed."));
    base.ts119612.warnings.push("fetch.not_attempted: Fetch disabled by --no-fetch; referenced location was not assessed.");
    return base;
  }

  const fetched = await fetchArtifact(pointer.location, options.timeoutMs);
  base.fetch = fetched.fetch;
  base.ts119612.checks.push(
    check("fetch.attempted", "fetch", "pass", "info", "Fetch attempted."),
    check("fetch.http_ok", "fetch", fetched.fetch.ok ? "pass" : "fail", fetched.fetch.ok ? "info" : "critical", "HTTP fetch returned a 2xx response.", fetched.fetch.status),
    check("fetch.non_empty", "fetch", fetched.bytes && fetched.bytes.length > 0 ? "pass" : "fail", fetched.bytes && fetched.bytes.length > 0 ? "info" : "critical", "Fetched content is non-empty.", fetched.fetch.bytes),
  );

  if (!fetched.fetch.ok || !fetched.bytes) {
    base.ts119612.conformanceLevel = "fetch_failed";
    base.ts119612.mandatoryFailures = base.ts119612.checks
      .filter((c) => c.status === "fail")
      .map((c) => `${c.id}: ${c.message}`);
    return base;
  }

  const detected = detectArtifact(fetched.bytes, fetched.fetch.contentType);
  base.detected = {
    format: detected.format,
    artifactKind: detected.artifactKind,
  };
  await saveFetchedArtifact(options.outDir, pointer.index, pointer.location, fetched.bytes, detected.format);

  if (detected.format === "xml") {
    const assessed = await assessTs119612Xml(fetched.bytes.toString("utf8"), {
      strict: options.strict,
      xsdPath: options.xsd,
    });
    return mergeResult(base, assessed);
  }

  if (detected.format === "json" && detected.artifactKind === "json_lote") {
    const assessed = assessJsonLote(detected.parsedJson, options.includeJsonLoteChecks);
    return mergeResult(base, assessed);
  }

  const reason =
    detected.format === "html"
      ? "Fetched artifact appears to be HTML/error page, not TS 119 612 XML."
      : "Fetched artifact is not a JSON LoTE and not TS 119 612 XML.";
  base.ts119612 = {
    applicable: false,
    conformanceLevel: "not_applicable",
    score: null,
    checks: [
      ...base.ts119612.checks,
      check("profile.ts119612_applicability", "profile", "not_applicable", "info", reason, detected),
    ],
    mandatoryFailures: [],
    warnings: [],
  };
  return base;
}

function mergeResult(
  base: TrustedListAuditResult,
  assessed: Pick<TrustedListAuditResult, "ts119612" | "extracted"> & Partial<Pick<TrustedListAuditResult, "detected">>,
): TrustedListAuditResult {
  const checks = [...base.ts119612.checks, ...assessed.ts119612.checks];
  const mandatoryFailures = [
    ...base.ts119612.mandatoryFailures,
    ...assessed.ts119612.mandatoryFailures,
  ];
  const warnings = [
    ...base.ts119612.warnings,
    ...assessed.ts119612.warnings,
  ];
  return {
    ...base,
    detected: assessed.detected ?? base.detected,
    ts119612: {
      ...assessed.ts119612,
      checks,
      mandatoryFailures,
      warnings,
    },
    extracted: assessed.extracted,
  };
}

function check(
  id: string,
  category: CheckResult["category"],
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): CheckResult {
  return { id, category, status, severity, message, evidence };
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
