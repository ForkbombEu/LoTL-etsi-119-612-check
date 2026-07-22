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

const pointerSignerEvidence = {
  ...ts119612SignerEvidence,
  required: ["location"],
  properties: {
    location: { type: "string", format: "uri" },
    ...ts119612SignerEvidence.properties,
  },
} as const;

const ts119602ResourceAssertions = [
  "scheme_scope_and_context",
  "approval_scheme",
  "operator_approval_process",
  "entity_approval_process",
  "approval_criteria",
  "assessor_selection_and_rules",
  "separate_body_responsibilities_and_liabilities",
  "scheme_contact_information",
  "scheme_policy_and_rules",
  "list_usage_and_interpretation",
  "policy_or_legal_notice",
] as const;

const ts119602PostalAddressEvidence = {
  type: "object",
  required: ["streetAddress", "country"],
  additionalProperties: false,
  properties: {
    streetAddress: { type: "string", minLength: 1 },
    country: { type: "string", minLength: 2 },
  },
} as const;

const ts119602AuthoritativeIdentityEvidence = {
  type: "object",
  required: ["source", "checkedAt", "names", "postalAddresses", "electronicAddresses"],
  additionalProperties: false,
  properties: {
    source: { type: "string", minLength: 1 },
    checkedAt: { type: "string", format: "date-time" },
    names: { type: "array", minItems: 1, maxItems: 64, items: { type: "string", minLength: 1 } },
    registrationIdentifiers: { type: "array", maxItems: 64, items: { type: "string", minLength: 1 } },
    postalAddresses: { type: "array", maxItems: 64, items: ts119602PostalAddressEvidence },
    electronicAddresses: { type: "array", maxItems: 64, items: { type: "string", format: "uri" } },
    associatedBodies: { type: "array", maxItems: 64, items: { type: "string", minLength: 1 } },
  },
} as const;

const ts119602ContextualEvidence = {
  type: "object",
  additionalProperties: false,
  properties: {
    resources: {
      type: "array",
      maxItems: 32,
      items: {
        type: "object",
        required: ["location", "sha256", "assertions", "source", "checkedAt"],
        additionalProperties: false,
        properties: {
          location: { type: "string", format: "uri" },
          sha256: { type: "string", pattern: "^[A-Fa-f0-9]{64}$" },
          assertions: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: ts119602ResourceAssertions } },
          source: { type: "string", minLength: 1 },
          checkedAt: { type: "string", format: "date-time" },
        },
      },
    },
    authoritative: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemeOperator: ts119602AuthoritativeIdentityEvidence,
        entities: {
          type: "array",
          maxItems: 256,
          items: {
            ...ts119602AuthoritativeIdentityEvidence,
            required: ["entityPath", ...ts119602AuthoritativeIdentityEvidence.required],
            properties: { entityPath: { type: "string", minLength: 1 }, ...ts119602AuthoritativeIdentityEvidence.properties },
          },
        },
      },
    },
    expiredServiceStatusUris: { type: "array", maxItems: 64, items: { type: "string", format: "uri" } },
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
    pointerSigners: { type: "array", items: pointerSignerEvidence, maxItems: 32 },
    ts119602: ts119602ContextualEvidence,
    maxDereferences: { type: "integer", minimum: 1, maximum: 32, default: 16 },
    maxBytesPerArtifact: { type: "integer", minimum: 1, maximum: 20971520, default: 5242880 },
    concurrency: { type: "integer", minimum: 1, maximum: 32, default: 4 },
    maxTraversalDepth: { type: "integer", minimum: 1, maximum: 8, default: 3 },
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
