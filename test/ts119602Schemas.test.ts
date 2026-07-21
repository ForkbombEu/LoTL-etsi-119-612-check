import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadTs119602SchemaManifest,
  resolveTs119602JsonSchemaReference,
  resolveTs119602XmlSchemaReference,
  ts119602SchemaEntrypoint,
  ts119602XmlCatalogPath,
  verifyTs119602SchemaBundle,
} from "../src/standards/ts119602Schemas.js";

describe("ETSI TS 119 602 v1.1.1 schema bundle", () => {
  it("pins immutable ETSI provenance and licenses for every source", async () => {
    const manifest = await loadTs119602SchemaManifest();

    expect(manifest).toMatchObject({
      standard: "ETSI TS 119 602",
      standardVersion: "1.1.1",
      bindingSchemaDraft: "http://json-schema.org/draft-07/schema#",
      sources: {
        etsiForge: {
          tag: "v1.1.1",
          commit: "e84f427f0cde99513b574ef4b5a155ac4a38eab6",
          license: "BSD-3-Clause",
        },
        w3c: { license: "W3C-19980720" },
      },
    });
    expect(manifest.files).toHaveLength(14);
    expect(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
  });

  it("verifies the size and SHA-256 of every pinned file", async () => {
    const integrity = await verifyTs119602SchemaBundle();

    expect(integrity.ok).toBe(true);
    expect(integrity.files.filter((file) => !file.ok)).toEqual([]);
  });

  it("exposes all six official binding entrypoints", async () => {
    const paths = await Promise.all([
      ts119602SchemaEntrypoint("json", "base"),
      ts119602SchemaEntrypoint("json", "serviceInformationExtension"),
      ts119602SchemaEntrypoint("json", "trustedEntityInformationExtension"),
      ts119602SchemaEntrypoint("xml", "base"),
      ts119602SchemaEntrypoint("xml", "serviceInformationExtension"),
      ts119602SchemaEntrypoint("xml", "trustedEntityInformationExtension"),
    ]);

    expect(paths.map((path) => basename(path))).toEqual([
      "1960201_json_schema.json",
      "1960201_json_schema_sie.json",
      "1960201_json_schema_tie.json",
      "1960201_xsd_schema.xsd",
      "1960201_xsd_schema_sie.xsd",
      "1960201_xsd_schema_tie.xsd",
    ]);
  });

  it("resolves the RFC dependency and the published TIE filename mismatch offline", async () => {
    const from = "1960201_json_schema/1960201_json_schema.json";
    await expect(resolveTs119602JsonSchemaReference("rfcs/rfc7517.json#/definitions/jwk", from))
      .resolves.toMatch(/1960201_json_schema\/rfcs\/rfc7517\.json$/);

    await expect(resolveTs119602JsonSchemaReference(
      "1960201-jsonSchema.json#/definitions/multiLangString",
      "1960201_json_schema/1960201_json_schema_tie.json",
    )).resolves.toMatch(/1960201_json_schema\/1960201_json_schema\.json$/);
  });

  it("resolves every external JSON reference declared by the pinned schemas", async () => {
    const manifest = await loadTs119602SchemaManifest();
    const schemas = manifest.files.filter((file) => file.mediaType === "application/schema+json");
    const resolvedReferences: string[] = [];

    for (const schema of schemas) {
      const absolutePath = await resolveTs119602JsonSchemaReference("#", schema.path);
      const parsed: unknown = JSON.parse(await readFile(absolutePath, "utf8"));
      for (const reference of collectExternalJsonReferences(parsed)) {
        resolvedReferences.push(await resolveTs119602JsonSchemaReference(reference, schema.path));
      }
    }

    expect(resolvedReferences.map((path) => basename(path))).toEqual(expect.arrayContaining([
      "rfc7517.json",
      "1960201_json_schema.json",
    ]));
  });

  it("rejects unpinned remote references and traversal", async () => {
    const from = "1960201_json_schema/1960201_json_schema.json";
    await expect(resolveTs119602JsonSchemaReference("https://example.test/schema.json", from))
      .rejects.toThrow("Unmapped remote or absolute");
    await expect(resolveTs119602JsonSchemaReference("../../LICENSE", from))
      .rejects.toThrow("Unmapped remote or absolute");
    await expect(resolveTs119602XmlSchemaReference("https://example.test/schema.xsd"))
      .rejects.toThrow("Unmapped");
  });

  it("maps every XML import and DTD dependency through the offline catalog", async () => {
    await expect(resolveTs119602XmlSchemaReference("http://www.w3.org/2001/xml.xsd"))
      .resolves.toMatch(/dependencies\/w3c\/xml\.xsd$/);
    await expect(resolveTs119602XmlSchemaReference(
      "http://www.w3.org/TR/2008/REC-xmldsig-core-20080610/xmldsig-core-schema.xsd",
    )).resolves.toMatch(/dependencies\/w3c\/xmldsig-core-schema\.xsd$/);
    await expect(resolveTs119602XmlSchemaReference("datatypes.dtd"))
      .resolves.toMatch(/dependencies\/w3c\/datatypes\.dtd$/);

    const catalog = await readFile(await ts119602XmlCatalogPath(), "utf8");
    expect(catalog).toContain("http://www.w3.org/2001/xml.xsd");
    expect(catalog).toContain("xmldsig-core-schema.xsd");
    expect(catalog).toContain("XMLSchema.dtd");
    expect(catalog).toContain("datatypes.dtd");
  });
});

function collectExternalJsonReferences(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectExternalJsonReferences);
  if (!value || typeof value !== "object") return [];

  const references: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string" && !child.startsWith("#")) {
      references.push(child);
    } else {
      references.push(...collectExternalJsonReferences(child));
    }
  }
  return references;
}
