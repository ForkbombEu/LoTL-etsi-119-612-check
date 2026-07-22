import { describe, expect, it } from "vitest";
import {
  auditTs119602Coverage,
  inferTs119602CoverageSchemeMode,
  ts119602CoverageFinding,
} from "../src/standards/ts119602Coverage.js";
import { TS119602_REQUIREMENTS, type Ts119602Requirement } from "../src/standards/ts119602Requirements.js";
import type { CheckResult, Ts119602Classification } from "../src/types.js";

describe("ETSI TS 119 602 ledger coverage audit", () => {
  it("audits all 81 families with binding/profile/mode applicability and explicit blockers", () => {
    const audit = auditTs119602Coverage({ classification: walletClassification(), schemeMode: "explicit" }, []);

    expect(audit.ledger).toEqual({
      total: 81,
      applicable: 54,
      notApplicable: 27,
      implemented: 22,
      partial: 32,
      notImplemented: 0,
      contextual: 17,
    });
    expect(audit.requirements).toHaveLength(81);
    expect(audit.blockers.partialRequirementIds).toContain("ts119602.syntax.language");
    expect(audit.blockers.contextualRequirementIds).toContain("ts119602.scheme.sequence.history");
    expect(audit.requirements).toContainEqual(expect.objectContaining({
      requirementId: "ts119602.profile.wallet_providers.scheme_information",
      applicability: "applicable",
      implementationStatus: "implemented",
      outcome: "not_checked",
      conclusive: false,
    }));
    expect(audit.requirements).toContainEqual(expect.objectContaining({
      requirementId: "ts119602.profile.pid_providers.binding",
      applicability: "not_applicable",
      outcome: "not_applicable",
      conclusive: true,
    }));
    expect(audit.completeVerdictEligible).toBe(false);
  });

  it("keeps explicit-only profile families not applicable in implicit mode", () => {
    const audit = auditTs119602Coverage({ classification: walletClassification(), schemeMode: "implicit" }, []);
    expect(audit.ledger).toMatchObject({ total: 81, applicable: 49, notApplicable: 32 });
    expect(audit.requirements).toContainEqual(expect.objectContaining({
      requirementId: "ts119602.profile.wallet_providers.binding",
      applicability: "not_applicable",
    }));
  });

  it("opens the complete-verdict gate only when every applicable family is implemented and conclusive", () => {
    const requirements = fullyImplementedRequirements();
    const passing = requirements.map((requirement) => finding(requirement.implementation.existingCheckIds[0], "pass"));
    const selection = { classification: walletClassification(), schemeMode: "explicit" as const };

    const complete = auditTs119602Coverage(selection, passing, requirements);
    expect(complete).toMatchObject({
      applicableImplemented: { total: 54, conclusive: 54, nonConclusive: 0 },
      completeVerdictEligible: true,
    });
    expect(ts119602CoverageFinding(complete)).toMatchObject({ status: "pass", severity: "info" });

    const nonConclusive = auditTs119602Coverage(
      selection,
      [finding(requirements[0].implementation.existingCheckIds[0], "not_checked"), ...passing.slice(1)],
      requirements,
    );
    expect(nonConclusive.completeVerdictEligible).toBe(false);
    expect(nonConclusive.blockers.nonConclusiveImplementedRequirementIds).toContain(requirements[0].checkId);
    expect(ts119602CoverageFinding(nonConclusive)).toMatchObject({ status: "not_checked", severity: "warning" });
  });

  it("treats failures as conclusive evidence and classification ambiguity as a separate blocker", () => {
    const requirements = fullyImplementedRequirements();
    const checks = requirements.map((requirement, index) => finding(
      requirement.implementation.existingCheckIds[0],
      index === 0 ? "fail" : "pass",
    ));
    const conclusive = auditTs119602Coverage({ classification: walletClassification(), schemeMode: "explicit" }, checks, requirements);
    expect(conclusive.completeVerdictEligible).toBe(true);
    expect(conclusive.requirements[0]).toMatchObject({ outcome: "fail", conclusive: true });

    const conflict = auditTs119602Coverage({
      classification: { ...walletClassification(), profile: "unknown", profileStatus: "conflict" },
      schemeMode: "unknown",
    }, checks, requirements);
    expect(conflict.blockers.selection).toEqual(["profile_conflict", "scheme_mode_unknown"]);
    expect(conflict.completeVerdictEligible).toBe(false);
  });

  it("infers scheme mode only from explicit metadata evidence", () => {
    expect(inferTs119602CoverageSchemeMode([finding("ts119602.structure.scheme_information_presence", "pass", { mode: "implicit" })])).toBe("implicit");
    expect(inferTs119602CoverageSchemeMode([])).toBe("unknown");
  });
});

function walletClassification(): Ts119602Classification {
  return {
    dataModel: "ts119602",
    binding: "scheme_explicit_json",
    bindingStatus: "selected",
    profile: "wallet_providers",
    profileStatus: "selected",
    applicability: "applicable",
    reasons: ["Synthetic coverage selection."],
    evidence: {},
  };
}

function fullyImplementedRequirements(): Ts119602Requirement[] {
  return TS119602_REQUIREMENTS.map((requirement, index) => ({
    ...requirement,
    implementation: { status: "implemented", existingCheckIds: [`coverage.synthetic.${index + 1}`] },
  }));
}

function finding(id: string, status: CheckResult["status"], evidence?: unknown): CheckResult {
  return {
    id,
    category: "profile",
    status,
    severity: status === "fail" ? "error" : "info",
    message: `Synthetic ${status} coverage finding.`,
    evidence,
  };
}
