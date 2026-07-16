import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, "../../openapi/we-build-tl-audit.openapi.yaml");

export async function loadOpenApiYaml(): Promise<string> {
  return readFile(specPath, "utf8");
}

export async function loadOpenApiJson(): Promise<unknown> {
  return YAML.parse(await loadOpenApiYaml()) as unknown;
}
