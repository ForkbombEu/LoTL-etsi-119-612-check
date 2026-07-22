import { describe, expect, it } from "vitest";
import {
  auditTs119612Coverage,
  ts119612CoverageFinding,
} from "../src/standards/ts119612Coverage.js";
import {
  TS119612_REQUIREMENTS,
  type Ts119612Requirement,
} from "../src/standards/ts119612Requirements.js";
import type { CheckResult } from "../src/types.js";

describe("ETSI TS 119 612 ledger coverage audit", () => {
  it("audits all 69 TSL families and preserves partial, unsupported, and contextual blockers", () => {
    const audit = auditTs119612Coverage("ts119612_xml_tsl", []);

    expect(audit.ledger).toEqual({
      total: 69,
      applicable: 69,
      notApplicable: 0,
      implemented: 15,
      partial: 45,
      notImplemented: 9,
      contextual: 26,
    });
    expect(audit.requirements).toHaveLength(69);
    expect(audit.blockers.partialRequirementIds).toContain("ts119612.signature.signer_trust");
    expect(audit.blockers.notImplementedRequirementIds).toContain("ts119612.operations.availability");
    expect(audit.blockers.contextualRequirementIds).toContain("ts119612.scheme.sequence.history");
    expect(audit.requirements).toContainEqual(expect.objectContaining({
      requirementId: "ts119612.operations.availability",
      applicability: "applicable",
      evidenceScope: "contextual",
      implementationStatus: "not_implemented",
      outcome: "not_implemented",
      conclusive: false,
    }));
    expect(audit.completeVerdictEligible).toBe(false);
  });

  it("keeps TL-only families not applicable to a LoTL without hiding them", () => {
    const audit = auditTs119612Coverage("ts119612_xml_lotl", []);

    expect(audit.ledger).toMatchObject({ total: 69, applicable: 42, notApplicable: 27 });
    expect(audit.requirements).toContainEqual(expect.objectContaining({
      requirementId: "ts119612.service.name",
      applicability: "not_applicable",
      implementationStatus: "implemented",
      outcome: "not_applicable",
      conclusive: true,
    }));
  });

  it("opens the complete-verdict gate only when every applicable family is implemented and conclusive", () => {
    const requirements = fullyImplementedRequirements();
    const passing = requirements.map((requirement) => finding(requirement.implementation.existingCheckIds[0], "pass"));

    const complete = auditTs119612Coverage("ts119612_xml_tsl", passing, requirements);
    expect(complete).toMatchObject({
      applicableImplemented: { total: 69, conclusive: 69, nonConclusive: 0 },
      completeVerdictEligible: true,
    });
    expect(ts119612CoverageFinding(complete)).toMatchObject({ status: "pass", severity: "info" });

    const nonConclusive = auditTs119612Coverage(
      "ts119612_xml_tsl",
      [finding(requirements[0].implementation.existingCheckIds[0], "not_checked"), ...passing.slice(1)],
      requirements,
    );
    expect(nonConclusive.completeVerdictEligible).toBe(false);
    expect(nonConclusive.blockers.nonConclusiveImplementedRequirementIds).toEqual([requirements[0].checkId]);
    expect(ts119612CoverageFinding(nonConclusive)).toMatchObject({ status: "not_checked", severity: "warning" });
  });

  it("treats a failed implemented check as conclusive evidence while leaving the verdict to the assessment layer", () => {
    const requirements = fullyImplementedRequirements();
    const checks = requirements.map((requirement, index) => finding(
      requirement.implementation.existingCheckIds[0],
      index === 0 ? "fail" : "pass",
    ));
    const audit = auditTs119612Coverage("ts119612_xml_tsl", checks, requirements);

    expect(audit.completeVerdictEligible).toBe(true);
    expect(audit.requirements[0]).toMatchObject({ outcome: "fail", conclusive: true });
  });

  it("does not open the complete-verdict gate for an empty ledger", () => {
    expect(auditTs119612Coverage("ts119612_xml_tsl", [], [])).toMatchObject({
      ledger: { total: 0, applicable: 0 },
      completeVerdictEligible: false,
    });
  });
});

function fullyImplementedRequirements(): Ts119612Requirement[] {
  return TS119612_REQUIREMENTS.map((requirement, index) => ({
    ...requirement,
    implementation: {
      status: "implemented",
      existingCheckIds: [`coverage.synthetic.${index + 1}`],
    },
  }));
}

function finding(id: string, status: CheckResult["status"]): CheckResult {
  return {
    id,
    category: "profile",
    status,
    severity: status === "fail" ? "error" : "info",
    message: `Synthetic ${status} coverage finding.`,
  };
}
