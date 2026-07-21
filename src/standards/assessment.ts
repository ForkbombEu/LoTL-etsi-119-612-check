import type { CheckResult, StandardAssessment } from "../types.js";

export interface AssessmentOptions {
  applicable?: boolean;
  coverageComplete?: boolean;
}

/** Build a standard-specific verdict from only that standard's findings. */
export function buildStandardAssessment(
  checks: CheckResult[],
  options: AssessmentOptions = {},
): StandardAssessment {
  const applicable = options.applicable ?? true;
  if (!applicable) {
    return {
      applicable: false,
      conformanceLevel: "not_applicable",
      score: null,
      checks,
      mandatoryFailures: [],
      warnings: warningMessages(checks),
    };
  }

  const mandatoryFailures = checks
    .filter((entry) => entry.status === "fail")
    .map((entry) => `${entry.id}: ${entry.message}`);
  const conformanceLevel = mandatoryFailures.length > 0
    ? "non_conformant"
    : checks.some((entry) => entry.status === "unsupported")
      ? "unsupported"
      : checks.some((entry) => entry.status === "inconclusive")
        ? "inconclusive"
        : !options.coverageComplete || checks.some((entry) => entry.status === "not_checked")
          ? "not_checked"
          : checks.some((entry) => entry.status === "warn")
            ? "partially_conformant"
            : "conformant";

  return {
    applicable: true,
    conformanceLevel,
    score: null,
    checks,
    mandatoryFailures,
    warnings: warningMessages(checks),
  };
}

export function emptyAssessment(): StandardAssessment {
  return buildStandardAssessment([], { coverageComplete: false });
}

function warningMessages(checks: CheckResult[]): string[] {
  return checks
    .filter((entry) => ["warn", "not_checked", "unsupported", "inconclusive"].includes(entry.status))
    .map((entry) => `${entry.id}: ${entry.message}`);
}
