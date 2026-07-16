import type { FastifySchema } from "fastify";
import type { ApiRuntimeConfig } from "./config.js";

export type AuditOptionDefaults = ApiRuntimeConfig["auditDefaults"];

const auditOptions = {
  type: "object",
  additionalProperties: false,
  properties: {
    concurrency: { type: "integer", minimum: 1, default: 4 },
    timeoutMs: { type: "integer", minimum: 1, default: 15000 },
    strict: { type: "boolean", default: false },
    includeJsonLoteChecks: { type: "boolean", default: false },
    fetch: { type: "boolean", default: true },
  },
} as const;

const artifactOptions = {
  type: "object",
  additionalProperties: false,
  properties: {
    timeoutMs: { type: "integer", minimum: 1, default: 15000 },
    strict: { type: "boolean", default: false },
    includeJsonLoteChecks: { type: "boolean", default: false },
  },
} as const;

const declaredPointer = {
  type: "object",
  additionalProperties: false,
  properties: {
    mimeType: { type: "string" },
    loteType: { type: "string" },
    schemeOperatorName: { type: "string" },
    schemeTerritory: { type: "string" },
    pointerCertificateFingerprintsSha256: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
  },
} as const;

export const auditUrlSchema: FastifySchema = {
  body: {
    type: "object",
    required: ["url"],
    additionalProperties: false,
    properties: {
      url: { type: "string", format: "uri" },
      options: auditOptions,
    },
  },
};

export const auditJsonSchema: FastifySchema = {
  body: {
    type: "object",
    required: ["lotl"],
    additionalProperties: false,
    properties: {
      lotl: {
        anyOf: [{ type: "object", additionalProperties: true }, { type: "string" }],
      },
      options: auditOptions,
    },
  },
};

export const lotlParseSchema: FastifySchema = {
  body: {
    type: "object",
    required: ["lotl"],
    additionalProperties: false,
    properties: {
      lotl: {
        anyOf: [{ type: "object", additionalProperties: true }, { type: "string" }],
      },
    },
  },
};

export const artifactAssessUrlSchema: FastifySchema = {
  body: {
    type: "object",
    required: ["url"],
    additionalProperties: false,
    properties: {
      url: { type: "string", format: "uri" },
      declared: declaredPointer,
      options: artifactOptions,
    },
  },
};

export const markdownReportSchema: FastifySchema = {
  body: {
    type: "object",
    required: ["report"],
    additionalProperties: false,
    properties: {
      report: { type: "object", additionalProperties: true },
    },
  },
};

export function defaultAuditOptions(input: Partial<AuditOptionDefaults> | undefined, defaults: AuditOptionDefaults): AuditOptionDefaults {
  return {
    concurrency: input?.concurrency ?? defaults.concurrency,
    timeoutMs: input?.timeoutMs ?? defaults.timeoutMs,
    strict: input?.strict ?? defaults.strict,
    includeJsonLoteChecks: input?.includeJsonLoteChecks ?? defaults.includeJsonLoteChecks,
    fetch: input?.fetch ?? defaults.fetch,
  };
}

export function defaultArtifactOptions(input: Partial<Omit<AuditOptionDefaults, "concurrency" | "fetch">> | undefined, defaults: AuditOptionDefaults): Omit<AuditOptionDefaults, "concurrency" | "fetch"> {
  return {
    timeoutMs: input?.timeoutMs ?? defaults.timeoutMs,
    strict: input?.strict ?? defaults.strict,
    includeJsonLoteChecks: input?.includeJsonLoteChecks ?? defaults.includeJsonLoteChecks,
  };
}
