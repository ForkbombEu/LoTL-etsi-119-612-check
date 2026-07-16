import { DOMParser } from "@xmldom/xmldom";
import type { ArtifactKind, DetectedFormat } from "./types.js";

export interface DetectionResult {
  format: DetectedFormat;
  artifactKind: ArtifactKind;
  parsedJson?: unknown;
}

export function detectArtifact(bytes: Buffer | undefined, contentType?: string): DetectionResult {
  if (!bytes || bytes.length === 0) {
    return { format: "empty", artifactKind: "unknown" };
  }
  const text = bytes.toString("utf8").trimStart();
  const lowerContentType = contentType?.toLowerCase() ?? "";

  if (lowerContentType.includes("json") || startsJson(text)) {
    try {
      const parsedJson = JSON.parse(bytes.toString("utf8"));
      return {
        format: "json",
        artifactKind: isJsonLote(parsedJson) ? "json_lote" : "unknown",
        parsedJson,
      };
    } catch {
      return { format: "text", artifactKind: "unknown" };
    }
  }

  if (lowerContentType.includes("html") || /^<!doctype\s+html/i.test(text) || /^<html[\s>]/i.test(text)) {
    return { format: "html", artifactKind: "html_error" };
  }

  if (lowerContentType.includes("xml") || text.startsWith("<")) {
    const doc = new DOMParser().parseFromString(bytes.toString("utf8"), "application/xml");
    const root = doc.documentElement;
    const localName = root?.localName ?? root?.nodeName;
    if (root && localName === "TrustServiceStatusList") {
      return {
        format: "xml",
        artifactKind:
          root.namespaceURI === "http://uri.etsi.org/19612/v2.4.1#"
            ? "ts119612_xml_tsl"
            : "xml_lotl_like",
      };
    }
    return { format: "xml", artifactKind: "unknown" };
  }

  if (lowerContentType.startsWith("text/") || text.length > 0) {
    return { format: "text", artifactKind: "unknown" };
  }
  return { format: "unknown", artifactKind: "unknown" };
}

function startsJson(text: string): boolean {
  return text.startsWith("{") || text.startsWith("[");
}

function isJsonLote(value: unknown): boolean {
  return typeof value === "object" && value !== null && "LoTE" in value;
}
