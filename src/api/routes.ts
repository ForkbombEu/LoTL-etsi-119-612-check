import type { FastifyInstance } from "fastify";
import { assessArtifactUrl, runAuditFromJson, runAuditFromUrl } from "../audit.js";
import { isUrl } from "../input.js";
import { parseLotlJson } from "../lotl.js";
import { renderMarkdownReport } from "../report/markdownReport.js";
import type { AuditReport, TrustedListAuditResult } from "../types.js";
import { renderDocsHtml } from "./docs.js";
import { loadOpenApiJson, loadOpenApiYaml } from "./openapi.js";
import {
  artifactAssessUrlSchema,
  auditJsonSchema,
  auditUrlSchema,
  defaultArtifactOptions,
  defaultAuditOptions,
  lotlParseSchema,
  markdownReportSchema,
} from "./schemas.js";

export interface RouteOptions {
  version: string;
}

interface AuditUrlBody {
  url: string;
  options?: Partial<ReturnType<typeof defaultAuditOptions>>;
}

interface AuditJsonBody {
  lotl: unknown;
  options?: Partial<ReturnType<typeof defaultAuditOptions>>;
}

interface LotlParseBody {
  lotl: unknown;
}

interface ArtifactAssessUrlBody {
  url: string;
  declared?: Partial<TrustedListAuditResult["declared"]>;
  options?: Partial<ReturnType<typeof defaultArtifactOptions>>;
}

interface MarkdownReportBody {
  report: AuditReport;
}

export async function registerRoutes(app: FastifyInstance, options: RouteOptions): Promise<void> {
  app.get("/healthz", async () => ({
    ok: true,
    name: "we-build-tl-audit",
    version: options.version,
  }));

  app.get("/openapi.yaml", async (_request, reply) => {
    reply.type("application/yaml");
    return loadOpenApiYaml();
  });

  app.get("/openapi.json", async () => loadOpenApiJson());

  app.get("/docs", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return renderDocsHtml();
  });

  app.post<{ Body: AuditUrlBody }>("/api/v1/audit/url", { schema: auditUrlSchema }, async (request) => {
    if (!isUrl(request.body.url)) {
      throw request.server.httpErrors.badRequest("Invalid URL.", { code: "invalid_url" });
    }
    const result = await runAuditFromUrl(request.body.url, defaultAuditOptions(request.body.options), options.version);
    return {
      report: result.json,
      markdown: result.markdown,
    };
  });

  app.post<{ Body: AuditJsonBody }>("/api/v1/audit/json", { schema: auditJsonSchema }, async (request) => {
    const result = await runAuditFromJson(request.body.lotl, defaultAuditOptions(request.body.options), options.version);
    return {
      report: result.json,
      markdown: result.markdown,
    };
  });

  app.post<{ Body: LotlParseBody }>("/api/v1/lotl/parse", { schema: lotlParseSchema }, async (request) => {
    const parsed = parseLotlJson(lotlText(request.body.lotl));
    return {
      summary: parsed.summary,
      pointers: parsed.pointers.map((pointer) => ({
        index: pointer.index,
        location: pointer.location,
        declared: pointer.declared,
      })),
    };
  });

  app.post<{ Body: ArtifactAssessUrlBody }>("/api/v1/artifact/assess-url", { schema: artifactAssessUrlSchema }, async (request) => {
    if (!isUrl(request.body.url)) {
      throw request.server.httpErrors.badRequest("Invalid URL.", { code: "invalid_url" });
    }
    const artifactOptions = defaultArtifactOptions(request.body.options);
    const result = await assessArtifactUrl({
      url: request.body.url,
      declared: request.body.declared,
      timeoutMs: artifactOptions.timeoutMs,
      strict: artifactOptions.strict,
      includeJsonLoteChecks: artifactOptions.includeJsonLoteChecks,
    });
    return { result };
  });

  app.post<{ Body: MarkdownReportBody }>("/api/v1/report/markdown", { schema: markdownReportSchema }, async (request) => ({
    markdown: renderMarkdownReport(request.body.report),
  }));
}

function lotlText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
