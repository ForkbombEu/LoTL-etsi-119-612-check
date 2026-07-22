import { describe, expect, it, vi } from "vitest";
import { validateTs119602XmlSchema } from "../src/xml/ts119602Xsd.js";
import type { XsdCommandRunner } from "../src/xml/xsd.js";

const xml = `<?xml version="1.0"?>
<ListOfTrustedEntities xmlns="http://uri.etsi.org/019602/v1#" LOTETag="https://uri.etsi.org/19602/LOTETag/"/>`;

describe("official ETSI TS 119 602 XML Schema validation", () => {
  it("validates through the pinned offline schema and reports immutable source identity", async () => {
    const runner: XsdCommandRunner = vi.fn(async (_command, args) => (
      args[0] === "--version"
        ? { code: 0, stdout: "xmllint", stderr: "" }
        : { code: 0, stdout: "", stderr: "" }
    ));

    const result = await validateTs119602XmlSchema(xml, { commandRunner: runner });

    expect(result).toMatchObject({
      id: "ts119602.binding.xml_schema",
      category: "schema",
      status: "pass",
      evidence: {
        standard: {
          document: "ETSI TS 119 602",
          version: "1.1.1",
          binding: "scheme_explicit_xml",
          citation: "Annex A.2.1",
          schemaPrecedence: "document_text_prevails",
        },
        schema: {
          sourcePath: "1960201_xml_schema/1960201_xsd_schema.xsd",
          sourceRepository: "https://forge.etsi.org/rep/esi/x19_60201_lists_of_trusted_entities",
          sourceTag: "v1.1.1",
          sourceCommit: "e84f427f0cde99513b574ef4b5a155ac4a38eab6",
          sha256: "61def65d304ca5357d745f273c3db2efae8b00de8d857abbaba78725bf690d4e",
          bytes: 23663,
        },
        catalog: {
          sourcePath: "catalog.xml",
          sha256: "c81fd6695534c1c233e24c203951de30179d05e9486de23776baf64027d71608",
          bytes: 1392,
        },
        bundleIntegrity: { ok: true, checkedFiles: 14, failures: [] },
        diagnostics: [],
        command: { executable: "xmllint", networkDisabled: true, catalogUsed: true },
      },
    });
    expect(runner).toHaveBeenLastCalledWith(
      "xmllint",
      expect.arrayContaining([
        "--nonet",
        "--schema",
        expect.stringMatching(/\/schemas\/etsi-ts-119-602\/v1\.1\.1\/1960201_xml_schema\/1960201_xsd_schema\.xsd$/),
        expect.stringMatching(/\/artifact\.xml$/),
        "--noout",
      ]),
      { env: { XML_CATALOG_FILES: expect.stringMatching(/\/schemas\/etsi-ts-119-602\/v1\.1\.1\/catalog\.xml$/) } },
    );
  });

  it("reports structured schema diagnostics without leaking its temporary path", async () => {
    const runner: XsdCommandRunner = vi.fn(async (_command, args) => {
      if (args[0] === "--version") return { code: 0, stdout: "xmllint", stderr: "" };
      const artifactPath = args.at(-2) ?? "artifact.xml";
      return {
        code: 3,
        stdout: "",
        stderr: `${artifactPath}:7: element Wrong: Schemas validity error : Element 'Wrong' is not expected.`,
      };
    });

    const result = await validateTs119602XmlSchema(xml, { commandRunner: runner });
    expect(result).toMatchObject({
      status: "fail",
      severity: "error",
      evidence: {
        diagnostics: [{ line: 7, message: "element Wrong: Schemas validity error : Element 'Wrong' is not expected." }],
      },
    });
    expect(JSON.stringify(result)).not.toContain("we-build-tl-audit-");
  });

  it("reports unsupported when xmllint is unavailable", async () => {
    const runner: XsdCommandRunner = vi.fn(async () => ({ code: -1, stdout: "", stderr: "spawn xmllint ENOENT" }));
    await expect(validateTs119602XmlSchema(xml, { commandRunner: runner })).resolves.toMatchObject({
      id: "ts119602.binding.xml_schema",
      status: "unsupported",
      severity: "warning",
      message: expect.stringContaining("xmllint was not found"),
    });
  });
});
