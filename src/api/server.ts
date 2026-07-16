import { createRequire } from "node:module";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerRoutes } from "./routes.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

interface ApiError {
  code?: string;
  statusCode?: number;
  validation?: unknown;
}

export async function buildServer(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.decorate("httpErrors", {
    badRequest(message: string, details?: unknown) {
      const error = new Error(message) as Error & ApiError;
      error.statusCode = 400;
      error.code = details && typeof details === "object" && "code" in details
        ? String((details as { code: unknown }).code)
        : "invalid_request";
      return error;
    },
  });

  app.setErrorHandler((error, _request, reply) => {
    const apiError = error as Error & ApiError;
    if (apiError.validation) {
      reply.status(400).send({
        error: {
          code: "invalid_request",
          message: "Invalid request body.",
          details: apiError.validation,
        },
      });
      return;
    }

    if (error instanceof SyntaxError) {
      reply.status(400).send({
        error: {
          code: "invalid_lotl_json",
          message: apiError.message,
        },
      });
      return;
    }

    if (apiError.statusCode && apiError.statusCode >= 400 && apiError.statusCode < 500) {
      reply.status(apiError.statusCode).send({
        error: {
          code: apiError.code ?? "invalid_request",
          message: apiError.message,
        },
      });
      return;
    }

    reply.status(500).send({
      error: {
        code: "internal_error",
        message: "Unexpected internal error.",
      },
    });
  });

  await registerRoutes(app, { version: pkg.version });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? "3000");
  const app = await buildServer();
  try {
    await app.listen({ host, port });
    console.log(`we-build-tl-audit API listening on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error instanceof Error ? error : { error: String(error) });
    process.exitCode = 1;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    httpErrors: {
      badRequest(message: string, details?: unknown): Error;
    };
  }
}
