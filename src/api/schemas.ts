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

const contextArtifact = {
  type: "object",
  required: ["content"],
  additionalProperties: false,
  properties: {
    content: { type: "string", minLength: 1 },
    source: { type: "string" },
    contentType: { type: "string" },
  },
} as const;

const ts119612SignerEvidence = {
  type: "object",
  additionalProperties: false,
  properties: {
    intermediateCertificates: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 16 },
    trustAnchors: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 16 },
    revocation: {
      type: "object",
      required: ["status", "source", "checkedAt", "signerFingerprintSha256"],
      additionalProperties: false,
      properties: {
        status: { type: "string", enum: ["good", "revoked", "unknown"] },
        source: { type: "string", minLength: 1 },
        checkedAt: { type: "string", format: "date-time" },
        nextUpdate: { type: "string", format: "date-time" },
        signerFingerprintSha256: { type: "string", pattern: "^[A-Fa-f0-9]{64}$" },
      },
    },
  },
} as const;

const contextualEvidence = {
  type: "object",
  additionalProperties: false,
  properties: {
    dereference: { type: "boolean", default: false },
    priorArtifacts: { type: "array", items: contextArtifact, maxItems: 32 },
    trustedSignerFingerprintsSha256: { type: "array", items: { type: "string", pattern: "^[A-Fa-f0-9]{64}$" }, maxItems: 64 },
    ts119612Signer: ts119612SignerEvidence,
    maxDereferences: { type: "integer", minimum: 1, maximum: 32, default: 16 },
    maxBytesPerArtifact: { type: "integer", minimum: 1, maximum: 20971520, default: 5242880 },
    concurrency: { type: "integer", minimum: 1, maximum: 32, default: 4 },
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
      context: contextualEvidence,
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
      context: contextualEvidence,
    },
  },
};

export const auditLotlSchema: FastifySchema = {
  body: {
    type: "object",
    additionalProperties: false,
    anyOf: [{ required: ["url"] }, { required: ["lotl"] }, { required: ["content"] }],
    properties: {
      url: { type: "string", format: "uri" },
      lotl: { anyOf: [{ type: "object", additionalProperties: true }, { type: "string" }] },
      content: { type: "string" },
      options: auditOptions,
      rpacChain: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
      context: contextualEvidence,
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
      context: contextualEvidence,
    },
  },
};

export const artifactAssessContentSchema: FastifySchema = {
  body: {
    type: "object",
    required: ["content"],
    additionalProperties: false,
    properties: {
      content: { type: "string", minLength: 1 },
      source: { type: "string" },
      contentType: { type: "string" },
      declared: declaredPointer,
      options: artifactOptions,
      context: contextualEvidence,
    },
  },
};

export const certificateChainSchema: FastifySchema = {
  body: {
    type: "object",
    required: ["chain"],
    additionalProperties: false,
    properties: {
      chain: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" }, minItems: 1 }] },
      format: { type: "string", enum: ["pem", "der_base64", "x5c"] },
      trustAnchors: { type: "array", items: { type: "string" } },
      declaredRole: { type: "string", enum: ["wallet_provider", "pid_provider", "qeaa_provider", "pub_eaa_provider", "access_ca_or_wrpac_provider", "registration_ca_or_wrprc_provider", "registrar_or_register"] },
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
