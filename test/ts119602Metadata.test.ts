import { describe, expect, it } from "vitest";
import {
  buildTs119602MetadataFindings,
  TS119602_SCHEME_FIELDS,
  type Ts119602MetadataInput,
} from "../src/standards/ts119602Metadata.js";

describe("ETSI TS 119 602 clauses 6.2 and 6.3 metadata findings", () => {
  it("applies the explicit Table 1 presence matrix", () => {
    const checks = buildTs119602MetadataFindings(explicitInput());
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ts119602.structure.lote_tag", status: "not_applicable" }),
      expect.objectContaining({
        id: "ts119602.structure.scheme_information_presence",
        status: "pass",
        evidence: expect.objectContaining({ mode: "explicit", violations: [] }),
      }),
      expect.objectContaining({ id: "ts119602.scheme.version", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.sequence.local", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.name", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.operator_address", status: "pass" }),
      expect.objectContaining({ id: "ts119602.scheme.policy_or_legal_notice", status: "pass" }),
    ]));
  });

  it("fails a partially populated explicit field set without inventing defaults", () => {
    const input = implicitInput();
    input.fields.SchemeName = { present: true, count: 1 };
    input.schemeNames = [{ language: "en", value: "EU:Partial scheme" }];
    input.territory = "EU";
    const check = find(buildTs119602MetadataFindings(input), "ts119602.structure.scheme_information_presence");
    expect(check).toMatchObject({
      status: "fail",
      evidence: expect.objectContaining({
        mode: "explicit",
        violations: expect.arrayContaining([
          expect.objectContaining({ name: "LoTEType", expected: "mandatory", present: false }),
          expect.objectContaining({ name: "SchemeInformationURI", expected: "mandatory", present: false }),
        ]),
      }),
    });
  });

  it("validates pointer structure but leaves target authentication not checked", () => {
    const input = explicitInput();
    input.fields.PointersToOtherLoTE = { present: true, count: 1 };
    input.pointers = [{
      path: "/pointer/1",
      location: "https://example.test/other.json",
      identityCount: 1,
      qualifiers: [{ path: "/pointer/1/qualifier/1", typePresent: true, operatorNamePresent: true, mimeTypePresent: true }],
    }];
    const checks = buildTs119602MetadataFindings(input);
    expect(find(checks, "ts119602.scheme.pointers.structure")).toMatchObject({ status: "pass" });
    expect(find(checks, "ts119602.scheme.pointers.authentication")).toMatchObject({ status: "not_checked" });

    input.pointers[0].identityCount = 0;
    expect(find(buildTs119602MetadataFindings(input), "ts119602.scheme.pointers.structure")).toMatchObject({ status: "fail" });
  });

  it("supports a closed LoTE only when observed service statuses are expired", () => {
    const input = explicitInput();
    input.nextUpdate = { present: true, value: null };
    input.serviceStatuses = ["http://uri.example/status/expired"];
    expect(find(buildTs119602MetadataFindings(input), "ts119602.scheme.next_update")).toMatchObject({
      status: "pass",
      evidence: expect.objectContaining({ closed: true }),
    });

    input.serviceStatuses = ["http://uri.example/status/granted"];
    expect(find(buildTs119602MetadataFindings(input), "ts119602.scheme.next_update")).toMatchObject({ status: "fail" });
  });

  it("fails expired open lists while leaving profile maximum intervals for profile dispatch", () => {
    const input = explicitInput();
    input.nextUpdate = { present: true, value: "2026-07-20T00:00:00Z" };
    const check = find(buildTs119602MetadataFindings(input), "ts119602.scheme.next_update");
    expect(check).toMatchObject({
      status: "fail",
      evidence: expect.objectContaining({ profileMaximumInterval: "not_checked_until_profile_dispatch" }),
    });
  });

  it("fails closed for unknown critical extensions and ignores unknown non-critical extensions", () => {
    const input = explicitInput();
    input.fields.SchemeExtensions = { present: true, count: 1 };
    input.extensions = {
      present: true,
      values: [{ path: "/extension/1", critical: true, identifier: "example", recognized: false }],
    };
    expect(find(buildTs119602MetadataFindings(input), "ts119602.scheme.extensions")).toMatchObject({ status: "fail", severity: "critical" });

    input.extensions.values[0].critical = false;
    expect(find(buildTs119602MetadataFindings(input), "ts119602.scheme.extensions")).toMatchObject({ status: "pass" });
  });

  it("requires a non-empty local distribution-point sequence", () => {
    const input = explicitInput();
    input.fields.DistributionPoints = { present: true, count: 0 };
    input.distributionPoints = { present: true, values: [] };
    expect(find(buildTs119602MetadataFindings(input), "ts119602.scheme.distribution_points")).toMatchObject({ status: "fail" });
    expect(find(buildTs119602MetadataFindings(input), "ts119602.scheme.distribution_consistency")).toMatchObject({ status: "not_checked" });
  });
});

function explicitInput(): Ts119602MetadataInput {
  const input = implicitInput();
  for (const field of [
    "LoTEType",
    "SchemeOperatorAddress",
    "SchemeName",
    "SchemeInformationURI",
    "StatusDeterminationApproach",
    "SchemeTypeCommunityRules",
    "SchemeTerritory",
    "PolicyOrLegalNotice",
  ] as const) input.fields[field] = { present: true, count: 1 };
  input.schemeNames = [{ language: "en", value: "EU:Example scheme" }];
  input.territory = "EU";
  input.address = {
    present: true,
    structure: { childNames: ["SchemeOperatorPostalAddress", "SchemeOperatorElectronicAddress"], violations: [], valid: true },
    postalAddresses: [{ path: "/address/1", streetPresent: true, countryPresent: true, language: "en", value: "1 Example Street EU" }],
    electronicUris: [
      { path: "/electronic/1", value: "mailto:audit@example.test", language: "en" },
      { path: "/electronic/2", value: "https://example.test/contact", language: "en" },
    ],
  };
  input.policy = { present: true, policyPointerCount: 1, legalNoticeCount: 0, unknownEntryCount: 0 };
  return input;
}

function implicitInput(): Ts119602MetadataInput {
  const fields = Object.fromEntries(TS119602_SCHEME_FIELDS.map((field) => [field, { present: false, count: 0 }])) as Ts119602MetadataInput["fields"];
  for (const field of ["LoTEVersionIdentifier", "LoTESequenceNumber", "SchemeOperatorName", "ListIssueDateTime", "NextUpdate"] as const) {
    fields[field] = { present: true, count: 1 };
  }
  return {
    binding: "json",
    schemeInformationContainerPresent: true,
    fields,
    loteTag: { present: false },
    version: 1,
    sequence: 1,
    schemeNames: [],
    territory: undefined,
    address: { present: false, structure: { childNames: [], violations: [{ code: "structure.missing", message: "Address is absent." }], valid: false }, postalAddresses: [], electronicUris: [] },
    policy: { present: false, policyPointerCount: 0, legalNoticeCount: 0, unknownEntryCount: 0 },
    historyPeriod: undefined,
    pointers: [],
    issueDateTime: "2026-07-01T00:00:00Z",
    nextUpdate: { present: true, value: "2027-01-01T00:00:00Z" },
    serviceStatuses: [],
    distributionPoints: { present: false, values: [] },
    extensions: { present: false, values: [] },
    assessmentDate: new Date("2026-07-21T00:00:00Z"),
  };
}

function find(checks: ReturnType<typeof buildTs119602MetadataFindings>, id: string) {
  return checks.find((check) => check.id === id);
}
