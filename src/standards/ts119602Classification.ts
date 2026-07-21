import { DOMParser } from "@xmldom/xmldom";
import type { DetectionResult } from "../detect.js";
import type {
  ApplicabilityStatus,
  Ts119602Binding,
  Ts119602Classification,
  Ts119602Profile,
} from "../types.js";

const TS119602_NAMESPACE = "http://uri.etsi.org/019602/v1#";
export const TS119602_PROFILE_URIS: Readonly<Record<Exclude<Ts119602Profile, "unknown">, string>> = Object.freeze({
  pid_providers: "http://uri.etsi.org/19602/LoTEType/EUPIDProvidersList",
  wallet_providers: "http://uri.etsi.org/19602/LoTEType/EUWalletProvidersList",
  wrpac_providers: "http://uri.etsi.org/19602/LoTEType/EUWRPACProvidersList",
  wrprc_providers: "http://uri.etsi.org/19602/LoTEType/EUWRPRCProvidersList",
  pub_eaa_providers: "http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList",
  registrars_and_registers: "http://uri.etsi.org/19602/LoTEType/EURegistrarsAndRegistersList",
});

export interface Ts119602ClassificationInput {
  bytes: Buffer;
  detection: DetectionResult;
  declaredType?: string;
}

/** Classify data model, Annex A binding, and Annex D-I profile independently. */
export function classifyTs119602Artifact(input: Ts119602ClassificationInput): Ts119602Classification {
  const declaredProfile = profileFromLoteType(input.declaredType);
  if (input.detection.artifactKind === "json_lote" || input.detection.artifactKind === "json_lotl") {
    return classifyJson(input.detection.parsedJson, input.declaredType, declaredProfile);
  }
  if (input.detection.format === "xml") {
    return classifyXml(input.bytes.toString("utf8"), input.detection, input.declaredType, declaredProfile);
  }
  return createUnknownTs119602Classification(input.declaredType, declaredProfile);
}

export function profileFromLoteType(value: string | undefined): Ts119602Profile {
  if (!value) return "unknown";
  const match = Object.entries(TS119602_PROFILE_URIS).find(([, uri]) => value === uri);
  return match ? match[0] as Exclude<Ts119602Profile, "unknown"> : "unknown";
}

function classifyJson(
  parsed: unknown,
  declaredType: string | undefined,
  declaredProfile: Ts119602Profile,
): Ts119602Classification {
  const lote = recordValue(parsed, "LoTE");
  const information = recordValue(lote, "ListAndSchemeInformation");
  const embeddedType = stringValue(information, "LoTEType");
  const embeddedProfile = profileFromLoteType(embeddedType);
  const trustedEntities = valueAt(lote, "TrustedEntitiesList");
  const officialArrayShape = Boolean(lote && information)
    && (trustedEntities === undefined || Array.isArray(trustedEntities));
  const profile = selectProfile(embeddedProfile, declaredProfile);
  const profileStatus = profileSelectionStatus(embeddedProfile, declaredProfile);
  const reasons = [
    officialArrayShape
      ? "The JSON LoTE wrapper and TrustedEntitiesList shape match the scheme-explicit JSON binding discriminator."
      : "The JSON LoTE structure does not match the required scheme-explicit JSON wrapper and TrustedEntitiesList array discriminators.",
    ...profileReasons(embeddedProfile, declaredProfile),
  ];
  return {
    dataModel: "ts119602",
    binding: officialArrayShape ? "scheme_explicit_json" : "unknown",
    bindingStatus: officialArrayShape ? "selected" : "unsupported",
    profile,
    profileStatus,
    applicability: "applicable",
    reasons,
    evidence: { embeddedType, declaredType, embeddedProfile, declaredProfile },
  };
}

function classifyXml(
  xml: string,
  detection: DetectionResult,
  declaredType: string | undefined,
  declaredProfile: Ts119602Profile,
): Ts119602Classification {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const root = document.documentElement;
  const rootLocalName = root?.localName || root?.nodeName;
  const rootNamespace = root?.namespaceURI ?? undefined;
  const embeddedType = firstElementText(
    document,
    detection.artifactKind === "xml_lote" ? "LoTEType" : "TSLType",
    detection.artifactKind === "xml_lote" ? TS119602_NAMESPACE : rootNamespace,
  );
  const embeddedProfile = profileFromLoteType(embeddedType);
  const profile = selectProfile(embeddedProfile, declaredProfile);
  const profileStatus = profileSelectionStatus(embeddedProfile, declaredProfile);
  const evidence = { rootLocalName, rootNamespace, embeddedType, declaredType, embeddedProfile, declaredProfile };

  if (detection.artifactKind === "xml_lote") {
    const normativeRoot = rootLocalName === "ListOfTrustedEntities" && rootNamespace === TS119602_NAMESPACE;
    return {
      dataModel: "ts119602",
      binding: normativeRoot ? "scheme_explicit_xml" : "unknown",
      bindingStatus: normativeRoot ? "selected" : "unsupported",
      profile,
      profileStatus,
      applicability: "applicable",
      reasons: [
        normativeRoot
          ? "The root selects the ETSI TS 119 602 scheme-explicit XML binding."
          : "The XML LoTE compatibility root is not selected as a normative Annex A binding.",
        ...profileReasons(embeddedProfile, declaredProfile),
      ],
      evidence,
    };
  }

  if (detection.artifactKind === "ts119612_xml_tsl" || detection.artifactKind === "ts119612_xml_lotl") {
    const conflict = profileStatus === "conflict";
    const profileAllowsAlternativeBinding = embeddedProfile === "pub_eaa_providers";
    const selected = profileAllowsAlternativeBinding && !conflict;
    const applicability: ApplicabilityStatus = selected ? "applicable" : conflict ? "unknown" : "not_applicable";
    return {
      dataModel: selected ? "ts119602" : "ts119612",
      binding: "ts119612_alternative_xml",
      bindingStatus: selected ? "selected" : "candidate",
      profile,
      profileStatus,
      applicability,
      reasons: [
        selected
          ? "The embedded LoTE type selects the Pub-EAA profile, which permits an XML binding through Annex A.2."
          : "The TS 119 612 document remains only an Annex A.2.2 candidate because embedded profile evidence does not select an XML-capable TS 119 602 profile.",
        ...profileReasons(embeddedProfile, declaredProfile),
      ],
      evidence,
    };
  }

  return {
    ...createUnknownTs119602Classification(declaredType, declaredProfile),
    evidence,
  };
}

export function createUnknownTs119602Classification(
  declaredType?: string,
  declaredProfile: Ts119602Profile = profileFromLoteType(declaredType),
): Ts119602Classification {
  return {
    dataModel: "unknown",
    binding: "unknown",
    bindingStatus: "not_applicable",
    profile: "unknown",
    profileStatus: "not_selected",
    applicability: "unknown",
    reasons: ["The artifact does not expose a recognized TS 119 602 or TS 119 612 binding discriminator."],
    evidence: { declaredType, declaredProfile },
  };
}

function selectProfile(embedded: Ts119602Profile, declared: Ts119602Profile): Ts119602Profile {
  if (embedded === "unknown") return "unknown";
  return declared !== "unknown" && declared !== embedded ? "unknown" : embedded;
}

function profileSelectionStatus(
  embedded: Ts119602Profile,
  declared: Ts119602Profile,
): Ts119602Classification["profileStatus"] {
  if (embedded === "unknown") return "not_selected";
  return declared !== "unknown" && declared !== embedded ? "conflict" : "selected";
}

function profileReasons(embedded: Ts119602Profile, declared: Ts119602Profile): string[] {
  if (embedded === "unknown" && declared !== "unknown") {
    return ["The declared pointer profile is recorded as evidence but cannot select a profile without matching embedded type evidence."];
  }
  if (embedded !== "unknown" && declared !== "unknown" && embedded !== declared) {
    return ["Embedded and declared LoTE profile evidence conflict; no TS 119 602 profile is selected."];
  }
  if (embedded !== "unknown") return [`The embedded LoTE type selects the ${embedded} profile.`];
  return ["No Annex D-I profile is selected from the embedded LoTE type."];
}

function firstElementText(
  document: ReturnType<DOMParser["parseFromString"]>,
  localName: string,
  namespace: string | undefined,
): string | undefined {
  const nodes = document.getElementsByTagNameNS(namespace ?? "*", localName);
  const value = nodes.item(0)?.textContent?.trim();
  return value || undefined;
}

function recordValue(value: unknown, key: string): Record<string, unknown> | undefined {
  const nested = valueAt(value, key);
  return typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : undefined;
}

function valueAt(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function stringValue(value: unknown, key: string): string | undefined {
  const nested = valueAt(value, key);
  return typeof nested === "string" ? nested : undefined;
}
