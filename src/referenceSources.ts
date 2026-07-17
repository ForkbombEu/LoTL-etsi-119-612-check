export interface ReferenceSourceDefinition {
  id: ReferenceSourceId;
  label: string;
  url: string;
  description: string;
}

export type ReferenceSourceId =
  | "eudi-ri-tlp"
  | "we-build-lotl-json"
  | "we-build-lotl-xml";

export const REFERENCE_SOURCES: readonly ReferenceSourceDefinition[] = [
  {
    id: "eudi-ri-tlp",
    label: "EUDI RI Trusted List Provider",
    url: "https://trustedlist.serviceproviders.eudiw.dev/",
    description: "EUDI Reference Implementation hosted trusted-list service; a test/reference input, not an implicit production trust root.",
  },
  {
    id: "we-build-lotl-json",
    label: "WE BUILD WP4 LoTL JSON",
    url: "https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.json",
    description: "WE BUILD WP4 List of Trusted Lists in JSON form.",
  },
  {
    id: "we-build-lotl-xml",
    label: "WE BUILD WP4 LoTL XML",
    url: "https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.xml",
    description: "WE BUILD WP4 List of Trusted Lists in XML form.",
  },
] as const;

export function resolveReferenceSource(id: string): ReferenceSourceDefinition | undefined {
  return REFERENCE_SOURCES.find((source) => source.id === id);
}

export function referenceSourceIds(): string[] {
  return REFERENCE_SOURCES.map((source) => source.id);
}
