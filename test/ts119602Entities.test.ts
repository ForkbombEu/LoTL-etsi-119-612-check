import { describe, expect, it } from "vitest";
import {
  buildTs119602EntityFindings,
  type Ts119602EntitiesInput,
} from "../src/standards/ts119602Entities.js";

describe("ETSI TS 119 602 clauses 6.4-6.7", () => {
  it("passes complete local entity and service structures", () => {
    const result = buildTs119602EntityFindings(validInput());
    expect(find(result, "ts119602.entities.structure")).toMatchObject({ status: "pass" });
    expect(find(result, "ts119602.entity.information")).toMatchObject({ status: "pass" });
    expect(find(result, "ts119602.entity.address")).toMatchObject({ status: "pass" });
    expect(find(result, "ts119602.service.information")).toMatchObject({ status: "pass" });
    expect(find(result, "ts119602.service.digital_identity")).toMatchObject({ status: "pass" });
  });

  it("reports an absent entity list as inconclusive instead of assuming an empty scheme", () => {
    const input = validInput();
    input.containerPresent = false;
    input.entities = [];
    expect(find(buildTs119602EntityFindings(input), "ts119602.entities.list")).toMatchObject({ status: "inconclusive" });
  });

  it("rejects empty identities and malformed certificate, subject, and SKI forms", () => {
    const input = validInput();
    const identity = input.entities[0].services[0].identity;
    identity.otherIds = [];
    identity.certificates = [{ path: "/cert", value: "not-base64" }];
    identity.subjectNames = [{ path: "/dn", value: "not a DN" }];
    identity.skis = [{ path: "/ski", value: "AA=" }];
    expect(find(buildTs119602EntityFindings(input), "ts119602.service.digital_identity")).toMatchObject({ status: "fail", severity: "critical" });
  });

  it("requires status when historical information is retained", () => {
    const input = validInput();
    input.historyPeriod = 30;
    expect(find(buildTs119602EntityFindings(input), "ts119602.service.status")).toMatchObject({ status: "fail" });
    input.entities[0].services[0].status = { present: true, value: "https://example.test/status/granted" };
    expect(find(buildTs119602EntityFindings(input), "ts119602.service.status")).toMatchObject({ status: "pass" });
  });

  it("validates current status timing and descending complete history", () => {
    const input = validInput();
    input.historyPeriod = 30;
    const service = input.entities[0].services[0];
    service.status = { present: true, value: "https://example.test/status/current" };
    service.statusStartingTime = { present: true, value: "2026-07-02T00:00:00Z" };
    service.historyPresent = true;
    service.history = [history("2026-07-01T12:00:00Z"), history("2026-06-01T00:00:00Z")];
    expect(find(buildTs119602EntityFindings(input), "ts119602.service.status_start")).toMatchObject({ status: "pass" });
    expect(find(buildTs119602EntityFindings(input), "ts119602.service.history")).toMatchObject({ status: "pass" });
    service.history.reverse();
    expect(find(buildTs119602EntityFindings(input), "ts119602.service.history")).toMatchObject({ status: "fail" });
  });

  it("fails closed for unknown critical entity and service extensions", () => {
    const input = validInput();
    const unknown = { path: "/extension", critical: true, identifier: "example", recognized: false, payloadValid: true };
    input.entities[0].extensionsPresent = true;
    input.entities[0].extensions = [unknown];
    input.entities[0].services[0].extensionsPresent = true;
    input.entities[0].services[0].extensions = [unknown];
    expect(find(buildTs119602EntityFindings(input), "ts119602.entity.extensions")).toMatchObject({ status: "fail", severity: "critical" });
    expect(find(buildTs119602EntityFindings(input), "ts119602.service.extensions")).toMatchObject({ status: "fail", severity: "critical" });
  });

  it("rejects binding-specific direct nesting and cardinality violations", () => {
    const input = validInput();
    input.entities[0].informationStructure = {
      ...input.entities[0].informationStructure,
      childNames: ["TEName", "TEName", "TEAddress", "TEInformationURI"],
      violations: [{ code: "structure.cardinality", message: "TEName cardinality must be exactly 1.", observed: 2 }],
      valid: false,
    };
    input.entities[0].services[0].structure = {
      ...input.entities[0].services[0].structure,
      childNames: ["ServiceHistory", "ServiceInformation"],
      violations: [{ code: "structure.child_order", message: "Direct children are out of order." }],
      valid: false,
    };
    const result = buildTs119602EntityFindings(input);
    expect(find(result, "ts119602.entity.information")).toMatchObject({ status: "fail", severity: "critical" });
    expect(find(result, "ts119602.entities.structure")).toMatchObject({ status: "fail", severity: "critical" });
  });

  it("validates TE information pointers and every address URI as multilingual values", () => {
    const input = validInput();
    input.entities[0].informationUris = [{ language: "it", value: "https://example.test/info" }];
    input.entities[0].address.electronicUris.push({ path: "/bad", value: "not a URI", language: "en" });
    const result = buildTs119602EntityFindings(input);
    expect(find(result, "ts119602.entity.information_uri")).toMatchObject({ status: "fail" });
    expect(find(result, "ts119602.entity.address")).toMatchObject({ status: "fail" });
  });
});

function validInput(): Ts119602EntitiesInput {
  return {
    containerPresent: true,
    listStructure: structure("/entities", "array", ["TrustedEntity"]),
    historyPeriod: undefined,
    listIssueDateTime: "2026-07-01T00:00:00Z",
    assessmentDate: new Date("2026-07-21T00:00:00Z"),
    entities: [{
      path: "/entity/1",
      structure: structure("/entity/1", "object", ["TrustedEntityInformation", "TrustedEntityServices"]),
      informationStructure: structure("/entity/1/information", "object", ["TEName", "TEAddress", "TEInformationURI"]),
      servicesStructure: structure("/entity/1/services", "array", ["TrustedEntityService"]),
      informationPresent: true,
      servicesContainerPresent: true,
      name: [{ language: "en", value: "Example Entity" }],
      tradeNamePresent: false,
      tradeName: [],
      address: {
        present: true,
        structure: { childNames: ["TEPostalAddress", "TEElectronicAddress"], violations: [], valid: true },
        postalAddresses: [{ path: "/address/1", streetPresent: true, countryPresent: true, language: "en", value: "1 Example Street EU" }],
        electronicUris: [{ path: "/email", value: "mailto:help@example.test", language: "en" }, { path: "/web", value: "https://example.test/help", language: "en" }],
      },
      informationUris: [{ language: "en", value: "https://example.test/info" }],
      extensionsPresent: false,
      extensions: [],
      services: [{
        path: "/service/1",
        structure: structure("/service/1", "object", ["ServiceInformation"]),
        informationStructure: structure("/service/1/information", "object", ["ServiceName", "ServiceDigitalIdentity"]),
        informationPresent: true,
        name: [{ language: "en", value: "Example Service" }],
        identity: identity("/service/1/identity"),
        typeIdentifier: { present: false, value: undefined },
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
      }],
    }],
  };
}

function structure(path: string, observedType: "object" | "array", childNames: string[]) {
  return { path, binding: "json" as const, observedType, childNames, violations: [], valid: true };
}

function identity(path: string) {
  return { path, present: true, certificates: [], subjectNames: [], publicKeys: [], skis: [], otherIds: [{ path: `${path}/other`, value: "urn:example:identity" }] };
}

function history(time: string) {
  return {
    path: `/history/${time}`,
    name: [{ language: "en", value: "Example Service" }],
    identity: identity(`/history/${time}/identity`),
    status: { present: true, value: "https://example.test/status/previous" },
    statusStartingTime: { present: true, value: time },
    typeIdentifier: undefined,
    extensions: [],
  };
}

function find(result: ReturnType<typeof buildTs119602EntityFindings>, id: string) {
  return result.checks.find((entry) => entry.id === id);
}
