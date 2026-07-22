import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadTs119612SchemaManifest,
  resolveTs119612XmlSchemaReference,
  ts119612SchemaEntrypoint,
  ts119612XmlCatalogPath,
  verifyTs119612SchemaBundle,
} from "../src/standards/ts119612Schemas.js";

describe("ETSI TS 119 612 v2.4.1 schema bundle", () => {
  it("pins the official publication, immutable Forge revision and source licenses", async () => {
    const manifest = await loadTs119612SchemaManifest();

    expect(manifest).toMatchObject({
      standard: "ETSI TS 119 612",
      standardVersion: "2.4.1",
      normativeSource: {
        electronicAttachmentSha256: "d2eb0bf4cda3b6a4d123f5ea2c0f4bd0ec8157a03111404603ba678908ea9413",
        electronicAttachmentBytes: 6874,
      },
      sources: {
        etsiForge: {
          tag: "v2.4.1",
          commit: "812fe781d37ead5b0ad562f2874ef5f67fc3a4dd",
          license: "BSD-3-Clause",
        },
        etsiUri: { license: "ETSI-Software-Clause-9.2" },
        w3c: { license: "W3C-19980720" },
      },
    });
    expect(manifest.normativeSource.attachmentFiles).toHaveLength(3);
    expect(manifest.normativeSource.attachmentFiles.every(
      (file) => file.pinnedNormalization === "CRLF_to_LF" && file.contentEqualAfterNormalization,
    )).toBe(true);
    expect(manifest.files).toHaveLength(12);
    expect(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
  });

  it("verifies the size and SHA-256 of every pinned file", async () => {
    const integrity = await verifyTs119612SchemaBundle();

    expect(integrity.ok).toBe(true);
    expect(integrity.files.filter((file) => !file.ok)).toEqual([]);
  });

  it("exposes all three official schema entrypoints", async () => {
    const paths = await Promise.all([
      ts119612SchemaEntrypoint("base"),
      ts119612SchemaEntrypoint("serviceInformationExtension"),
      ts119612SchemaEntrypoint("additionalTypes"),
    ]);

    expect(paths.map((path) => basename(path))).toEqual([
      "19612_xsd.xsd",
      "19612_sie_xsd.xsd",
      "19612_additionaltypes_xsd.xsd",
    ]);
  });

  it("resolves every external schema import declared by the pinned XSDs", async () => {
    const manifest = await loadTs119612SchemaManifest();
    const schemas = manifest.files.filter((file) => file.mediaType === "application/xml");
    const imports = new Set<string>();

    for (const schema of schemas) {
      const absolutePath = schema.path === manifest.entrypoints.catalog
        ? await ts119612XmlCatalogPath()
        : await resolvePinnedPath(schema.path);
      const contents = await readFile(absolutePath, "utf8");
      for (const match of contents.matchAll(/<(?:xsd|xs):import\b[^>]*schemaLocation=["']([^"']+)["']/g)) {
        imports.add(match[1]);
      }
    }

    expect(imports).toEqual(new Set([
      "https://forge.etsi.org/rep/esi/x19_612_trusted_lists/-/raw/v2.4.1/19612_xsd.xsd",
      "https://uri.etsi.org/01903/v1.3.2/XAdES01903v132-201601.xsd",
      "http://www.w3.org/2001/xml.xsd",
      "http://www.w3.org/TR/2008/REC-xmldsig-core-20080610/xmldsig-core-schema.xsd",
    ]));

    for (const reference of imports) {
      await expect(resolveTs119612XmlSchemaReference(reference)).resolves.toBeTruthy();
    }
  });

  it("maps schema and DTD dependencies through the offline catalog", async () => {
    await expect(resolveTs119612XmlSchemaReference(
      "https://uri.etsi.org/01903/v1.3.2/XAdES01903v132-201601.xsd",
    )).resolves.toMatch(/dependencies\/etsi\/XAdES01903v132-201601\.xsd$/);
    await expect(resolveTs119612XmlSchemaReference("http://www.w3.org/2001/xml.xsd"))
      .resolves.toMatch(/dependencies\/w3c\/xml\.xsd$/);
    await expect(resolveTs119612XmlSchemaReference("datatypes.dtd"))
      .resolves.toMatch(/dependencies\/w3c\/datatypes\.dtd$/);

    const catalog = await readFile(await ts119612XmlCatalogPath(), "utf8");
    expect(catalog).toContain("XAdES01903v132-201601.xsd");
    expect(catalog).toContain("xmldsig-core-schema.xsd");
    expect(catalog).toContain("XMLSchema.dtd");
    expect(catalog).toContain("datatypes.dtd");
  });

  it("rejects unpinned remote, absolute and traversal references", async () => {
    await expect(resolveTs119612XmlSchemaReference("https://example.test/schema.xsd"))
      .rejects.toThrow("Unmapped");
    await expect(resolveTs119612XmlSchemaReference("/tmp/schema.xsd"))
      .rejects.toThrow("Unmapped");
    await expect(resolveTs119612XmlSchemaReference("../../schema.xsd"))
      .rejects.toThrow("Unmapped");
  });
});

async function resolvePinnedPath(bundlePath: string): Promise<string> {
  const manifest = await loadTs119612SchemaManifest();
  const entrypoint = Object.entries(manifest.entrypoints)
    .find(([, candidate]) => candidate === bundlePath)?.[0];
  if (entrypoint === "base" || entrypoint === "serviceInformationExtension" || entrypoint === "additionalTypes") {
    return ts119612SchemaEntrypoint(entrypoint);
  }

  const sourceReference = Object.entries(manifest.resolvers)
    .find(([, candidate]) => candidate === bundlePath)?.[0];
  if (!sourceReference) throw new Error(`No resolver entry for pinned schema: ${bundlePath}`);
  return resolveTs119612XmlSchemaReference(sourceReference);
}
