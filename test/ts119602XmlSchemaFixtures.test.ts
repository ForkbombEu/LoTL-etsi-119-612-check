import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hasXmllint = spawnSync("xmllint", ["--version"], { encoding: "utf8" }).status === 0;
const catalog = resolve("schemas/etsi-ts-119-602/v1.1.1/catalog.xml");

describe.runIf(hasXmllint)("ETSI TS 119 602 XML base/extension schema fixtures", () => {
  it.each([
    [
      "base",
      "schemas/etsi-ts-119-602/v1.1.1/1960201_xml_schema/1960201_xsd_schema.xsd",
      "test/fixtures/ts119602-schema-xml-base-valid.xml",
      "test/fixtures/ts119602-schema-xml-base-invalid.xml",
    ],
    [
      "service-information extension composition",
      "test/fixtures/ts119602-schema-xml-sie-composed.xsd",
      "test/fixtures/ts119602-schema-xml-sie-valid.xml",
      "test/fixtures/ts119602-schema-xml-sie-invalid.xml",
    ],
    [
      "trusted-entity extension composition",
      "test/fixtures/ts119602-schema-xml-tie-composed.xsd",
      "test/fixtures/ts119602-schema-xml-tie-valid.xml",
      "test/fixtures/ts119602-schema-xml-tie-invalid.xml",
    ],
  ])("accepts the positive and rejects the focused negative %s fixture", (_label, schema, positive, negative) => {
    expect(validate(schema, positive).status).toBe(0);
    expect(validate(schema, negative).status).not.toBe(0);
  });

  it.each([
    "schemas/etsi-ts-119-602/v1.1.1/1960201_xml_schema/1960201_xsd_schema_sie.xsd",
    "schemas/etsi-ts-119-602/v1.1.1/1960201_xml_schema/1960201_xsd_schema_tie.xsd",
  ])("preserves the published missing-base-import failure for %s", (schema) => {
    const result = validate(schema, "test/fixtures/ts119602-schema-xml-sie-valid.xml");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not indicated by an import statement");
  });
});

function validate(schema: string, fixture: string): ReturnType<typeof spawnSync> {
  return spawnSync("xmllint", ["--nonet", "--schema", schema, "--noout", fixture], {
    encoding: "utf8",
    env: { ...process.env, XML_CATALOG_FILES: catalog },
  });
}
