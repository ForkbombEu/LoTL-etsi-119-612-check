import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assessArtifactContent } from "../src/audit.js";
import { detectArtifact } from "../src/detect.js";
import { classifyTs119602Artifact, profileFromLoteType } from "../src/standards/ts119602Classification.js";

const PUB_EAA = "http://uri.etsi.org/19602/LoTEType/EUPubEAAProvidersList";
const WALLET = "http://uri.etsi.org/19602/LoTEType/EUWalletProvidersList";

describe("TS 119 602 artifact classification", () => {
  it("matches registered profile URIs exactly without heuristic normalization", () => {
    expect(profileFromLoteType(PUB_EAA)).toBe("pub_eaa_providers");
    expect(profileFromLoteType(PUB_EAA.toLowerCase())).toBe("unknown");
    expect(profileFromLoteType(`${PUB_EAA}/extra`)).toBe("unknown");
  });

  it("selects data model, official JSON binding, and profile independently", () => {
    const bytes = jsonLote(PUB_EAA);
    const result = classifyTs119602Artifact({ bytes, detection: detectArtifact(bytes, "application/json") });
    expect(result).toMatchObject({
      dataModel: "ts119602",
      binding: "scheme_explicit_json",
      bindingStatus: "selected",
      profile: "pub_eaa_providers",
      profileStatus: "selected",
      applicability: "applicable",
    });
  });

  it("keeps legacy object-shaped JSON as an unsupported compatibility binding", async () => {
    const bytes = await readFile("test/fixtures/json-lote-legacy.json");
    const result = classifyTs119602Artifact({ bytes, detection: detectArtifact(bytes, "application/json") });
    expect(result).toMatchObject({
      dataModel: "ts119602",
      binding: "unknown",
      bindingStatus: "unsupported",
      applicability: "applicable",
    });
  });

  it("distinguishes the normative XML root from the WE BUILD compatibility root", () => {
    const normative = xmlLote("ListOfTrustedEntities", PUB_EAA);
    const compatibility = xmlLote("TrustedEntitiesList", PUB_EAA);
    expect(classifyTs119602Artifact({ bytes: normative, detection: detectArtifact(normative, "application/xml") })).toMatchObject({
      dataModel: "ts119602",
      binding: "scheme_explicit_xml",
      bindingStatus: "selected",
      profile: "pub_eaa_providers",
    });
    expect(classifyTs119602Artifact({ bytes: compatibility, detection: detectArtifact(compatibility, "application/xml") })).toMatchObject({
      dataModel: "ts119602",
      binding: "unknown",
      bindingStatus: "unsupported",
    });
  });

  it("does not select a profile from a foreign-namespace XML element", () => {
    const bytes = Buffer.from(`<ListOfTrustedEntities xmlns="http://uri.etsi.org/019602/v1#"><ListAndSchemeInformation><LoTEType xmlns="">${PUB_EAA}</LoTEType></ListAndSchemeInformation></ListOfTrustedEntities>`);
    const result = classifyTs119602Artifact({ bytes, detection: detectArtifact(bytes, "application/xml") });
    expect(result).toMatchObject({
      binding: "scheme_explicit_xml",
      bindingStatus: "selected",
      profile: "unknown",
      profileStatus: "not_selected",
    });
  });

  it("does not let a declared pointer profile reclassify an ordinary TS 119 612 list", () => {
    const bytes = ts119612("http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric");
    const result = classifyTs119602Artifact({
      bytes,
      detection: detectArtifact(bytes, "application/xml"),
      declaredType: PUB_EAA,
    });
    expect(result).toMatchObject({
      dataModel: "ts119612",
      binding: "ts119612_alternative_xml",
      bindingStatus: "candidate",
      profile: "unknown",
      profileStatus: "not_selected",
      applicability: "not_applicable",
    });
  });

  it("selects the alternative XML binding only from an embedded XML-capable profile", () => {
    const bytes = ts119612(PUB_EAA);
    const result = classifyTs119602Artifact({ bytes, detection: detectArtifact(bytes, "application/xml") });
    expect(result).toMatchObject({
      dataModel: "ts119602",
      binding: "ts119612_alternative_xml",
      bindingStatus: "selected",
      profile: "pub_eaa_providers",
      profileStatus: "selected",
      applicability: "applicable",
    });
  });

  it("reports conflicting embedded and declared profiles as inconclusive applicability", () => {
    const bytes = ts119612(PUB_EAA);
    const result = classifyTs119602Artifact({
      bytes,
      detection: detectArtifact(bytes, "application/xml"),
      declaredType: WALLET,
    });
    expect(result).toMatchObject({
      bindingStatus: "candidate",
      profile: "unknown",
      profileStatus: "conflict",
      applicability: "unknown",
    });
  });

  it("routes a selected alternative binding to an incomplete TS 119 602 assessment", async () => {
    const result = await assessArtifactContent({
      content: ts119612(PUB_EAA).toString("utf8"),
      contentType: "application/xml",
      strict: false,
      includeJsonLoteChecks: false,
    });
    expect(result.standardApplicability).toMatchObject({ ts119612: "applicable", ts119602: "applicable" });
    expect(result.ts119602Classification).toMatchObject({ dataModel: "ts119602", binding: "ts119612_alternative_xml" });
    expect(result.ts119602).toMatchObject({ applicable: true, conformanceLevel: "not_checked" });
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.supported", status: "pass" }),
      expect.objectContaining({ id: "ts119602.binding.ts119612_mapping", status: "not_checked" }),
    ]));
  });
});

function jsonLote(loteType: string): Buffer {
  return Buffer.from(JSON.stringify({
    LoTE: {
      ListAndSchemeInformation: { LoTEType: loteType },
      TrustedEntitiesList: [{ TrustedEntityInformation: {} }],
    },
  }));
}

function xmlLote(root: "ListOfTrustedEntities" | "TrustedEntitiesList", loteType: string): Buffer {
  return Buffer.from(`<${root} xmlns="http://uri.etsi.org/019602/v1#"><ListAndSchemeInformation><LoTEType>${loteType}</LoTEType></ListAndSchemeInformation></${root}>`);
}

function ts119612(tslType: string): Buffer {
  return Buffer.from(`<TrustServiceStatusList xmlns="http://uri.etsi.org/02231/v2#"><SchemeInformation><TSLType>${tslType}</TSLType></SchemeInformation></TrustServiceStatusList>`);
}
