import { describe, expect, it } from "vitest";
import { REFERENCE_SOURCES, referenceSourceIds, resolveReferenceSource } from "../src/referenceSources.js";

describe("reference sources", () => {
  it("resolves all supported named sources without network access", () => {
    expect(referenceSourceIds()).toEqual([
      "eudi-ri-tlp",
      "we-build-lotl-json",
      "we-build-lotl-xml",
    ]);
    expect(REFERENCE_SOURCES).toHaveLength(3);
    expect(resolveReferenceSource("eudi-ri-tlp")).toMatchObject({
      url: "https://trustedlist.serviceproviders.eudiw.dev/",
    });
    expect(resolveReferenceSource("we-build-lotl-json")).toMatchObject({
      url: "https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.json",
    });
    expect(resolveReferenceSource("we-build-lotl-xml")).toMatchObject({
      url: "https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.xml",
    });
  });

  it("does not resolve an unknown source", () => {
    expect(resolveReferenceSource("unknown-source")).toBeUndefined();
  });
});
