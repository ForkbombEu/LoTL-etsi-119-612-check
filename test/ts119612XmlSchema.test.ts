import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { validateTs119612XmlSchema } from "../src/xml/ts119612Xsd.js";
import type { XsdCommandRunner } from "../src/xml/xsd.js";

const canonicalXml = readFileSync("test/fixtures/ts119612-schema-minimal.xml", "utf8");

describe("official ETSI TS 119 612 XML Schema routing", () => {
  it("automatically validates canonical TLv6 through the integrity-checked offline bundle", async () => {
    const runner: XsdCommandRunner = vi.fn(async (_command, args) => (
      args[0] === "--version"
        ? { code: 0, stdout: "xmllint", stderr: "" }
        : { code: 0, stdout: "", stderr: "" }
    ));

    const result = await validateTs119612XmlSchema(canonicalXml, {
      namespace: "http://uri.etsi.org/02231/v2#",
      tslVersionIdentifier: "6",
    }, { commandRunner: runner });

    expect(result).toMatchObject({
      id: "schema.xsd",
      category: "schema",
      status: "pass",
      evidence: {
        standard: {
          document: "ETSI TS 119 612",
          version: "2.4.1",
          binding: "xml",
          citation: "Annex C",
          schemaPrecedence: "document_text_prevails",
        },
        selection: {
          mode: "automatic_pinned",
          observedNamespace: "http://uri.etsi.org/02231/v2#",
          observedTslVersionIdentifier: "6",
          expectedTslVersionIdentifier: 6,
        },
        normativeAttachment: {
          sha256: "d2eb0bf4cda3b6a4d123f5ea2c0f4bd0ec8157a03111404603ba678908ea9413",
          bytes: 6874,
        },
        schema: {
          sourcePath: "19612_xsd.xsd",
          sourceRepository: "https://forge.etsi.org/rep/esi/x19_612_trusted_lists",
          sourceTag: "v2.4.1",
          sourceCommit: "812fe781d37ead5b0ad562f2874ef5f67fc3a4dd",
          sha256: "0cb6ac0e96f9600934d216513f21e4cc5b41f8c8c28a8e42102a8135b24df3e1",
          bytes: 26644,
        },
        catalog: {
          sourcePath: "catalog.xml",
          sha256: "b6922d4f0e89597bf995b460540fdf3489e4c3c81de8383bf73836c0a80f727b",
          bytes: 2149,
        },
        bundleIntegrity: { ok: true, checkedFiles: 12, failures: [] },
        diagnostics: [],
        command: { executable: "xmllint", networkDisabled: true, catalogUsed: true },
      },
    });
    expect(runner).toHaveBeenLastCalledWith(
      "xmllint",
      expect.arrayContaining([
        "--nonet",
        "--schema",
        expect.stringMatching(/\/schemas\/etsi-ts-119-612\/v2\.4\.1\/19612_xsd\.xsd$/),
        expect.stringMatching(/\/artifact\.xml$/),
        "--noout",
      ]),
      { env: { XML_CATALOG_FILES: expect.stringMatching(/\/schemas\/etsi-ts-119-612\/v2\.4\.1\/catalog\.xml$/) } },
    );
  });

  it("identifies artifact and schema sources in line diagnostics", async () => {
    const runner: XsdCommandRunner = vi.fn(async (_command, args) => {
      if (args[0] === "--version") return { code: 0, stdout: "xmllint", stderr: "" };
      const schemaPath = args[args.indexOf("--schema") + 1];
      const artifactPath = args.at(-2);
      return {
        code: 3,
        stdout: "",
        stderr: [
          `${artifactPath}:7:12: Schemas validity error : Element 'Wrong' is not expected.`,
          `${schemaPath}:42:5: parser error : invalid schema declaration`,
        ].join("\n"),
      };
    });

    const result = await validateTs119612XmlSchema(canonicalXml, {
      namespace: "http://uri.etsi.org/02231/v2#",
      tslVersionIdentifier: "6",
    }, { commandRunner: runner });

    expect(result).toMatchObject({
      status: "fail",
      evidence: {
        diagnostics: [
          {
            source: "artifact.xml",
            line: 7,
            column: 12,
            message: "Schemas validity error : Element 'Wrong' is not expected.",
          },
          {
            source: "19612_xsd.xsd",
            line: 42,
            column: 5,
            message: "parser error : invalid schema declaration",
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("we-build-tl-audit-");
  });

  it("keeps the observed EUDI RI namespace inconclusive without an authoritative schema", async () => {
    const runner: XsdCommandRunner = vi.fn();
    const result = await validateTs119612XmlSchema(canonicalXml, {
      namespace: "http://uri.etsi.org/19612/v2.4.1#",
      tslVersionIdentifier: "6",
    }, { commandRunner: runner });

    expect(result).toMatchObject({
      id: "schema.xsd",
      status: "inconclusive",
      severity: "warning",
      evidence: {
        selection: { mode: "automatic_pinned" },
        compatibilityInput: { normativeStatus: "not_established" },
      },
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("does not route another format version to the V2.4.1 schema", async () => {
    const runner: XsdCommandRunner = vi.fn();
    const result = await validateTs119612XmlSchema(canonicalXml, {
      namespace: "http://uri.etsi.org/02231/v2#",
      tslVersionIdentifier: "5",
    }, { commandRunner: runner });

    expect(result).toMatchObject({
      status: "inconclusive",
      evidence: {
        selection: {
          observedTslVersionIdentifier: "5",
          expectedTslVersionIdentifier: 6,
        },
      },
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("uses an explicit --xsd override before automatic namespace/version routing", async () => {
    const runner: XsdCommandRunner = vi.fn(async (_command, args) => (
      args[0] === "--version"
        ? { code: 0, stdout: "xmllint", stderr: "" }
        : { code: 0, stdout: "", stderr: "" }
    ));
    const overridePath = "test/fixtures/minimal-tsl-eudi-ri.xsd";
    const compatibilityXml = canonicalXml.replace(
      "http://uri.etsi.org/02231/v2#",
      "http://uri.etsi.org/19612/v2.4.1#",
    );
    const result = await validateTs119612XmlSchema(compatibilityXml, {
      namespace: "http://uri.etsi.org/19612/v2.4.1#",
      tslVersionIdentifier: "6",
      xsdOverridePath: overridePath,
    }, { commandRunner: runner });

    expect(result).toMatchObject({
      status: "pass",
      evidence: {
        selection: { mode: "explicit_override" },
        schema: {
          sourcePath: overridePath,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          bytes: expect.any(Number),
        },
        command: { catalogUsed: false },
      },
    });
    expect(runner.mock.calls.at(-1)).toHaveLength(2);
    expect(runner).toHaveBeenLastCalledWith(
      "xmllint",
      expect.arrayContaining(["--nonet", "--schema", overridePath, "--noout"]),
    );
  });

  it("reports unsupported when xmllint is unavailable for an automatically selected schema", async () => {
    const runner: XsdCommandRunner = vi.fn(async () => ({
      code: -1,
      stdout: "",
      stderr: "spawn xmllint ENOENT",
    }));
    await expect(validateTs119612XmlSchema(canonicalXml, {
      namespace: "http://uri.etsi.org/02231/v2#",
      tslVersionIdentifier: "6",
    }, { commandRunner: runner })).resolves.toMatchObject({
      id: "schema.xsd",
      status: "unsupported",
      message: expect.stringContaining("xmllint was not found"),
    });
  });
});
