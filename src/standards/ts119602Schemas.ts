import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const TS119602_SCHEMA_BUNDLE_DIRECTORY = fileURLToPath(
  new URL("../../schemas/etsi-ts-119-602/v1.1.1/", import.meta.url),
);

export const TS119602_SCHEMA_MANIFEST_PATH = resolve(TS119602_SCHEMA_BUNDLE_DIRECTORY, "manifest.json");

export interface Ts119602SchemaSource {
  repository?: string;
  tag?: string;
  commit?: string;
  archive?: string;
  license: string;
  licenseUrl?: string;
  licensePath: string;
}

export interface Ts119602SchemaFile {
  path: string;
  source: "etsiForge" | "w3c" | "local";
  sourcePath?: string;
  sourceUrl?: string;
  sha256: string;
  bytes: number;
  role: string;
  mediaType: string;
}

export interface Ts119602SchemaManifest {
  manifestVersion: number;
  standard: "ETSI TS 119 602";
  standardVersion: "1.1.1";
  bindingSchemaDraft: string;
  retrievedAt: string;
  sources: {
    etsiForge: Ts119602SchemaSource;
    w3c: Ts119602SchemaSource;
  };
  entrypoints: {
    json: Record<"base" | "serviceInformationExtension" | "trustedEntityInformationExtension", string>;
    xml: Record<"base" | "serviceInformationExtension" | "trustedEntityInformationExtension" | "catalog", string>;
  };
  resolvers: {
    json: Record<string, string>;
    xml: Record<string, string>;
  };
  notes: string[];
  files: Ts119602SchemaFile[];
}

export interface Ts119602SchemaIntegrityFile {
  path: string;
  expectedSha256: string;
  actualSha256?: string;
  expectedBytes: number;
  actualBytes?: number;
  ok: boolean;
  error?: string;
}

export interface Ts119602SchemaIntegrityResult {
  ok: boolean;
  files: Ts119602SchemaIntegrityFile[];
}

export async function loadTs119602SchemaManifest(): Promise<Ts119602SchemaManifest> {
  const parsed: unknown = JSON.parse(await readFile(TS119602_SCHEMA_MANIFEST_PATH, "utf8"));
  if (!isSchemaManifest(parsed)) {
    throw new Error("The ETSI TS 119 602 schema manifest is malformed.");
  }
  return parsed;
}

export async function verifyTs119602SchemaBundle(): Promise<Ts119602SchemaIntegrityResult> {
  const manifest = await loadTs119602SchemaManifest();
  const files = await Promise.all(manifest.files.map(async (file): Promise<Ts119602SchemaIntegrityFile> => {
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

export async function resolveTs119602JsonSchemaReference(
  reference: string,
  fromBundlePath: string,
): Promise<string> {
  const manifest = await loadTs119602SchemaManifest();
  const referencePath = stripFragment(reference);

  if (referencePath.length === 0) {
    return resolveManifestFile(manifest, fromBundlePath);
  }

  const mapped = manifest.resolvers.json[referencePath];
  if (mapped) {
    return resolveManifestFile(manifest, mapped);
  }

  rejectRemoteOrAbsoluteReference(referencePath);
  const candidate = normalize(`${dirname(fromBundlePath)}${sep}${referencePath}`).split(sep).join("/");
  return resolveManifestFile(manifest, candidate);
}

export async function resolveTs119602XmlSchemaReference(reference: string): Promise<string> {
  const manifest = await loadTs119602SchemaManifest();
  const referencePath = stripFragment(reference);
  const mapped = manifest.resolvers.xml[referencePath];
  if (!mapped) {
    throw new Error(`Unmapped ETSI TS 119 602 XML schema reference: ${reference}`);
  }
  return resolveManifestFile(manifest, mapped);
}

export async function ts119602SchemaEntrypoint(
  binding: "json" | "xml",
  name: "base" | "serviceInformationExtension" | "trustedEntityInformationExtension",
): Promise<string> {
  const manifest = await loadTs119602SchemaManifest();
  return resolveManifestFile(manifest, manifest.entrypoints[binding][name]);
}

export async function ts119602XmlCatalogPath(): Promise<string> {
  const manifest = await loadTs119602SchemaManifest();
  return resolveManifestFile(manifest, manifest.entrypoints.xml.catalog);
}

function resolveManifestFile(manifest: Ts119602SchemaManifest, bundlePath: string): string {
  const normalizedPath = normalize(bundlePath).split(sep).join("/");
  const file = manifest.files.find((candidate) => candidate.path === normalizedPath);
  if (!file) {
    throw new Error(`Reference is not allowlisted by the ETSI TS 119 602 schema manifest: ${bundlePath}`);
  }
  return resolveBundlePath(file.path);
}

function resolveBundlePath(bundlePath: string): string {
  if (isAbsolute(bundlePath)) {
    throw new Error(`Absolute schema bundle path is not allowed: ${bundlePath}`);
  }
  const resolved = resolve(TS119602_SCHEMA_BUNDLE_DIRECTORY, bundlePath);
  const relativePath = relative(TS119602_SCHEMA_BUNDLE_DIRECTORY, resolved);
  if (relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === ".." || isAbsolute(relativePath)) {
    throw new Error(`Schema bundle path escapes the pinned bundle: ${bundlePath}`);
  }
  return resolved;
}

function stripFragment(reference: string): string {
  return reference.split("#", 1)[0];
}

function rejectRemoteOrAbsoluteReference(reference: string): void {
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(reference)
    || isAbsolute(reference)
    || reference.includes("\\")
    || reference.split("/").includes("..")
  ) {
    throw new Error(`Unmapped remote or absolute schema reference is not allowed: ${reference}`);
  }
}

function isSchemaManifest(value: unknown): value is Ts119602SchemaManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Ts119602SchemaManifest>;
  return candidate.manifestVersion === 1
    && candidate.standard === "ETSI TS 119 602"
    && candidate.standardVersion === "1.1.1"
    && typeof candidate.bindingSchemaDraft === "string"
    && typeof candidate.retrievedAt === "string"
    && Array.isArray(candidate.files)
    && Array.isArray(candidate.notes)
    && !!candidate.sources
    && !!candidate.entrypoints
    && !!candidate.resolvers;
}
