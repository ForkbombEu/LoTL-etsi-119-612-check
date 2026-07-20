import { certificateFingerprintSha256 } from "./certs.js";
import type { PointerInfo } from "./types.js";

export interface ParsedLotl {
  raw: unknown;
  pointers: PointerInfo[];
  summary: {
    schemeOperatorName?: string;
    schemeName?: string;
    loteType?: string;
    sequenceNumber?: number;
    issueDateTime?: string;
    nextUpdate?: string;
    pointerCount: number;
    uniqueLocationCount: number;
    duplicateLocations: string[];
  };
}

export function parseLotlJson(text: string): ParsedLotl {
  const raw = JSON.parse(text) as unknown;
  const info = getPath(raw, ["LoTE", "ListAndSchemeInformation"]);
  const pointerValue = getPath(info, ["PointersToOtherLoTE"]);
  const pointerArray = asArray(pointerValue);
  const pointers = pointerArray.flatMap((pointer, zeroIndex) => {
    const location = stringValue(getPath(pointer, ["LoTELocation"]));
    if (!location) {
      return [];
    }
    return [
      {
        index: zeroIndex + 1,
        location,
        declared: {
          mimeType: qualifierValue(pointer, "MimeType"),
          loteType: qualifierValue(pointer, "LoTEType"),
          schemeOperatorName: firstString(getPath(pointer, ["SchemeOperatorName"])),
          schemeTerritory: firstString(getPath(pointer, ["SchemeTerritory"])),
          pointerCertificateFingerprintsSha256: extractPointerFingerprints(pointer),
        },
        raw: pointer,
      },
    ];
  });

  const locations = pointers.map((p) => p.location);
  const counts = new Map<string, number>();
  for (const location of locations) {
    counts.set(location, (counts.get(location) ?? 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([location]) => location);

  return {
    raw,
    pointers,
    summary: {
      schemeOperatorName: firstString(getPath(info, ["SchemeOperatorName"])),
      schemeName: firstString(getPath(info, ["SchemeName"])),
      loteType: firstString(getPath(info, ["LoTEType"])),
      sequenceNumber: numberValue(getPath(info, ["LoTESequenceNumber"])),
      issueDateTime: firstString(getPath(info, ["ListIssueDateTime"])),
      nextUpdate: firstString(getPath(info, ["NextUpdate"])),
      pointerCount: pointers.length,
      uniqueLocationCount: counts.size,
      duplicateLocations: duplicates,
    },
  };
}

export function getPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

export function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isRecord(value)) {
    for (const key of ["value", "#text", "_", "$t"]) {
      const nested = value[key];
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  return undefined;
}

export function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const direct = stringValue(value);
    if (direct) return direct;
    for (const item of asArray(value)) {
      const nested = stringValue(item);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function qualifierValue(pointer: unknown, name: "LoTEType" | "MimeType"): string | undefined {
  for (const qualifier of asArray(getPath(pointer, ["LoTEQualifiers"]))) {
    const value = stringValue(getPath(qualifier, [name]));
    if (value) return value;
  }
  return undefined;
}

function extractPointerFingerprints(pointer: unknown): string[] {
  const identities = asArray(getPath(pointer, ["ServiceDigitalIdentities"]));
  const fingerprints = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string" && value.length > 200) {
      const fingerprint = certificateFingerprintSha256(value);
      if (fingerprint) fingerprints.add(fingerprint);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, nested] of Object.entries(value)) {
      if (/X509Certificate|certificate/i.test(key)) visit(nested);
      else if (typeof nested === "object") visit(nested);
    }
  };
  identities.forEach(visit);
  return [...fingerprints].sort();
}
