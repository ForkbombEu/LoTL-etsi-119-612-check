import type { CheckResult } from "../types.js";
import {
  loadTs119602SchemaManifest,
  ts119602SchemaEntrypoint,
  ts119602XmlCatalogPath,
  verifyTs119602SchemaBundle,
} from "../standards/ts119602Schemas.js";
import { TS119602_SOURCE } from "../standards/ts119602Requirements.js";
import { validateXsd, type XsdValidationDependencies } from "./xsd.js";

const XML_NAMESPACE = "http://uri.etsi.org/019602/v1#";
const CHECK_ID = "ts119602.binding.xml_schema";

/** Validate the scheme-explicit XML binding against the integrity-checked pinned schema bundle. */
export async function validateTs119602XmlSchema(
  xml: string,
  dependencies: XsdValidationDependencies = {},
): Promise<CheckResult> {
  try {
    const [manifest, integrity, xsdPath, catalogPath] = await Promise.all([
      loadTs119602SchemaManifest(),
      verifyTs119602SchemaBundle(),
      ts119602SchemaEntrypoint("xml", "base"),
      ts119602XmlCatalogPath(),
    ]);
    const schemaPath = manifest.entrypoints.xml.base;
    const catalogSourcePath = manifest.entrypoints.xml.catalog;
    const schemaFile = manifest.files.find((file) => file.path === schemaPath);
    const catalogFile = manifest.files.find((file) => file.path === catalogSourcePath);
    if (!schemaFile || !catalogFile) {
      throw new Error("The pinned manifest does not identify both the XML schema and offline catalog.");
    }

    const evidence = {
      standard: {
        document: TS119602_SOURCE.document,
        version: manifest.standardVersion,
        binding: "scheme_explicit_xml",
        citation: "Annex A.2.1",
        schemaPrecedence: TS119602_SOURCE.schemaPrecedence,
      },
      schema: {
        sourcePath: schemaFile.path,
        sourceRepository: manifest.sources.etsiForge.repository,
        sourceTag: manifest.sources.etsiForge.tag,
        sourceCommit: manifest.sources.etsiForge.commit,
        sha256: schemaFile.sha256,
        bytes: schemaFile.bytes,
      },
      catalog: {
        sourcePath: catalogFile.path,
        sha256: catalogFile.sha256,
        bytes: catalogFile.bytes,
      },
      bundleIntegrity: {
        ok: integrity.ok,
        checkedFiles: integrity.files.length,
        failures: integrity.files.filter((file) => !file.ok).map((file) => ({
          path: file.path,
          expectedSha256: file.expectedSha256,
          actualSha256: file.actualSha256,
          expectedBytes: file.expectedBytes,
          actualBytes: file.actualBytes,
          readable: file.error === undefined,
        })),
      },
    };

    if (!integrity.ok) {
      return {
        id: CHECK_ID,
        category: "schema",
        status: "unsupported",
        severity: "warning",
        message: "Pinned ETSI TS 119 602 V1.1.1 XML Schema validation was not attempted because schema bundle integrity verification failed.",
        evidence,
      };
    }

    return validateXsd(xml, xsdPath, dependencies, {
      checkId: CHECK_ID,
      schemaLabel: "Pinned ETSI TS 119 602 V1.1.1 XML Schema",
      expectedNamespace: XML_NAMESPACE,
      catalogPath,
      schemaEvidence: evidence,
      unavailableStatus: "unsupported",
    });
  } catch (error) {
    return {
      id: CHECK_ID,
      category: "schema",
      status: "unsupported",
      severity: "warning",
      message: "Pinned ETSI TS 119 602 V1.1.1 XML Schema validation was not attempted because the offline schema bundle could not be loaded.",
      evidence: {
        error: error instanceof Error ? error.message : String(error),
        schemaPrecedence: TS119602_SOURCE.schemaPrecedence,
      },
    };
  }
}
