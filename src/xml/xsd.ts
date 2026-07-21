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

export type XsdCommandRunner = (command: string, args: string[]) => Promise<XsdCommandResult>;

export interface XsdValidationDependencies {
  commandRunner?: XsdCommandRunner;
}

export interface XsdValidationOptions {
  expectedNamespace?: string;
}

export async function validateXsd(
  xml: string,
  xsdPath?: string,
  dependencies: XsdValidationDependencies = {},
  options: XsdValidationOptions = {},
): Promise<CheckResult> {
  if (!xsdPath) {
    return {
      id: "schema.xsd",
      category: "schema",
      status: "not_checked",
      severity: "warning",
      message: "XSD validation not checked; pass --xsd with local ETSI TS 119 612 schema to enable xmllint validation.",
    };
  }

  try {
    await access(xsdPath);
  } catch {
    return {
      id: "schema.xsd",
      category: "schema",
      status: "not_checked",
      severity: "warning",
      message: "XSD validation not checked because schema file was not readable.",
      evidence: xsdPath,
    };
  }

  if (options.expectedNamespace) {
    const schemaNamespace = await targetNamespace(xsdPath);
    if (schemaNamespace !== options.expectedNamespace) {
      return {
        id: "schema.xsd",
        category: "schema",
        status: "not_checked",
        severity: "warning",
        message: "XSD validation not checked because the supplied schema target namespace does not match the XML artifact namespace.",
        evidence: { artifactNamespace: options.expectedNamespace, schemaNamespace: schemaNamespace ?? null, xsdPath },
      };
    }
  }

  const commandRunner = dependencies.commandRunner ?? runCommand;
  const xmllint = await hasXmllint(commandRunner);
  if (!xmllint) {
    return {
      id: "schema.xsd",
      category: "schema",
      status: "not_checked",
      severity: "warning",
      message: "XSD validation not checked because xmllint was not found on PATH.",
    };
  }

  const dir = await mkdtemp(join(tmpdir(), "we-build-tl-audit-"));
  const xmlPath = join(dir, "artifact.xml");
  try {
    await writeFile(xmlPath, xml);
    const result = await commandRunner("xmllint", ["--nonet", "--schema", xsdPath, xmlPath, "--noout"]);
    return {
      id: "schema.xsd",
      category: "schema",
      status: result.code === 0 ? "pass" : "fail",
      severity: result.code === 0 ? "info" : "error",
      message: result.code === 0 ? "XSD validation passed with xmllint." : "XSD validation failed with xmllint.",
      evidence: result.stderr || result.stdout || undefined,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

function runCommand(command: string, args: string[]): Promise<XsdCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
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
