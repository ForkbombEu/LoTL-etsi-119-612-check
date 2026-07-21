import { asArray, getPath, isRecord } from "../lotl.js";

export interface LegacyTslLikeJsonLote {
  kind: "legacy_we_build_tsl_like";
  lote: Record<string, unknown>;
  listAndSchemeInformation?: Record<string, unknown>;
  trustedEntities: unknown[];
  observedPath: "/LoTE/TrustedEntitiesList/TrustServiceProvider";
  normativePath: "/LoTE/TrustedEntitiesList[]";
}

/**
 * Retain evidence from the pre-standard WE BUILD/TSL-like JSON shape without
 * presenting it to the normative TS 119 602 parser as an official binding.
 */
export function adaptLegacyTslLikeJsonLote(value: unknown): LegacyTslLikeJsonLote | undefined {
  const lote = getPath(value, ["LoTE"]);
  const container = getPath(lote, ["TrustedEntitiesList"]);
  if (!isRecord(lote) || !isRecord(container) || !("TrustServiceProvider" in container)) return undefined;
  const information = getPath(lote, ["ListAndSchemeInformation"]);
  return {
    kind: "legacy_we_build_tsl_like",
    lote,
    listAndSchemeInformation: isRecord(information) ? information : undefined,
    trustedEntities: asArray(container.TrustServiceProvider),
    observedPath: "/LoTE/TrustedEntitiesList/TrustServiceProvider",
    normativePath: "/LoTE/TrustedEntitiesList[]",
  };
}
