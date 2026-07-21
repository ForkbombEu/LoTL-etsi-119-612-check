import { describe, expect, it } from "vitest";
import { buildStandardAssessment } from "../src/standards/assessment.js";
import type { CheckResult } from "../src/types.js";

describe("buildStandardAssessment", () => {
  it("does not claim conformance while mandatory coverage is incomplete", () => {
    const assessment = buildStandardAssessment([finding("pass")], { coverageComplete: false });
    expect(assessment.conformanceLevel).toBe("not_checked");
  });

  it.each([
    ["fail", "non_conformant"],
    ["unsupported", "unsupported"],
    ["inconclusive", "inconclusive"],
    ["not_checked", "not_checked"],
  ] as const)("maps a %s mandatory limitation to %s", (status, expected) => {
    const assessment = buildStandardAssessment([finding(status)], { coverageComplete: true });
    expect(assessment.conformanceLevel).toBe(expected);
  });

  it("allows conformance only for complete all-pass coverage", () => {
    const assessment = buildStandardAssessment([finding("pass")], { coverageComplete: true });
    expect(assessment.conformanceLevel).toBe("conformant");
  });
});

function finding(status: CheckResult["status"]): CheckResult {
  return {
    id: `test.${status}`,
    category: "profile",
    status,
    severity: status === "fail" ? "error" : "info",
    message: `Test ${status} finding.`,
  };
}
