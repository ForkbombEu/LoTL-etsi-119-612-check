import { readFile } from "node:fs/promises";
import { sha256Hex } from "./certs.js";

export function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function loadInput(source: string, timeoutMs: number): Promise<{
  kind: "file" | "url";
  text: string;
  bytes: Buffer;
  sha256: string;
}> {
  if (!isUrl(source)) {
    const bytes = await readFile(source);
    return {
      kind: "file",
      text: bytes.toString("utf8"),
      bytes,
      sha256: sha256Hex(bytes),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    return {
      kind: "url",
      text: bytes.toString("utf8"),
      bytes,
      sha256: sha256Hex(bytes),
    };
  } finally {
    clearTimeout(timeout);
  }
}
