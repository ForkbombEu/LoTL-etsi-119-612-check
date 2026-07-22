import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { parseCompactJades } from "../src/json/jades.js";
import { assessJsonLote } from "../src/json/loteChecks.js";
import type { CheckResult, Ts119602Profile } from "../src/types.js";
import type { Ts119602EntitiesInput, Ts119602ServiceObservation } from "../src/standards/ts119602Entities.js";
import { TS119602_SCHEME_FIELDS, type Ts119602MetadataInput } from "../src/standards/ts119602Metadata.js";
import {
  buildTs119602ProfileFindings,
  TS119602_PROFILE_REGISTRY,
  type Ts119602ProfileAssessmentInput,
} from "../src/standards/ts119602Profiles.js";

type SelectedProfile = Exclude<Ts119602Profile, "unknown">;

let certificate = "";
let endEntityCertificate = "";
let caCertificate = "";

beforeAll(async () => {
  const compact = (await readFile("test/fixtures/ts119602-jades-compact.jws", "utf8")).trim();
  const header = parseCompactJades(compact).protectedHeader;
  certificate = (header?.x5c as string[])[0];
  endEntityCertificate = (await readFile("test/fixtures/ts119612-service-end-entity.cert.pem", "utf8"))
    .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
  caCertificate = (await readFile("test/fixtures/ts119612-service-ca.cert.pem", "utf8"))
    .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
});

describe("ETSI TS 119 602 Annex D-I profile validation", () => {
  it("routes a schema-valid JSON fixture through the selected wallet profile", async () => {
    const fixture = (await readFile("test/fixtures/ts119602-wallet-profile.json", "utf8"))
      .replace("__JADES_SIGNER_CERTIFICATE__", certificate);
    const result = assessJsonLote(JSON.parse(fixture), true, new Date("2026-02-01T00:00:00Z"));
    expect(result.ts119602.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.binding.json_schema", status: "pass" }),
      expect.objectContaining({ id: "ts119602.profile.dispatch", status: "pass" }),
      expect.objectContaining({ id: "ts119602.profile.wallet_providers.binding", status: "pass" }),
      expect.objectContaining({ id: "ts119602.profile.wallet_providers.scheme_information", status: "pass" }),
      expect.objectContaining({ id: "ts119602.profile.wallet_providers.trusted_entity", status: "pass" }),
      expect.objectContaining({ id: "ts119602.profile.wallet_providers.service", status: "pass" }),
      expect.objectContaining({ id: "ts119602.profile.wallet_providers.signature", status: "fail" }),
    ]));
  });

  it.each(Object.keys(TS119602_PROFILE_REGISTRY) as SelectedProfile[])("passes every locally decidable %s requirement family", (profile) => {
    const checks = buildTs119602ProfileFindings(profileInput(profile));
    expect(checks).toContainEqual(expect.objectContaining({ id: "ts119602.profile.dispatch", status: "pass" }));
    for (const family of ["binding", "scheme_information", "trusted_entity", "service", "signature"]) {
      expect(checks).toContainEqual(expect.objectContaining({ id: `ts119602.profile.${profile}.${family}`, status: "pass" }));
    }
  });

  it("rejects unknown and mismatched binding/profile dispatch evidence", () => {
    const unknown = profileInput("pid_providers");
    unknown.metadata.loteType = "https://example.test/unregistered-profile";
    expect(buildTs119602ProfileFindings(unknown)).toEqual([
      expect.objectContaining({ id: "ts119602.profile.dispatch", status: "fail", severity: "critical" }),
    ]);

    const wrongBinding = profileInput("wallet_providers");
    wrongBinding.binding = "scheme_explicit_xml";
    expect(find(buildTs119602ProfileFindings(wrongBinding), "ts119602.profile.wallet_providers.binding")).toMatchObject({ status: "fail" });

    const conflictingDeclaration = profileInput("wallet_providers");
    conflictingDeclaration.profileSelectionStatus = "conflict";
    expect(buildTs119602ProfileFindings(conflictingDeclaration)).toEqual([
      expect.objectContaining({ id: "ts119602.profile.dispatch", status: "fail", severity: "critical" }),
    ]);
  });

  it("reports focused scheme-information violations and uses six calendar months", () => {
    const input = profileInput("wrprc_providers");
    input.metadata.version = 2;
    input.metadata.statusDeterminationApproach = "http://uri.etsi.org/19602/WRPRCProvidersList/StatusDetn/EU";
    input.metadata.historyPeriod = 1;
    input.metadata.issueDateTime = "2026-01-31T00:00:00Z";
    input.metadata.nextUpdate = { present: true, value: "2026-08-01T00:00:00Z" };
    const check = find(buildTs119602ProfileFindings(input), "ts119602.profile.wrprc_providers.scheme_information");
    expect(check).toMatchObject({
      status: "fail",
      evidence: expect.objectContaining({
        statusDetermination: expect.objectContaining({ interpretation: "ts119602-v1.1.1-wrprc-uri-typo", valid: false }),
        nextUpdate: expect.objectContaining({ maximum: "2026-07-31T00:00:00.000Z", valid: false }),
      }),
    });

    input.metadata.version = 1;
    input.metadata.statusDeterminationApproach = TS119602_PROFILE_REGISTRY.wrprc_providers.statusDetermination;
    input.metadata.historyPeriod = undefined;
    input.metadata.nextUpdate.value = "2026-07-31T00:00:00Z";
    expect(find(buildTs119602ProfileFindings(input), "ts119602.profile.wrprc_providers.scheme_information")).toMatchObject({ status: "pass" });
  });

  it("defers final closed-list expired URI semantics to the contextual policy check", () => {
    const input = profileInput("wallet_providers");
    input.metadata.nextUpdate = { present: true, value: null };
    input.entities.entities[0].services[0].status = { present: true, value: "urn:example:status:expired" };
    expect(find(buildTs119602ProfileFindings(input), "ts119602.profile.wallet_providers.scheme_information")).toMatchObject({
      status: "pass",
      evidence: expect.objectContaining({ nextUpdate: expect.objectContaining({ finalClosed: true, valid: true }) }),
    });
    expect(find(buildTs119602ProfileFindings(input), "ts119602.profile.wallet_providers.service")).toMatchObject({ status: "pass" });
  });

  it("reports focused trusted-entity contact, role, and Pub-EAA law-reference failures", () => {
    const input = profileInput("pid_providers");
    input.entities.entities[0].address.electronicUris = [{ path: "/email", value: "mailto:contact@example.test" }];
    input.entities.entities[0].informationUris = ["https://provider.example.test/policy"];
    expect(find(buildTs119602ProfileFindings(input), "ts119602.profile.pid_providers.trusted_entity")).toMatchObject({ status: "fail" });

    const pubEaa = profileInput("pub_eaa_providers");
    pubEaa.entities.entities[0].tradeName = [{ language: "en", value: "missing law reference" }];
    expect(find(buildTs119602ProfileFindings(pubEaa), "ts119602.profile.pub_eaa_providers.trusted_entity")).toMatchObject({ status: "fail" });

    const greek = profileInput("pid_providers");
    greek.entities.entities[0].informationUris[1].value = "http://uri.etsi.org/19602/ListOfTrustedEntities/PIDProvider/EL";
    expect(find(buildTs119602ProfileFindings(greek), "ts119602.profile.pid_providers.trusted_entity")).toMatchObject({ status: "pass" });
    greek.entities.entities[0].informationUris[1].value = "http://uri.etsi.org/19602/ListOfTrustedEntities/PIDProvider/GR";
    expect(find(buildTs119602ProfileFindings(greek), "ts119602.profile.pid_providers.trusted_entity")).toMatchObject({ status: "fail" });
  });

  it("validates asserted registration identifiers without claiming an official-record match", () => {
    const malformed = profileInput("pid_providers");
    malformed.entities.entities[0].tradeNamePresent = true;
    malformed.entities.entities[0].tradeName = [{ language: "en", value: "VATde-malformed" }];
    expect(find(buildTs119602ProfileFindings(malformed), "ts119602.profile.pid_providers.trusted_entity")).toMatchObject({
      status: "fail",
      evidence: expect.objectContaining({
        results: [expect.objectContaining({
          registrationIdentifiers: expect.objectContaining({ malformedIdentifiers: ["VATde-malformed"], valid: false }),
        })],
      }),
    });

    const asserted = profileInput("pid_providers");
    asserted.entities.entities[0].tradeNamePresent = true;
    asserted.entities.entities[0].tradeName = [{ language: "en", value: "VATDE-123456789" }];
    expect(find(buildTs119602ProfileFindings(asserted), "ts119602.profile.pid_providers.trusted_entity")).toMatchObject({
      status: "pass",
      evidence: expect.objectContaining({
        results: [expect.objectContaining({ officialRegistrationMatch: "not_checked_without_authoritative_records" })],
      }),
    });
    expect(find(buildTs119602ProfileFindings(asserted), "ts119602.profile.pid_providers.service")).toMatchObject({
      status: "fail",
      evidence: expect.objectContaining({
        results: [expect.objectContaining({ certificateRegistrationMatch: expect.objectContaining({ required: true, valid: false }) })],
      }),
    });
  });

  it("includes locally validated associated-body extension evidence in the profile result", () => {
    const input = profileInput("wallet_providers");
    input.entities.entities[0].extensionsPresent = true;
    input.entities.entities[0].extensions = [{
      path: "/entity/0/extension/0",
      critical: false,
      identifier: "OtherAssociatedBodies",
      recognized: true,
      payloadValid: false,
      payloadEvidence: [{ AssociatedBodyName: [] }],
    }];
    expect(find(buildTs119602ProfileFindings(input), "ts119602.profile.wallet_providers.trusted_entity")).toMatchObject({
      status: "fail",
      evidence: expect.objectContaining({
        results: [expect.objectContaining({ associatedBodies: expect.objectContaining({ extensionCount: 1, valid: false }) })],
      }),
    });
  });

  it("enforces profile-specific service types, extensions, status/history, certificates, and supply points", () => {
    const pid = profileInput("pid_providers");
    pid.entities.entities[0].services[0].typeIdentifier.value = "https://example.test/wrong";
    expect(find(buildTs119602ProfileFindings(pid), "ts119602.profile.pid_providers.service")).toMatchObject({ status: "fail" });

    const wallet = profileInput("wallet_providers");
    wallet.entities.entities[0].services[0].extensions = [];
    expect(find(buildTs119602ProfileFindings(wallet), "ts119602.profile.wallet_providers.service")).toMatchObject({ status: "fail" });

    const pubEaa = profileInput("pub_eaa_providers");
    pubEaa.entities.entities[0].services[0].status.value = "https://example.test/wrong-status";
    pubEaa.entities.entities[0].services[0].history[0].identity.certificates = [{ path: "/history/cert", value: certificate }];
    expect(find(buildTs119602ProfileFindings(pubEaa), "ts119602.profile.pub_eaa_providers.service")).toMatchObject({ status: "fail" });

    const registrar = profileInput("registrars_and_registers");
    registrar.entities.entities[0].services[0].supplyPoints = [];
    expect(find(buildTs119602ProfileFindings(registrar), "ts119602.profile.registrars_and_registers.service")).toMatchObject({ status: "fail" });
  });

  it("requires WRPAC and WRPRC service certificates to be CA-capable certificate issuers", () => {
    for (const profile of ["wrpac_providers", "wrprc_providers"] as const) {
      const input = profileInput(profile);
      input.entities.entities[0].services[0].identity.certificates[0].value = endEntityCertificate;
      expect(find(buildTs119602ProfileFindings(input), `ts119602.profile.${profile}.service`)).toMatchObject({
        status: "fail",
        evidence: expect.objectContaining({
          results: [expect.objectContaining({
            certificatePurpose: expect.objectContaining({
              purpose: "certificate_issuer_signature_verification",
              valid: false,
              observations: [expect.objectContaining({ ca: false, basicConstraintsValid: false })],
            }),
          })],
        }),
      });

      input.entities.entities[0].services[0].identity.certificates[0].value = caCertificate;
      expect(find(buildTs119602ProfileFindings(input), `ts119602.profile.${profile}.service`)).toMatchObject({
        status: "pass",
        evidence: expect.objectContaining({
          results: [expect.objectContaining({
            certificatePurpose: expect.objectContaining({
              valid: true,
              observations: [expect.objectContaining({ ca: true, keyUsage: expect.arrayContaining(["keyCertSign"]) })],
            }),
          })],
        }),
      });
    }
  });

  it("keeps profile signature failure separate from otherwise passing profile families", () => {
    const input = profileInput("wrpac_providers");
    input.signatureChecks[1] = signatureCheck("json_lote.signature.jades_cryptographic_verification_result", "fail");
    const checks = buildTs119602ProfileFindings(input);
    expect(find(checks, "ts119602.profile.wrpac_providers.signature")).toMatchObject({ status: "fail", severity: "critical" });
    expect(find(checks, "ts119602.profile.wrpac_providers.service")).toMatchObject({ status: "pass" });
  });
});

function profileInput(profile: SelectedProfile): Ts119602ProfileAssessmentInput {
  const registry = TS119602_PROFILE_REGISTRY[profile];
  const fields = Object.fromEntries(TS119602_SCHEME_FIELDS.map((field) => [field, { present: true, count: 1 }])) as Ts119602MetadataInput["fields"];
  const roleUri = `http://uri.etsi.org/19602/ListOfTrustedEntities/${registry.roleUriName}/DE`;
  const metadata: Ts119602MetadataInput = {
    binding: "json",
    schemeInformationContainerPresent: true,
    fields,
    loteTag: { present: false },
    version: 1,
    sequence: 1,
    loteType: `http://uri.etsi.org/19602/LoTEType/${profileTypeName(profile)}`,
    schemeInformationUris: registry.schemeInformationUriMinimum === 2
      ? ["https://example.test/profile", "https://example.test/archive"]
      : ["https://example.test/profile"],
    statusDeterminationApproach: registry.statusDetermination,
    schemeTypeCommunityRules: [registry.schemeRules],
    schemeNames: [{ language: "en", value: "EU:Profile test" }],
    territory: "EU",
    address: { present: true, postalAddresses: [{ path: "/scheme/address", streetPresent: true, countryPresent: true }], electronicUris: [] },
    policy: { present: true, policyPointerCount: 1, legalNoticeCount: 0, unknownEntryCount: 0 },
    historyPeriod: registry.historyPeriod === "absent" ? undefined : registry.historyPeriod,
    pointers: registry.pointers === "present" ? [{ path: "/pointer", location: "https://example.test/self", identityCount: 1, qualifiers: [{ path: "/pointer/qualifier", typePresent: true, operatorNamePresent: true, mimeTypePresent: true }] }] : [],
    issueDateTime: "2026-01-31T00:00:00Z",
    nextUpdate: { present: true, value: "2026-07-31T00:00:00Z" },
    serviceStatuses: [],
    distributionPoints: { present: false, values: [] },
    extensions: { present: false, values: [] },
    assessmentDate: new Date("2026-02-01T00:00:00Z"),
  };
  const service = baseService(registry.serviceTypes[0]);
  if (registry.walletServiceIdentifier) {
    service.extensionsPresent = true;
    service.extensions = [{ path: "/service/extension", critical: false, identifier: "ServiceUniqueIdentifier", recognized: true, payloadValid: true, payloadEvidence: "urn:wallet:test" }];
  }
  if (registry.registerSupplyPoint) {
    service.supplyPointsPresent = true;
    service.supplyPoints = [{ path: "/service/supply", uri: "https://example.test/register" }];
  }
  if (profile === "pub_eaa_providers") {
    service.status = { present: true, value: "http://uri.etsi.org/19602/PubEAAProvidersList/SvcStatus/notified" };
    service.statusStartingTime = { present: true, value: "2026-01-31T00:00:00Z" };
    service.historyPresent = true;
    service.history = [{
      path: "/service/history/0",
      name: [{ language: "en", value: "Profile service" }],
      identity: { path: "/service/history/0/identity", present: true, certificates: [], subjectNames: [], publicKeys: [], skis: [{ path: "/service/history/0/ski", value: "AQID" }], otherIds: [] },
      status: { present: true, value: "http://uri.etsi.org/19602/PubEAAProvidersList/SvcStatus/withdrawn" },
      statusStartingTime: { present: true, value: "2026-01-01T00:00:00Z" },
      typeIdentifier: registry.serviceTypes[0],
      extensions: [],
    }];
  }
  const entity = {
    path: "/entity/0",
    structure: structure("/entity/0", "object", ["TrustedEntityInformation", "TrustedEntityServices"]),
    informationStructure: structure("/entity/0/information", "object", ["TEName", "TEAddress", "TEInformationURI"]),
    servicesStructure: structure("/entity/0/services", "array", ["TrustedEntityService"]),
    informationPresent: true,
    servicesContainerPresent: true,
    name: [{ language: "en", value: "JSON-Operator" }],
    tradeNamePresent: profile === "pub_eaa_providers",
    tradeName: profile === "pub_eaa_providers" ? [{ language: "en", value: "OJ:EU:2025-1569" }] : [],
    address: {
      present: true,
      structure: { childNames: ["TEPostalAddress", "TEElectronicAddress"], violations: [], valid: true },
      postalAddresses: [{ path: "/entity/0/address", streetPresent: true, countryPresent: true, language: "en", value: "1 Example Street EU" }],
      electronicUris: [
        { path: "/entity/0/email", value: "mailto:contact@example.test", language: "en" },
        { path: "/entity/0/telephone", value: "tel:+3900000000", language: "en" },
        ...(registry.roleUriLocation === "address" ? [{ path: "/entity/0/role", value: roleUri, language: "en" }] : []),
      ],
    },
    informationUris: [
      { language: "en", value: "https://provider.example.test/policy" },
      ...(registry.roleUriLocation === "information" ? [{ language: "en", value: roleUri }] : []),
    ],
    extensionsPresent: false,
    extensions: [],
    services: [service],
  };
  const entities: Ts119602EntitiesInput = {
    containerPresent: true,
    listStructure: structure("/entities", "array", ["TrustedEntity"]),
    entities: [entity],
    historyPeriod: metadata.historyPeriod,
    listIssueDateTime: metadata.issueDateTime,
    assessmentDate: metadata.assessmentDate,
  };
  return {
    binding: "scheme_explicit_json",
    metadata,
    entities,
    signatureChecks: [
      signatureCheck("json_lote.signature.jades_baseline_b", "pass"),
      signatureCheck("json_lote.signature.jades_cryptographic_verification_result", "pass"),
    ],
  };
}

function baseService(serviceType: string): Ts119602ServiceObservation {
  return {
    path: "/entity/0/service/0",
    structure: structure("/entity/0/service/0", "object", ["ServiceInformation"]),
    informationStructure: structure("/entity/0/service/0/information", "object", ["ServiceName", "ServiceDigitalIdentity"]),
    informationPresent: true,
    name: [{ language: "en", value: "Profile service" }],
    identity: { path: "/entity/0/service/0/identity", present: true, certificates: [{ path: "/entity/0/service/0/certificate", value: certificate }], subjectNames: [], publicKeys: [], skis: [], otherIds: [] },
    typeIdentifier: { present: true, value: serviceType },
    status: { present: false, value: undefined },
    statusStartingTime: { present: false, value: undefined },
    schemeDefinitionPresent: false,
    schemeDefinitionUris: [],
    supplyPointsPresent: false,
    supplyPoints: [],
    teDefinitionPresent: false,
    teDefinitionUris: [],
    extensionsPresent: false,
    extensions: [],
    historyPresent: false,
    history: [],
  };
}

function structure(path: string, observedType: "object" | "array", childNames: string[]) {
  return { path, binding: "json" as const, observedType, childNames, violations: [], valid: true };
}

function signatureCheck(id: string, status: CheckResult["status"]): CheckResult {
  return { id, category: "signature", status, severity: status === "pass" ? "info" : "critical", message: id };
}

function profileTypeName(profile: SelectedProfile): string {
  return {
    pid_providers: "EUPIDProvidersList",
    wallet_providers: "EUWalletProvidersList",
    wrpac_providers: "EUWRPACProvidersList",
    wrprc_providers: "EUWRPRCProvidersList",
    pub_eaa_providers: "EUPubEAAProvidersList",
    registrars_and_registers: "EURegistrarsAndRegistersList",
  }[profile];
}

function find(checks: CheckResult[], id: string): CheckResult | undefined {
  return checks.find((check) => check.id === id);
}
