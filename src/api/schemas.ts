import type { FastifySchema } from "fastify";

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

export function defaultAuditOptions(input?: Partial<{
  concurrency: number;
  timeoutMs: number;
  strict: boolean;
  includeJsonLoteChecks: boolean;
  fetch: boolean;
}>): {
  concurrency: number;
  timeoutMs: number;
  strict: boolean;
  includeJsonLoteChecks: boolean;
  fetch: boolean;
} {
  return {
    concurrency: input?.concurrency ?? 4,
    timeoutMs: input?.timeoutMs ?? 15000,
    strict: input?.strict ?? false,
    includeJsonLoteChecks: input?.includeJsonLoteChecks ?? false,
    fetch: input?.fetch ?? true,
  };
}

export function defaultArtifactOptions(input?: Partial<{
  timeoutMs: number;
  strict: boolean;
  includeJsonLoteChecks: boolean;
}>): {
  timeoutMs: number;
  strict: boolean;
  includeJsonLoteChecks: boolean;
} {
  return {
    timeoutMs: input?.timeoutMs ?? 15000,
    strict: input?.strict ?? false,
    includeJsonLoteChecks: input?.includeJsonLoteChecks ?? false,
  };
}
