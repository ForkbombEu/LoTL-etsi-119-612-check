import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { sha256Hex } from "./certs.js";
import type { TrustedListAuditResult } from "./types.js";

export interface FetchResult {
  fetch: TrustedListAuditResult["fetch"];
  bytes?: Buffer;
}

export async function fetchArtifact(location: string, timeoutMs: number): Promise<FetchResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(location, { signal: controller.signal });
    const arrayBuffer = await response.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    return {
      fetch: {
        attempted: true,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        finalUrl: response.url,
        contentType: response.headers.get("content-type") ?? undefined,
        durationMs: Date.now() - started,
        sha256: sha256Hex(bytes),
        bytes: bytes.length,
        error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`,
      },
      bytes,
    };
  } catch (error) {
    return {
      fetch: {
        attempted: true,
        ok: false,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function saveFetchedArtifact(
  outDir: string,
  index: number,
  location: string,
  bytes: Buffer,
  format: string,
): Promise<string> {
  const dir = join(outDir, "fetched");
  await mkdir(dir, { recursive: true });
  const extension = format === "xml" || format === "json" || format === "jws" ? format : "txt";
  const basename = safeFileName(`${String(index).padStart(3, "0")}-${location}`);
  const file = join(dir, `${basename}${extname(basename) ? "" : `.${extension}`}`);
  await writeFile(file, bytes);
  return file;
}

function safeFileName(value: string): string {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}
