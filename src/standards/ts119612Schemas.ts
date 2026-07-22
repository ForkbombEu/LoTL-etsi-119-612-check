import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const TS119612_SCHEMA_BUNDLE_DIRECTORY = fileURLToPath(
  new URL("../../schemas/etsi-ts-119-612/v2.4.1/", import.meta.url),
);

export const TS119612_SCHEMA_MANIFEST_PATH = resolve(TS119612_SCHEMA_BUNDLE_DIRECTORY, "manifest.json");

export interface Ts119612AttachmentFile {
  path: string;
  sha256: string;
  bytes: number;
  pinnedPath: string;
  pinnedNormalization: "CRLF_to_LF";
  contentEqualAfterNormalization: boolean;
}

export interface Ts119612SchemaSource {
  repository: string;
  tag?: string;
  commit?: string;
  license: string;
  licenseUrl: string;
  licensePath: string;
}

export interface Ts119612SchemaFile {
  path: string;
  source: "etsiForge" | "etsiUri" | "w3c" | "local";
  sourcePath?: string;
  sourceUrl?: string;
  sha256: string;
  bytes: number;
  role: string;
  mediaType: string;
}

export interface Ts119612SchemaManifest {
  manifestVersion: number;
  standard: "ETSI TS 119 612";
  standardVersion: "2.4.1";
  retrievedAt: string;
  normativeSource: {
    document: string;
    electronicAttachment: string;
    electronicAttachmentSha256: string;
    electronicAttachmentBytes: number;
    attachmentFiles: Ts119612AttachmentFile[];
  };
  sources: {
    etsiForge: Ts119612SchemaSource;
    etsiUri: Ts119612SchemaSource;
    w3c: Ts119612SchemaSource;
  };
  entrypoints: Record<"base" | "serviceInformationExtension" | "additionalTypes" | "catalog", string>;
  resolvers: Record<string, string>;
  notes: string[];
  files: Ts119612SchemaFile[];
}

export interface Ts119612SchemaIntegrityFile {
  path: string;
  expectedSha256: string;
  actualSha256?: string;
  expectedBytes: number;
  actualBytes?: number;
  ok: boolean;
  error?: string;
}

export interface Ts119612SchemaIntegrityResult {
  ok: boolean;
  files: Ts119612SchemaIntegrityFile[];
}

export async function loadTs119612SchemaManifest(): Promise<Ts119612SchemaManifest> {
  const parsed: unknown = JSON.parse(await readFile(TS119612_SCHEMA_MANIFEST_PATH, "utf8"));
  if (!isSchemaManifest(parsed)) {
    throw new Error("The ETSI TS 119 612 schema manifest is malformed.");
  }
  return parsed;
}

export async function verifyTs119612SchemaBundle(): Promise<Ts119612SchemaIntegrityResult> {
  const manifest = await loadTs119612SchemaManifest();
  const files = await Promise.all(manifest.files.map(async (file): Promise<Ts119612SchemaIntegrityFile> => {
    try {
      const contents = await readFile(resolveBundlePath(file.path));
      const actualSha256 = createHash("sha256").update(contents).digest("hex");
      const actualBytes = contents.byteLength;
      return {
        path: file.path,
        expectedSha256: file.sha256,
        actualSha256,
        expectedBytes: file.bytes,
        actualBytes,
        ok: actualSha256 === file.sha256 && actualBytes === file.bytes,
      };
    } catch (error) {
      return {
        path: file.path,
        expectedSha256: file.sha256,
        expectedBytes: file.bytes,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));
  return { ok: files.every((file) => file.ok), files };
}

export async function resolveTs119612XmlSchemaReference(reference: string): Promise<string> {
  const manifest = await loadTs119612SchemaManifest();
  const referencePath = stripFragment(reference);
  const mapped = manifest.resolvers[referencePath];
  if (!mapped) {
    throw new Error(`Unmapped ETSI TS 119 612 XML schema reference: ${reference}`);
  }
  return resolveManifestFile(manifest, mapped);
}

export async function ts119612SchemaEntrypoint(
  name: "base" | "serviceInformationExtension" | "additionalTypes",
): Promise<string> {
  const manifest = await loadTs119612SchemaManifest();
  return resolveManifestFile(manifest, manifest.entrypoints[name]);
}

export async function ts119612XmlCatalogPath(): Promise<string> {
  const manifest = await loadTs119612SchemaManifest();
  return resolveManifestFile(manifest, manifest.entrypoints.catalog);
}

function resolveManifestFile(manifest: Ts119612SchemaManifest, bundlePath: string): string {
  const normalizedPath = normalize(bundlePath).split(sep).join("/");
  const file = manifest.files.find((candidate) => candidate.path === normalizedPath);
  if (!file) {
    throw new Error(`Reference is not allowlisted by the ETSI TS 119 612 schema manifest: ${bundlePath}`);
  }
  return resolveBundlePath(file.path);
}

function resolveBundlePath(bundlePath: string): string {
  if (isAbsolute(bundlePath)) {
    throw new Error(`Absolute schema bundle path is not allowed: ${bundlePath}`);
  }
  const resolved = resolve(TS119612_SCHEMA_BUNDLE_DIRECTORY, bundlePath);
  const relativePath = relative(TS119612_SCHEMA_BUNDLE_DIRECTORY, resolved);
  if (relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    throw new Error(`Schema bundle path escapes the pinned bundle: ${bundlePath}`);
  }
  return resolved;
}

function stripFragment(reference: string): string {
  return reference.split("#", 1)[0];
}

function isSchemaManifest(value: unknown): value is Ts119612SchemaManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Ts119612SchemaManifest>;
  return candidate.manifestVersion === 1
    && candidate.standard === "ETSI TS 119 612"
    && candidate.standardVersion === "2.4.1"
    && typeof candidate.retrievedAt === "string"
    && Array.isArray(candidate.normativeSource?.attachmentFiles)
    && Array.isArray(candidate.files)
    && Array.isArray(candidate.notes)
    && !!candidate.sources
    && !!candidate.entrypoints
    && !!candidate.resolvers;
}
