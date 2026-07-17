import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256Hex } from "./certs.js";
import { detectArtifact } from "./detect.js";
import { fetchArtifact, saveFetchedArtifact } from "./fetcher.js";
import { isUrl, loadInput } from "./input.js";
import { assessJsonLote } from "./json/loteChecks.js";
import { parseLotlJson } from "./lotl.js";
import { buildAuditReport } from "./report/jsonReport.js";
import { renderMarkdownReport } from "./report/markdownReport.js";
import type { ArtifactKind, AuditReport, CheckResult, CliOptions, PointerInfo, StandardApplicability, TrustedListAuditResult } from "./types.js";
import { assessTs119612Xml } from "./xml/ts119612Checks.js";

export interface AuditCoreOptions {
  concurrency: number;
  timeoutMs: number;
  xsd?: string;
  strict: boolean;
  includeJsonLoteChecks: boolean;
  fetch: boolean;
}

export interface InMemoryAuditOptions extends AuditCoreOptions {
  source: string;
  kind: "file" | "url" | "json";
  lotlText: string;
  sha256?: string;
}

export interface AuditInMemoryResult {
  json: AuditReport;
  markdown: string;
}

export interface AssessArtifactUrlOptions {
  url: string;
  declared?: Partial<TrustedListAuditResult["declared"]>;
  timeoutMs: number;
  strict: boolean;
  includeJsonLoteChecks: boolean;
  xsd?: string;
}

export async function runAudit(options: CliOptions, version: string): Promise<AuditReport> {
  const input = await loadInput(options.input, options.timeoutMs);
  const result = await runAuditInMemory(
    {
      source: options.input,
      kind: input.kind,
      lotlText: input.text,
      sha256: input.sha256,
      concurrency: options.concurrency,
      timeoutMs: options.timeoutMs,
      xsd: options.xsd,
      strict: options.strict,
      includeJsonLoteChecks: options.includeJsonLoteChecks,
      fetch: options.fetch,
    },
    version,
  );

  await mkdir(options.outDir, { recursive: true });
  await writeFile(join(options.outDir, "report.json"), `${JSON.stringify(result.json, null, 2)}\n`);
  await writeFile(join(options.outDir, "report.md"), result.markdown);

  if (options.fetch) {
    await persistFetchedArtifacts(result.json.results, options);
  }

  return result.json;
}

export async function runAuditInMemory(options: InMemoryAuditOptions, version: string): Promise<AuditInMemoryResult> {
  const parsedLotl = parseLotlJson(options.lotlText);
  const generatedAt = new Date().toISOString();

  const results = await mapConcurrent(parsedLotl.pointers, options.concurrency, (pointer) => auditPointer(pointer, options));

  const report = buildAuditReport({
    generatedAt,
    input: {
      source: options.source,
      kind: options.kind,
      sha256: options.sha256 ?? sha256Hex(Buffer.from(options.lotlText, "utf8")),
    },
    lotl: parsedLotl.summary,
    results,
    version,
  });

  return {
    json: report,
    markdown: renderMarkdownReport(report),
  };
}

export async function runAuditFromUrl(url: string, options: AuditCoreOptions, version: string): Promise<AuditInMemoryResult> {
  if (!isUrl(url)) {
    throw new Error("Invalid URL input.");
  }
  const input = await loadInput(url, options.timeoutMs);
  return runAuditInMemory(
    {
      ...options,
      source: url,
      kind: "url",
      lotlText: input.text,
      sha256: input.sha256,
    },
    version,
  );
}

export async function runAuditFromJson(lotl: unknown, options: AuditCoreOptions, version: string): Promise<AuditInMemoryResult> {
  const lotlText = typeof lotl === "string" ? lotl : JSON.stringify(lotl);
  return runAuditInMemory(
    {
      ...options,
      source: "request-body",
      kind: "json",
      lotlText,
      sha256: sha256Hex(Buffer.from(lotlText, "utf8")),
    },
    version,
  );
}

export async function assessArtifactUrl(
  options: AssessArtifactUrlOptions,
): Promise<TrustedListAuditResult> {
  if (!isUrl(options.url)) {
    throw new Error("Invalid URL input.");
  }
  return auditPointer(
    {
      index: 1,
      location: options.url,
      declared: normalizeDeclared(options.declared),
      raw: undefined,
    },
    {
      concurrency: 1,
      timeoutMs: options.timeoutMs,
      strict: options.strict,
      includeJsonLoteChecks: options.includeJsonLoteChecks,
      fetch: true,
      xsd: options.xsd,
    },
  );
}

async function auditPointer(pointer: PointerInfo, options: AuditCoreOptions): Promise<TrustedListAuditResult> {
  const base: TrustedListAuditResult = {
    id: resultId(pointer),
    index: pointer.index,
    source: pointer.location,
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
    standardApplicability: unknownApplicability(),
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
  base.standardApplicability = applicabilityFor(detected.artifactKind);

  if (detected.artifactKind === "ts119612_xml_tsl" || detected.artifactKind === "ts119612_xml_lotl") {
    const assessed = await assessTs119612Xml(fetched.bytes.toString("utf8"), {
      strict: options.strict,
      xsdPath: options.xsd,
    });
    return mergeResult(base, assessed);
  }

  if (detected.artifactKind === "json_lote" || detected.artifactKind === "json_lotl") {
    const assessed = assessJsonLote(detected.parsedJson, options.includeJsonLoteChecks);
    return mergeResult(base, assessed);
  }

  const reason =
    detected.format === "html"
      ? "Fetched artifact appears to be HTML/error page, not TS 119 612 XML."
      : "Fetched artifact is not a recognized JSON LoTE/LoTL or ETSI TS 119 612 XML artifact.";
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

function resultId(pointer: PointerInfo): string {
  return `artifact-${String(pointer.index).padStart(3, "0")}-${sha256Hex(pointer.location).slice(0, 12)}`;
}

function unknownApplicability(): StandardApplicability {
  return {
    ts119612: "unknown",
    ts119602: "unknown",
    weBuildProfile: "unknown",
    eudiTrustRole: "unknown",
  };
}

function applicabilityFor(artifactKind: ArtifactKind): StandardApplicability {
  if (artifactKind === "ts119612_xml_tsl" || artifactKind === "ts119612_xml_lotl") {
    return {
      ts119612: "applicable",
      ts119602: "not_applicable",
      weBuildProfile: "unknown",
      eudiTrustRole: "unknown",
    };
  }
  if (artifactKind === "json_lote" || artifactKind === "json_lotl") {
    return {
      ts119612: "not_applicable",
      ts119602: "applicable",
      weBuildProfile: "applicable",
      eudiTrustRole: "unknown",
    };
  }
  return unknownApplicability();
}

async function persistFetchedArtifacts(results: TrustedListAuditResult[], options: CliOptions): Promise<void> {
  await mapConcurrent(results, options.concurrency, async (result) => {
    if (!result.fetch.ok || !result.fetch.finalUrl) return;
    const fetched = await fetchArtifact(result.location, options.timeoutMs);
    if (!fetched.bytes) return;
    await saveFetchedArtifact(options.outDir, result.index, result.location, fetched.bytes, result.detected.format);
  });
}

function normalizeDeclared(declared?: Partial<TrustedListAuditResult["declared"]>): TrustedListAuditResult["declared"] {
  return {
    mimeType: declared?.mimeType,
    loteType: declared?.loteType,
    schemeOperatorName: declared?.schemeOperatorName,
    schemeTerritory: declared?.schemeTerritory,
    pointerCertificateFingerprintsSha256: declared?.pointerCertificateFingerprintsSha256 ?? [],
  };
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
