import { DOMParser } from "@xmldom/xmldom";
import type { ArtifactKind, DetectedFormat } from "./types.js";

const ETSI_TS119612_NAMESPACE = "http://uri.etsi.org/19612/v2.4.1#";
const ETSI_TS119602_NAMESPACE = "http://uri.etsi.org/019602/v1#";

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
        artifactKind: jsonArtifactKind(parsedJson),
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
    if (root && localName === "TrustServiceStatusList" && root.namespaceURI === ETSI_TS119612_NAMESPACE) {
      return {
        format: "xml",
        artifactKind: isXmlLotl(root) ? "ts119612_xml_lotl" : "ts119612_xml_tsl",
      };
    }
    if (root && localName === "TrustedEntitiesList" && root.namespaceURI === ETSI_TS119602_NAMESPACE) {
      return { format: "xml", artifactKind: "xml_lote" };
    }
    if (root && localName === "TrustServiceStatusList") return { format: "xml", artifactKind: "xml_lotl_like" };
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

function jsonArtifactKind(value: unknown): ArtifactKind {
  if (typeof value !== "object" || value === null || !("LoTE" in value)) return "unknown";
  const loteType = getJsonLoteType(value);
  return /(?:listoftrustedlists|listoflists|lotl)/i.test(loteType) ? "json_lotl" : "json_lote";
}

function getJsonLoteType(value: object): string {
  const root = "LoTE" in value ? value.LoTE : undefined;
  if (typeof root !== "object" || root === null || !("ListAndSchemeInformation" in root)) return "";
  const information = root.ListAndSchemeInformation;
  if (typeof information !== "object" || information === null || !("LoTEType" in information)) return "";
  return typeof information.LoTEType === "string" ? information.LoTEType : "";
}

function isXmlLotl(root: unknown): boolean {
  if (!root || typeof root !== "object" || !("getElementsByTagNameNS" in root)) return false;
  const getElementsByTagNameNS = (root as {
    getElementsByTagNameNS: (namespace: string, localName: string) => {
      length: number;
      item: (index: number) => { textContent?: string | null } | null;
    };
  }).getElementsByTagNameNS;
  const tslTypes = getElementsByTagNameNS.call(root, "*", "TSLType");
  for (let index = 0; index < tslTypes.length; index += 1) {
    if (/(?:listofthelists|listoflists|lotl)/i.test(tslTypes.item(index)?.textContent ?? "")) return true;
  }
  return false;
}
