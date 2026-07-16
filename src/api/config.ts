export interface ApiRuntimeConfig {
  host: string;
  port: number;
  publicBaseUrl?: string;
  corsOrigin: boolean | string | RegExp | Array<string | RegExp>;
  auditDefaults: {
    concurrency: number;
    timeoutMs: number;
    strict: boolean;
    includeJsonLoteChecks: boolean;
    fetch: boolean;
  };
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiRuntimeConfig {
  return {
    host: nonEmpty(env.HOST) ?? "127.0.0.1",
    port: integerEnv(env.PORT, 3000),
    publicBaseUrl: stripTrailingSlash(nonEmpty(env.PUBLIC_BASE_URL)),
    corsOrigin: corsOriginEnv(env.CORS_ORIGIN),
    auditDefaults: {
      concurrency: integerEnv(env.AUDIT_CONCURRENCY, 4),
      timeoutMs: integerEnv(env.AUDIT_TIMEOUT_MS, 15000),
      strict: booleanEnv(env.AUDIT_STRICT, false),
      includeJsonLoteChecks: booleanEnv(env.AUDIT_INCLUDE_JSON_LOTE_CHECKS, false),
      fetch: booleanEnv(env.AUDIT_FETCH, true),
    },
  };
}

export function requestBaseUrl(headers: { host?: string; "x-forwarded-proto"?: string | string[] }, fallback: ApiRuntimeConfig): string {
  if (fallback.publicBaseUrl) return fallback.publicBaseUrl;
  const host = headers.host;
  if (!host) return `http://${fallback.host}:${fallback.port}`;
  const protoHeader = headers["x-forwarded-proto"];
  const protocol = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  return `${protocol || "http"}://${host}`;
}

function integerEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return fallback;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function stripTrailingSlash(value: string | undefined): string | undefined {
  return value?.replace(/\/+$/, "");
}

function corsOriginEnv(value: string | undefined): boolean | string | RegExp | Array<string | RegExp> {
  const trimmed = nonEmpty(value);
  if (!trimmed || trimmed === "*") return true;
  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}
