import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { AnySchema, ErrorObject, ValidateFunction } from "ajv";
import { TS119602_SCHEMA_BUNDLE_DIRECTORY } from "../standards/ts119602Schemas.js";

const BASE_SCHEMA_PATH = "1960201_json_schema/1960201_json_schema.json";
const SIE_SCHEMA_PATH = "1960201_json_schema/1960201_json_schema_sie.json";
const TIE_SCHEMA_PATH = "1960201_json_schema/1960201_json_schema_tie.json";
const RFC7517_SCHEMA_PATH = "1960201_json_schema/rfcs/rfc7517.json";
const LOCAL_SCHEMA_ORIGIN = "https://ts119602.invalid/v1.1.1/";
const BASE_SCHEMA_ID = `${LOCAL_SCHEMA_ORIGIN}1960201-jsonSchema.json`;
const SIE_SCHEMA_ID = `${LOCAL_SCHEMA_ORIGIN}1960201_json_schema_sie.json`;
const TIE_SCHEMA_ID = `${LOCAL_SCHEMA_ORIGIN}1960201_json_schema_tie.json`;
const RFC7517_SCHEMA_ID = `${LOCAL_SCHEMA_ORIGIN}rfcs/rfc7517.json`;

interface OfflineAjv {
  addSchema(schema: AnySchema, key: string): OfflineAjv;
  getSchema(key: string): ValidateFunction | undefined;
}

type OfflineAjvConstructor = new (options: Record<string, unknown>) => OfflineAjv;
type AddFormats = (ajv: OfflineAjv, options: { mode: "full" }) => OfflineAjv;

const nodeRequire = createRequire(import.meta.url);
const Ajv = nodeRequire("ajv") as OfflineAjvConstructor;
const addFormats = nodeRequire("ajv-formats") as AddFormats;

export interface Ts119602JsonSchemaDiagnostic {
  jsonPointer: string;
  schemaPath: string;
  keyword: string;
  message: string;
  expected: unknown;
  observed: unknown;
  observedType: string;
  params: Record<string, unknown>;
}

export interface Ts119602JsonSchemaIdentity {
  standard: "ETSI TS 119 602";
  version: "1.1.1";
  draft: "http://json-schema.org/draft-07/schema#";
  sourcePath: string;
  sourceRepository: string;
  sourceTag: string;
  sourceCommit: string;
  sha256: string;
}

export interface Ts119602JsonSchemaValidation {
  valid: boolean;
  schema: Ts119602JsonSchemaIdentity;
  errors: Ts119602JsonSchemaDiagnostic[];
}

export type Ts119602JsonSchemaTarget =
  | "base"
  | "serviceInformationExtension"
  | "trustedEntityInformationExtension";

const schemaIdentities = loadSchemaIdentities();
const validators = buildValidators();

/** Validate the published V1.1.1 JSON binding with no network-capable loader. */
export function validateTs119602JsonSchema(
  value: unknown,
  target: Ts119602JsonSchemaTarget = "base",
): Ts119602JsonSchemaValidation {
  const validator = validators[target];
  const valid = validator(value) === true;
  return {
    valid,
    schema: schemaIdentities[target],
    errors: valid ? [] : (validator.errors ?? []).map((error) => diagnostic(error, value)),
  };
}

function buildValidators(): Record<Ts119602JsonSchemaTarget, ValidateFunction> {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  });
  addFormats(ajv, { mode: "full" });

  ajv.addSchema(readSchema(RFC7517_SCHEMA_PATH), RFC7517_SCHEMA_ID);
  // The published TIE schema uses this hyphenated filename. Keeping the local
  // key preserves that reference without modifying the pinned upstream bytes.
  ajv.addSchema(readSchema(BASE_SCHEMA_PATH), BASE_SCHEMA_ID);
  ajv.addSchema(readSchema(SIE_SCHEMA_PATH), SIE_SCHEMA_ID);
  ajv.addSchema(readSchema(TIE_SCHEMA_PATH), TIE_SCHEMA_ID);

  // Force compilation now so unresolved references fail deterministically at
  // process startup instead of triggering a runtime or network fallback.
  const sieValidator = ajv.getSchema(`${SIE_SCHEMA_ID}#/definitions/ServiceUniqueIdentifier`);
  const tieValidator = ajv.getSchema(`${TIE_SCHEMA_ID}#/definitions/OtherAssociatedBodies`);
  const validator = ajv.getSchema(BASE_SCHEMA_ID);
  if (!validator || !sieValidator || !tieValidator) {
    throw new Error("The pinned ETSI TS 119 602 JSON schema set could not be compiled.");
  }
  return {
    base: validator,
    serviceInformationExtension: sieValidator,
    trustedEntityInformationExtension: tieValidator,
  };
}

function readSchema(bundlePath: string): AnySchema {
  return JSON.parse(readFileSync(resolve(TS119602_SCHEMA_BUNDLE_DIRECTORY, bundlePath), "utf8")) as AnySchema;
}

function loadSchemaIdentities(): Record<Ts119602JsonSchemaTarget, Ts119602JsonSchemaIdentity> {
  const manifest = JSON.parse(readFileSync(
    resolve(TS119602_SCHEMA_BUNDLE_DIRECTORY, "manifest.json"),
    "utf8",
  )) as {
    standard: string;
    standardVersion: string;
    bindingSchemaDraft: string;
    sources: { etsiForge: { repository: string; tag: string; commit: string } };
    files: Array<{ path: string; sha256: string }>;
  };
  const files = {
    base: manifest.files.find((candidate) => candidate.path === BASE_SCHEMA_PATH),
    serviceInformationExtension: manifest.files.find((candidate) => candidate.path === SIE_SCHEMA_PATH),
    trustedEntityInformationExtension: manifest.files.find((candidate) => candidate.path === TIE_SCHEMA_PATH),
  };
  if (
    manifest.standard !== "ETSI TS 119 602"
    || manifest.standardVersion !== "1.1.1"
    || manifest.bindingSchemaDraft !== "http://json-schema.org/draft-07/schema#"
    || Object.values(files).some((file) => !file)
  ) {
    throw new Error("The pinned ETSI TS 119 602 JSON schema identity is incomplete.");
  }
  return Object.fromEntries(Object.entries(files).map(([target, file]) => [target, {
    standard: "ETSI TS 119 602",
    version: "1.1.1",
    draft: "http://json-schema.org/draft-07/schema#",
    sourcePath: file!.path,
    sourceRepository: manifest.sources.etsiForge.repository,
    sourceTag: manifest.sources.etsiForge.tag,
    sourceCommit: manifest.sources.etsiForge.commit,
    sha256: file!.sha256,
  }])) as Record<Ts119602JsonSchemaTarget, Ts119602JsonSchemaIdentity>;
}

function diagnostic(error: ErrorObject, value: unknown): Ts119602JsonSchemaDiagnostic {
  const params = error.params as Record<string, unknown>;
  const jsonPointer = error.keyword === "required" && typeof params.missingProperty === "string"
    ? `${error.instancePath}/${escapeJsonPointer(params.missingProperty)}`
    : error.keyword === "additionalProperties" && typeof params.additionalProperty === "string"
      ? `${error.instancePath}/${escapeJsonPointer(params.additionalProperty)}`
      : error.instancePath;
  const observed = error.keyword === "required" ? undefined : valueAtJsonPointer(value, jsonPointer);
  return {
    jsonPointer,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? "JSON Schema validation failed.",
    expected: expectedValue(error.keyword, params),
    observed: observed ?? null,
    observedType: observed === undefined ? "missing" : jsonType(observed),
    params,
  };
}

function expectedValue(keyword: string, params: Record<string, unknown>): unknown {
  if (keyword === "required") return { requiredProperty: params.missingProperty };
  if (keyword === "additionalProperties") return { additionalPropertyAllowed: false };
  if (keyword === "minItems") return { minimumItems: params.limit };
  if (keyword === "type") return { type: params.type };
  if (keyword === "format") return { format: params.format };
  return params;
}

function valueAtJsonPointer(value: unknown, pointer: string): unknown {
  if (!pointer) return value;
  let current = value;
  for (const token of pointer.slice(1).split("/")) {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      current = current[Number(key)];
    } else if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function escapeJsonPointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number" && Number.isInteger(value)) return "integer";
  return typeof value;
}
