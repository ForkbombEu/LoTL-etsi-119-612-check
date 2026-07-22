import { describe, expect, it, vi } from "vitest";
import { parseXsdDiagnostics, validateXsd } from "../src/xml/xsd.js";

const xml = "<TrustServiceStatusList />";
const xsdPath = "test/fixtures/minimal-tsl.xsd";
const canonicalXsdPath = "test/fixtures/minimal-tsl-canonical.xsd";

describe("validateXsd", () => {
  it("reports not_checked when no local schema is supplied", async () => {
    const runner = vi.fn();
    await expect(validateXsd(xml, undefined, { commandRunner: runner })).resolves.toMatchObject({
      id: "schema.xsd",
      status: "not_checked",
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("reports not_checked when xmllint is unavailable", async () => {
    const runner = vi.fn(async () => ({ code: -1, stdout: "", stderr: "spawn xmllint ENOENT" }));
    await expect(validateXsd(xml, xsdPath, { commandRunner: runner })).resolves.toMatchObject({
      status: "not_checked",
      message: expect.stringContaining("xmllint was not found"),
    });
    expect(runner).toHaveBeenCalledWith("xmllint", ["--version"]);
  });

  it("runs xmllint with the supplied local schema and reports pass", async () => {
    const runner = vi.fn(async (_command: string, args: string[]) => (
      args[0] === "--version"
        ? { code: 0, stdout: "xmllint", stderr: "" }
        : { code: 0, stdout: "", stderr: "" }
    ));
    const result = await validateXsd(xml, xsdPath, { commandRunner: runner });
    expect(result).toMatchObject({ status: "pass", severity: "info" });
    expect(runner).toHaveBeenLastCalledWith(
      "xmllint",
      expect.arrayContaining(["--nonet", "--schema", xsdPath, "--noout"]),
    );
  });

  it("reports validation failure output from xmllint", async () => {
    const runner = vi.fn(async (_command: string, args: string[]) => (
      args[0] === "--version"
        ? { code: 0, stdout: "xmllint", stderr: "" }
        : { code: 3, stdout: "", stderr: "element not allowed" }
    ));
    await expect(validateXsd(xml, xsdPath, { commandRunner: runner })).resolves.toMatchObject({
      status: "fail",
      severity: "error",
      evidence: "element not allowed",
    });
  });

  it("does not validate with an XSD for a different namespace", async () => {
    const runner = vi.fn();
    await expect(validateXsd(xml, canonicalXsdPath, { commandRunner: runner }, {
      expectedNamespace: "http://uri.etsi.org/19612/v2.4.1#",
    })).resolves.toMatchObject({
      status: "not_checked",
      message: expect.stringContaining("target namespace does not match"),
      evidence: expect.objectContaining({
        artifactNamespace: "http://uri.etsi.org/19612/v2.4.1#",
        schemaNamespace: "http://uri.etsi.org/02231/v2#",
      }),
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("supplies an offline XML catalog through the process environment", async () => {
    const runner = vi.fn(async (_command: string, args: string[]) => (
      args[0] === "--version"
        ? { code: 0, stdout: "xmllint", stderr: "" }
        : { code: 0, stdout: "", stderr: "" }
    ));
    await validateXsd(xml, xsdPath, { commandRunner: runner }, { catalogPath: "schemas/catalog.xml" });
    expect(runner).toHaveBeenLastCalledWith(
      "xmllint",
      expect.arrayContaining(["--nonet", "--schema", xsdPath, "--noout"]),
      { env: { XML_CATALOG_FILES: "schemas/catalog.xml" } },
    );
    expect(runner.mock.calls.at(-1)?.[1]).not.toContain("--catalogs");
  });

  it("parses line diagnostics without exposing the temporary artifact path", () => {
    const temporaryPath = "/tmp/we-build-tl-audit-abc123/artifact.xml";
    expect(parseXsdDiagnostics(
      `${temporaryPath}:7:12: Schemas validity error : Element 'Wrong': No matching global declaration.\nvalidation failed`,
      temporaryPath,
    )).toEqual([
      { line: 7, column: 12, message: "Schemas validity error : Element 'Wrong': No matching global declaration." },
      { message: "validation failed" },
    ]);
  });
});
