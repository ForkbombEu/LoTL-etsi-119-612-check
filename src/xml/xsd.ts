import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { CheckResult } from "../types.js";

export interface XsdCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface XsdCommandOptions {
  env?: NodeJS.ProcessEnv;
}

export type XsdCommandRunner = (command: string, args: string[], options?: XsdCommandOptions) => Promise<XsdCommandResult>;

export interface XsdValidationDependencies {
  commandRunner?: XsdCommandRunner;
}

export interface XsdValidationOptions {
  expectedNamespace?: string;
  checkId?: string;
  schemaLabel?: string;
  catalogPath?: string;
  schemaEvidence?: Record<string, unknown>;
  unavailableStatus?: Extract<CheckResult["status"], "not_checked" | "unsupported">;
  diagnosticSources?: XsdDiagnosticSources;
}

export interface XsdDiagnosticSources {
  artifactLabel: string;
  files: readonly {
    path: string;
    label: string;
  }[];
}

export async function validateXsd(
  xml: string,
  xsdPath?: string,
  dependencies: XsdValidationDependencies = {},
  options: XsdValidationOptions = {},
): Promise<CheckResult> {
  const id = options.checkId ?? "schema.xsd";
  const label = options.schemaLabel ?? "XSD";
  const unavailableStatus = options.unavailableStatus ?? "not_checked";
  if (!xsdPath) {
    return {
      id,
      category: "schema",
      status: unavailableStatus,
      severity: "warning",
      message: `${label} validation was not checked because no schema path was supplied.`,
      evidence: options.schemaEvidence,
    };
  }

  try {
    await access(xsdPath);
  } catch {
    return {
      id,
      category: "schema",
      status: unavailableStatus,
      severity: "warning",
      message: `${label} validation was not checked because the schema file was not readable.`,
      evidence: mergeEvidence(options.schemaEvidence, { xsdPath }),
    };
  }

  if (options.expectedNamespace) {
    const schemaNamespace = await targetNamespace(xsdPath);
    if (schemaNamespace !== options.expectedNamespace) {
      return {
        id,
        category: "schema",
        status: unavailableStatus,
        severity: "warning",
        message: `${label} validation was not checked because the schema target namespace does not match the XML artifact namespace.`,
        evidence: mergeEvidence(options.schemaEvidence, { artifactNamespace: options.expectedNamespace, schemaNamespace: schemaNamespace ?? null, xsdPath }),
      };
    }
  }

  const commandRunner = dependencies.commandRunner ?? runCommand;
  const xmllint = await hasXmllint(commandRunner);
  if (!xmllint) {
    return {
      id,
      category: "schema",
      status: unavailableStatus,
      severity: "warning",
      message: `${label} validation was not checked because xmllint was not found on PATH.`,
      evidence: options.schemaEvidence,
    };
  }

  const dir = await mkdtemp(join(tmpdir(), "we-build-tl-audit-"));
  const xmlPath = join(dir, "artifact.xml");
  try {
    await writeFile(xmlPath, xml);
    const args = ["--nonet"];
    args.push("--schema", xsdPath, xmlPath, "--noout");
    const result = options.catalogPath
      ? await commandRunner("xmllint", args, { env: { XML_CATALOG_FILES: options.catalogPath } })
      : await commandRunner("xmllint", args);
    const diagnostics = parseXsdDiagnostics(result.stderr || result.stdout, xmlPath, options.diagnosticSources);
    return {
      id,
      category: "schema",
      status: result.code === 0 ? "pass" : "fail",
      severity: result.code === 0 ? "info" : "error",
      message: result.code === 0 ? `${label} validation passed with xmllint.` : `${label} validation failed with xmllint.`,
      evidence: options.schemaEvidence
        ? mergeEvidence(options.schemaEvidence, { diagnostics, command: { executable: "xmllint", networkDisabled: true, catalogUsed: Boolean(options.catalogPath) } })
        : result.stderr || result.stdout || undefined,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface XsdDiagnostic {
  source?: string;
  line?: number;
  column?: number;
  message: string;
}

export function parseXsdDiagnostics(
  output: string,
  xmlPath?: string,
  sources?: XsdDiagnosticSources,
): XsdDiagnostic[] {
  if (!output.trim()) return [];
  const normalizedPath = xmlPath?.replaceAll("\\", "/");
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const normalizedLine = line.replaceAll("\\", "/");
    const identified = identifyDiagnosticSource(normalizedLine, normalizedPath, sources);
    const withoutPath = identified.line;
    const located = /^(\d+):(?:(\d+):)?\s*(.*)$/.exec(withoutPath);
    if (!located) {
      return {
        ...(identified.source ? { source: identified.source } : {}),
        message: redactTemporaryPath(withoutPath),
      };
    }
    return {
      ...(identified.source ? { source: identified.source } : {}),
      line: Number(located[1]),
      column: located[2] ? Number(located[2]) : undefined,
      message: located[3].trim(),
    };
  });
}

function identifyDiagnosticSource(
  line: string,
  artifactPath: string | undefined,
  sources: XsdDiagnosticSources | undefined,
): { line: string; source?: string } {
  if (!sources) {
    return {
      line: artifactPath && line.startsWith(`${artifactPath}:`)
        ? line.slice(artifactPath.length + 1)
        : line,
    };
  }
  if (artifactPath && line.startsWith(`${artifactPath}:`)) {
    return { line: line.slice(artifactPath.length + 1), source: sources.artifactLabel };
  }
  for (const candidate of sources.files) {
    const normalizedCandidate = candidate.path.replaceAll("\\", "/");
    if (line.startsWith(`${normalizedCandidate}:`)) {
      return { line: line.slice(normalizedCandidate.length + 1), source: candidate.label };
    }
  }
  return { line };
}

async function targetNamespace(xsdPath: string): Promise<string | undefined> {
  try {
    const schema = await readFile(xsdPath, "utf8");
    return /<[^>]*schema\b[^>]*\btargetNamespace\s*=\s*["']([^"']+)["']/i.exec(schema)?.[1];
  } catch {
    return undefined;
  }
}

async function hasXmllint(commandRunner: XsdCommandRunner): Promise<boolean> {
  const result = await commandRunner("xmllint", ["--version"]);
  return result.code === 0;
}

function runCommand(command: string, args: string[], options: XsdCommandOptions = {}): Promise<XsdCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...options.env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => resolve({ code: -1, stdout, stderr }));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function mergeEvidence(base: Record<string, unknown> | undefined, extra: Record<string, unknown>): Record<string, unknown> {
  return { ...(base ?? {}), ...extra };
}

function redactTemporaryPath(value: string): string {
  return value.replace(/(?:[A-Za-z]:)?[^\s:]*(?:we-build-tl-audit-[^\s/:]+)[^\s:]*(?:artifact\.xml)?/g, "artifact.xml");
}
