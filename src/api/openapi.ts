import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, "../../openapi/we-build-tl-audit.openapi.yaml");

export async function loadOpenApiYaml(serverUrl?: string): Promise<string> {
  if (!serverUrl) return readFile(specPath, "utf8");
  const document = await loadOpenApiDocument(serverUrl);
  return YAML.stringify(document);
}

export async function loadOpenApiJson(serverUrl?: string): Promise<unknown> {
  return loadOpenApiDocument(serverUrl);
}

async function loadOpenApiDocument(serverUrl?: string): Promise<Record<string, unknown>> {
  const document = YAML.parse(await readFile(specPath, "utf8")) as Record<string, unknown>;
  if (serverUrl) {
    document.servers = [{ url: serverUrl }];
  }
  return document;
}
