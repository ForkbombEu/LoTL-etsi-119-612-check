export type Ts119602InterpretationStatus = "document_text_prevails" | "unresolved";

export interface Ts119602Interpretation {
  id: `ts119602-v1.1.1-${string}`;
  subject: string;
  conflict: string;
  sources: readonly string[];
  status: Ts119602InterpretationStatus;
  policy: string;
}

export const TS119602_INTERPRETATION_REGISTRY_VERSION = "2026-07-21" as const;

export const TS119602_INTERPRETATIONS = Object.freeze([
  interpretation(
    "ts119602-v1.1.1-uri-annex-reference",
    "Clause 6.1.2 registered URI annex reference",
    "Clause 6.1.2 refers to Annex H, while the registered URI catalogue is Annex C.",
    ["ETSI TS 119 602 V1.1.1 clause 6.1.2", "ETSI TS 119 602 V1.1.1 Annex C", "ETSI TS 119 602 V1.1.1 Annex H"],
    "unresolved",
    "Do not rewrite or normalize a registered URI based on the apparent cross-reference error; Annex C comparison remains a separate exact-value check.",
  ),
  interpretation(
    "ts119602-v1.1.1-language-annex-reference",
    "Clause 6.1.4 multilingual annex reference",
    "Clause 6.1.4 refers to Annex G, while detailed multilingual implementation rules are in Annex B.",
    ["ETSI TS 119 602 V1.1.1 clause 6.1.4", "ETSI TS 119 602 V1.1.1 Annex B", "ETSI TS 119 602 V1.1.1 Annex G"],
    "unresolved",
    "Apply locally observable Annex B multilingual restrictions and report the cross-reference ambiguity rather than inventing Annex G language rules.",
  ),
  interpretation(
    "ts119602-v1.1.1-wrprc-uri-typo",
    "Published WRPRC status-determination URI spelling",
    "Annex C.2.2 and Table G.1 publish WRPRCrovidersList, while surrounding registered URI families use WRPRCProvidersList.",
    ["ETSI TS 119 602 V1.1.1 Annex C.2.2", "ETSI TS 119 602 V1.1.1 Table G.1"],
    "unresolved",
    "Preserve the published value exactly unless an erratum or human-approved compatibility rule is supplied.",
  ),
  interpretation(
    "ts119602-v1.1.1-next-update-null",
    "Closed LoTE NextUpdate representation",
    "Clause 6.3.15 permits null for a closed LoTE; the JSON schema requires a date-time string, while the XML binding can represent closure with an empty NextUpdate wrapper.",
    ["ETSI TS 119 602 V1.1.1 clause 6.3.15", "1960201_json_schema.json#/definitions/NextUpdate", "1960201_xsd_schema.xsd#NextUpdateType"],
    "document_text_prevails",
    "Accept null JSON or an empty XML NextUpdate semantically as a closed LoTE, retain any independent schema diagnostic, and require observed service statuses to be expired.",
  ),
  interpretation(
    "ts119602-v1.1.1-postal-address-xml",
    "XML postal-address Country and Locality mismatch",
    "Clause 6.3.5.1 makes Locality optional and requires Country; the XML schema requires Locality and names the country element CountryName.",
    ["ETSI TS 119 602 V1.1.1 clause 6.3.5.1", "1960201_xsd_schema.xsd#PostalAddressType"],
    "document_text_prevails",
    "For semantic findings require StreetAddress and either binding-specific Country or CountryName, and do not fail solely because Locality is absent; keep schema validity separate.",
  ),
  interpretation(
    "ts119602-v1.1.1-table1-xml-cardinality",
    "Explicit scheme-information XML cardinalities",
    "Table 1 requires SchemeTypeCommunityRules, SchemeTerritory, and PolicyOrLegalNotice in explicit mode, while the XML schema marks them optional.",
    ["ETSI TS 119 602 V1.1.1 Table 1", "1960201_xsd_schema.xsd#LoTEListAndSchemeInformationType"],
    "document_text_prevails",
    "Apply Table 1 to semantic presence findings and retain XML schema results independently.",
  ),
  interpretation(
    "ts119602-v1.1.1-implicit-container-binding",
    "Implicit scheme information outside ListAndSchemeInformation",
    "Clause 6.3.0 permits ListAndSchemeInformation to be absent with core fields directly in the LoTE, while the published JSON and XML schemas require the container and do not expose equivalent direct fields.",
    ["ETSI TS 119 602 V1.1.1 clause 6.3.0", "1960201_json_schema.json#/definitions/LoTE", "1960201_xsd_schema.xsd#ListOfTrustedEntitiesType"],
    "document_text_prevails",
    "Assess direct core fields when present, report the inferred implicit mode, and retain the independent binding-schema failure.",
  ),
  interpretation(
    "ts119602-v1.1.1-signature-cardinality",
    "Mandatory signature versus optional XML schema element",
    "Clause 6.8 requires every LoTE to be signed, while the XML schema declares ds:Signature with minOccurs=0.",
    ["ETSI TS 119 602 V1.1.1 clause 6.8", "1960201_xsd_schema.xsd#ListOfTrustedEntitiesType"],
    "document_text_prevails",
    "Treat an absent signature as a semantic failure even if the XML schema accepts it.",
  ),
  interpretation(
    "ts119602-v1.1.1-json-service-identity-closure",
    "ServiceDigitalIdentity additionalProperties placement",
    "The JSON schema places additionalProperties inside the properties map rather than at the ServiceDigitalIdentity object level.",
    ["1960201_json_schema.json#/definitions/ServiceDigitalIdentity/properties/additionalProperties"],
    "unresolved",
    "Do not claim that schema validation closes ServiceDigitalIdentity; enforce only explicitly implemented semantic identity rules.",
  ),
] as const satisfies readonly Ts119602Interpretation[]);

export function findTs119602Interpretation(id: string): Ts119602Interpretation | undefined {
  return TS119602_INTERPRETATIONS.find((entry) => entry.id === id);
}

function interpretation(
  id: Ts119602Interpretation["id"],
  subject: string,
  conflict: string,
  sources: readonly string[],
  status: Ts119602InterpretationStatus,
  policy: string,
): Ts119602Interpretation {
  return { id, subject, conflict, sources, status, policy };
}
