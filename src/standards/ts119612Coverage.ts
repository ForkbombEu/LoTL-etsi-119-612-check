import type { ArtifactKind, CheckResult, CheckStatus } from "../types.js";
import {
  summarizeTs119612Requirements,
  TS119612_REQUIREMENTS,
  TS119612_SOURCE,
  type Ts119612ArtifactKind,
  type Ts119612Citation,
  type Ts119612EvidenceScope,
  type Ts119612ImplementationStatus,
  type Ts119612Requirement,
} from "./ts119612Requirements.js";

export type Ts119612CoverageOutcome =
  | CheckStatus
  | "partial"
  | "not_implemented";

export interface Ts119612RequirementCoverage {
  requirementId: string;
  title: string;
  citations: Ts119612Citation[];
  applicability: "applicable" | "not_applicable";
  evidenceScope: Ts119612EvidenceScope;
  implementationStatus: Ts119612ImplementationStatus;
  linkedCheckIds: string[];
  observedFindings: Array<{ id: string; status: CheckStatus }>;
  outcome: Ts119612CoverageOutcome;
  conclusive: boolean;
}

export interface Ts119612CoverageAudit {
  standard: {
    document: string;
    version: string;
    publicationDate: string;
  };
  artifactKind: Ts119612ArtifactKind;
  ledger: {
    total: number;
    applicable: number;
    notApplicable: number;
    implemented: number;
    partial: number;
    notImplemented: number;
    contextual: number;
  };
  applicableImplemented: {
    total: number;
    conclusive: number;
    nonConclusive: number;
  };
  blockers: {
    partialRequirementIds: string[];
    notImplementedRequirementIds: string[];
    nonConclusiveImplementedRequirementIds: string[];
    contextualRequirementIds: string[];
  };
  completeVerdictEligible: boolean;
  requirements: Ts119612RequirementCoverage[];
}

/** Audit every ledger family against the findings produced for one TS 119 612 artifact. */
export function auditTs119612Coverage(
  artifactKind: ArtifactKind,
  checks: readonly CheckResult[],
  requirements: readonly Ts119612Requirement[] = TS119612_REQUIREMENTS,
): Ts119612CoverageAudit {
  if (artifactKind !== "ts119612_xml_tsl" && artifactKind !== "ts119612_xml_lotl") {
    throw new Error(`TS 119 612 coverage requires an applicable XML TSL/LoTL artifact, received ${artifactKind}.`);
  }

  const entries = requirements.map((requirement) => auditRequirement(requirement, artifactKind, checks));
  const applicable = entries.filter((entry) => entry.applicability === "applicable");
  const applicableImplemented = applicable.filter((entry) => entry.implementationStatus === "implemented");
  const partialRequirementIds = ids(applicable.filter((entry) => entry.implementationStatus === "partial"));
  const notImplementedRequirementIds = ids(applicable.filter((entry) => entry.implementationStatus === "not_implemented"));
  const nonConclusiveImplementedRequirementIds = ids(applicableImplemented.filter((entry) => !entry.conclusive));
  const contextualRequirementIds = ids(applicable.filter((entry) => entry.evidenceScope !== "local"));
  const completeVerdictEligible = applicable.length > 0
    && partialRequirementIds.length === 0
    && notImplementedRequirementIds.length === 0
    && nonConclusiveImplementedRequirementIds.length === 0;

  return {
    standard: {
      document: TS119612_SOURCE.document,
      version: TS119612_SOURCE.version,
      publicationDate: TS119612_SOURCE.publicationDate,
    },
    artifactKind,
    ledger: {
      total: entries.length,
      applicable: applicable.length,
      notApplicable: entries.length - applicable.length,
      implemented: applicableImplemented.length,
      partial: partialRequirementIds.length,
      notImplemented: notImplementedRequirementIds.length,
      contextual: contextualRequirementIds.length,
    },
    applicableImplemented: {
      total: applicableImplemented.length,
      conclusive: applicableImplemented.length - nonConclusiveImplementedRequirementIds.length,
      nonConclusive: nonConclusiveImplementedRequirementIds.length,
    },
    blockers: {
      partialRequirementIds,
      notImplementedRequirementIds,
      nonConclusiveImplementedRequirementIds,
      contextualRequirementIds,
    },
    completeVerdictEligible,
    requirements: entries,
  };
}

export function ts119612CoverageFinding(audit: Ts119612CoverageAudit): CheckResult {
  const ledger = summarizeTs119612Requirements();
  return {
    id: "ts119612.coverage.complete",
    category: "profile",
    status: audit.completeVerdictEligible ? "pass" : "not_checked",
    severity: audit.completeVerdictEligible ? "info" : "warning",
    message: audit.completeVerdictEligible
      ? "Every applicable TS 119 612 ledger family is implemented and every implemented family produced a conclusive result."
      : `A complete TS 119 612 verdict is blocked by ${audit.ledger.partial} partial, ${audit.ledger.notImplemented} not-implemented, and ${audit.applicableImplemented.nonConclusive} non-conclusive implemented applicable families.`,
    evidence: {
      ...ledger,
      artifactKind: audit.artifactKind,
      applicable: audit.ledger.applicable,
      applicableImplemented: audit.applicableImplemented,
      completeVerdictEligible: audit.completeVerdictEligible,
      blockers: audit.blockers,
    },
  };
}

function auditRequirement(
  requirement: Ts119612Requirement,
  artifactKind: Ts119612ArtifactKind,
  checks: readonly CheckResult[],
): Ts119612RequirementCoverage {
  const applicable = requirement.applicability.artifactKinds.includes(artifactKind);
  const observedFindings = checks
    .filter((check) => requirement.implementation.existingCheckIds.some((pattern) => matchesCheckId(check.id, pattern)))
    .map((check) => ({ id: check.id, status: check.status }));
  const outcome = !applicable
    ? "not_applicable"
    : requirement.implementation.status === "partial"
      ? "partial"
      : requirement.implementation.status === "not_implemented"
        ? "not_implemented"
        : implementedOutcome(observedFindings);

  return {
    requirementId: requirement.checkId,
    title: requirement.title,
    citations: requirement.citations.map((citation) => ({ ...citation })),
    applicability: applicable ? "applicable" : "not_applicable",
    evidenceScope: requirement.applicability.evidenceScope,
    implementationStatus: requirement.implementation.status,
    linkedCheckIds: [...requirement.implementation.existingCheckIds],
    observedFindings,
    outcome,
    conclusive: !applicable || (requirement.implementation.status === "implemented" && isConclusive(outcome)),
  };
}

function implementedOutcome(observed: Array<{ status: CheckStatus }>): CheckStatus {
  if (observed.length === 0) return "not_checked";
  const statuses = new Set(observed.map((finding) => finding.status));
  for (const status of ["unsupported", "inconclusive", "not_checked", "fail", "warn", "pass"] as const) {
    if (statuses.has(status)) return status;
  }
  return "not_applicable";
}

function isConclusive(outcome: Ts119612CoverageOutcome): boolean {
  return ["pass", "fail", "warn", "not_applicable"].includes(outcome);
}

function ids(entries: Ts119612RequirementCoverage[]): string[] {
  return entries.map((entry) => entry.requirementId);
}

function matchesCheckId(checkId: string, pattern: string): boolean {
  if (!pattern.includes("*")) return checkId === pattern;
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`).test(checkId);
}
