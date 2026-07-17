import { describe, expect, it, vi } from "vitest";
import { validateXsd } from "../src/xml/xsd.js";

const xml = "<TrustServiceStatusList />";
const xsdPath = "test/fixtures/minimal-tsl.xsd";

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
      expect.arrayContaining(["--schema", xsdPath, "--noout"]),
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
});
