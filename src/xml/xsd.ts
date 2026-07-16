import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { CheckResult } from "../types.js";

export async function validateXsd(xml: string, xsdPath?: string): Promise<CheckResult> {
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

  const xmllint = await hasXmllint();
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
  await writeFile(xmlPath, xml);
  const result = await run("xmllint", ["--schema", xsdPath, xmlPath, "--noout"]);
  return {
    id: "schema.xsd",
    category: "schema",
    status: result.code === 0 ? "pass" : "fail",
    severity: result.code === 0 ? "info" : "error",
    message: result.code === 0 ? "XSD validation passed with xmllint." : "XSD validation failed with xmllint.",
    evidence: result.stderr || result.stdout || undefined,
  };
}

async function hasXmllint(): Promise<boolean> {
  const result = await run("xmllint", ["--version"]);
  return result.code === 0;
}

function run(command: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
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
