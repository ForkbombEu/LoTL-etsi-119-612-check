import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CheckResult } from "../types.js";
import {
  loadTs119612SchemaManifest,
  TS119612_SCHEMA_BUNDLE_DIRECTORY,
  ts119612SchemaEntrypoint,
  ts119612XmlCatalogPath,
  verifyTs119612SchemaBundle,
} from "../standards/ts119612Schemas.js";
import {
  TS119612_COMPATIBILITY_INPUTS,
  TS119612_SOURCE,
} from "../standards/ts119612Requirements.js";
import { validateXsd, type XsdValidationDependencies } from "./xsd.js";

const CHECK_ID = "schema.xsd";

export interface Ts119612XmlSchemaSelection {
  namespace?: string;
  tslVersionIdentifier?: string;
  xsdOverridePath?: string;
}

/** Select and validate the applicable TS 119 612 schema without network access. */
export async function validateTs119612XmlSchema(
  xml: string,
  selection: Ts119612XmlSchemaSelection,
  dependencies: XsdValidationDependencies = {},
): Promise<CheckResult> {
  if (selection.xsdOverridePath) {
    return validateOverride(xml, selection, selection.xsdOverridePath, dependencies);
  }

  const selectionEvidence = {
    mode: "automatic_pinned",
    observedNamespace: selection.namespace ?? null,
    observedTslVersionIdentifier: selection.tslVersionIdentifier ?? null,
    expectedNamespace: TS119612_SOURCE.canonicalNamespace,
    expectedTslVersionIdentifier: TS119612_SOURCE.tslVersionIdentifier,
  };
  const compatibilityInput = TS119612_COMPATIBILITY_INPUTS.find(
    (entry) => entry.namespace === selection.namespace,
  );
  if (compatibilityInput) {
    return {
      id: CHECK_ID,
      category: "schema",
      status: "inconclusive",
      severity: "warning",
      message: "Automatic TS 119 612 schema validation was not attempted because the observed compatibility namespace has no authoritative pinned schema binding.",
      evidence: {
        selection: selectionEvidence,
        compatibilityInput,
        schemaPrecedence: TS119612_SOURCE.schemaPrecedence,
      },
    };
  }
  if (selection.namespace !== TS119612_SOURCE.canonicalNamespace) {
    return {
      id: CHECK_ID,
      category: "schema",
      status: "inconclusive",
      severity: "warning",
      message: "Automatic TS 119 612 schema validation was not attempted because the artifact namespace does not select the pinned V2.4.1 schema.",
      evidence: {
        selection: selectionEvidence,
        schemaPrecedence: TS119612_SOURCE.schemaPrecedence,
      },
    };
  }
  if (selection.tslVersionIdentifier !== String(TS119612_SOURCE.tslVersionIdentifier)) {
    return {
      id: CHECK_ID,
      category: "schema",
      status: "inconclusive",
      severity: "warning",
      message: "Automatic TS 119 612 schema validation was not attempted because TSLVersionIdentifier does not select the pinned V2.4.1 format version.",
      evidence: {
        selection: selectionEvidence,
        schemaPrecedence: TS119612_SOURCE.schemaPrecedence,
      },
    };
  }

  try {
    const [manifest, integrity, xsdPath, catalogPath] = await Promise.all([
      loadTs119612SchemaManifest(),
      verifyTs119612SchemaBundle(),
      ts119612SchemaEntrypoint("base"),
      ts119612XmlCatalogPath(),
    ]);
    const schemaFile = manifest.files.find((file) => file.path === manifest.entrypoints.base);
    const catalogFile = manifest.files.find((file) => file.path === manifest.entrypoints.catalog);
    if (!schemaFile || !catalogFile) {
      throw new Error("The pinned manifest does not identify both the base XML schema and offline catalog.");
    }

    const evidence = {
      standard: {
        document: TS119612_SOURCE.document,
        version: manifest.standardVersion,
        binding: "xml",
        citation: "Annex C",
        schemaPrecedence: TS119612_SOURCE.schemaPrecedence,
      },
      selection: selectionEvidence,
      normativeAttachment: {
        url: manifest.normativeSource.electronicAttachment,
        sha256: manifest.normativeSource.electronicAttachmentSha256,
        bytes: manifest.normativeSource.electronicAttachmentBytes,
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
      bundleIntegrity: integrityEvidence(integrity),
    };

    if (!integrity.ok) {
      return {
        id: CHECK_ID,
        category: "schema",
        status: "unsupported",
        severity: "warning",
        message: "Pinned ETSI TS 119 612 V2.4.1 XML Schema validation was not attempted because schema bundle integrity verification failed.",
        evidence,
      };
    }

    return validateXsd(xml, xsdPath, dependencies, {
      checkId: CHECK_ID,
      schemaLabel: "Pinned ETSI TS 119 612 V2.4.1 XML Schema",
      expectedNamespace: selection.namespace,
      catalogPath,
      schemaEvidence: evidence,
      unavailableStatus: "unsupported",
      diagnosticSources: {
        artifactLabel: "artifact.xml",
        files: manifest.files.map((file) => ({
          path: resolve(TS119612_SCHEMA_BUNDLE_DIRECTORY, file.path),
          label: file.path,
        })),
      },
    });
  } catch (error) {
    return {
      id: CHECK_ID,
      category: "schema",
      status: "unsupported",
      severity: "warning",
      message: "Pinned ETSI TS 119 612 V2.4.1 XML Schema validation was not attempted because the offline schema bundle could not be loaded.",
      evidence: {
        selection: selectionEvidence,
        error: error instanceof Error ? error.message : String(error),
        schemaPrecedence: TS119612_SOURCE.schemaPrecedence,
      },
    };
  }
}

async function validateOverride(
  xml: string,
  selection: Ts119612XmlSchemaSelection,
  xsdOverridePath: string,
  dependencies: XsdValidationDependencies,
): Promise<CheckResult> {
  const schema = await overrideIdentity(xsdOverridePath);
  return validateXsd(xml, xsdOverridePath, dependencies, {
    checkId: CHECK_ID,
    schemaLabel: "Explicit TS 119 612 XML Schema override",
    expectedNamespace: selection.namespace,
    schemaEvidence: {
      standard: {
        document: TS119612_SOURCE.document,
        schemaPrecedence: TS119612_SOURCE.schemaPrecedence,
      },
      selection: {
        mode: "explicit_override",
        observedNamespace: selection.namespace ?? null,
        observedTslVersionIdentifier: selection.tslVersionIdentifier ?? null,
      },
      schema,
    },
    diagnosticSources: {
      artifactLabel: "artifact.xml",
      files: [
        { path: xsdOverridePath, label: xsdOverridePath },
        { path: resolve(xsdOverridePath), label: xsdOverridePath },
      ],
    },
  });
}

async function overrideIdentity(path: string): Promise<Record<string, unknown>> {
  try {
    const contents = await readFile(path);
    return {
      sourcePath: path,
      sha256: createHash("sha256").update(contents).digest("hex"),
      bytes: contents.byteLength,
    };
  } catch (error) {
    return {
      sourcePath: path,
      readable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function integrityEvidence(integrity: Awaited<ReturnType<typeof verifyTs119612SchemaBundle>>): {
  ok: boolean;
  checkedFiles: number;
  failures: Array<Record<string, unknown>>;
} {
  return {
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
  };
}
