import type { CheckResult, CheckStatus, Ts119602Binding, Ts119602Classification, Ts119602Profile } from "../types.js";
import {
  summarizeTs119602Requirements,
  TS119602_REQUIREMENTS,
  TS119602_SOURCE,
  type Ts119602Citation,
  type Ts119602EvidenceScope,
  type Ts119602ImplementationStatus,
  type Ts119602Requirement,
  type Ts119602SchemeMode,
} from "./ts119602Requirements.js";

export type Ts119602CoverageOutcome = CheckStatus | "partial" | "not_implemented";

export interface Ts119602RequirementCoverage {
  requirementId: string;
  title: string;
  citations: Ts119602Citation[];
  applicability: "applicable" | "not_applicable";
  evidenceScope: Ts119602EvidenceScope;
  implementationStatus: Ts119602ImplementationStatus;
  linkedCheckIds: string[];
  observedFindings: Array<{ id: string; status: CheckStatus }>;
  outcome: Ts119602CoverageOutcome;
  conclusive: boolean;
}

export interface Ts119602CoverageAudit {
  standard: { document: string; version: string; publicationDate: string };
  selection: {
    binding: Ts119602Binding;
    bindingStatus: Ts119602Classification["bindingStatus"];
    profile: Ts119602Profile;
    profileStatus: Ts119602Classification["profileStatus"];
    schemeMode: Ts119602SchemeMode | "unknown";
  };
  ledger: {
    total: number;
    applicable: number;
    notApplicable: number;
    implemented: number;
    partial: number;
    notImplemented: number;
    contextual: number;
  };
  applicableImplemented: { total: number; conclusive: number; nonConclusive: number };
  blockers: {
    partialRequirementIds: string[];
    notImplementedRequirementIds: string[];
    nonConclusiveImplementedRequirementIds: string[];
    contextualRequirementIds: string[];
    selection: string[];
  };
  completeVerdictEligible: boolean;
  requirements: Ts119602RequirementCoverage[];
}

export interface Ts119602CoverageSelection {
  classification: Ts119602Classification;
  schemeMode: Ts119602SchemeMode | "unknown";
}

/** Audit all 81 ledger families for one applicable TS 119 602 artifact. */
export function auditTs119602Coverage(
  selection: Ts119602CoverageSelection,
  checks: readonly CheckResult[],
  requirements: readonly Ts119602Requirement[] = TS119602_REQUIREMENTS,
): Ts119602CoverageAudit {
  if (selection.classification.applicability !== "applicable") {
    throw new Error("TS 119 602 coverage requires an applicable classified artifact.");
  }

  const entries = requirements.map((requirement) => auditRequirement(requirement, selection, checks));
  const applicable = entries.filter((entry) => entry.applicability === "applicable");
  const applicableImplemented = applicable.filter((entry) => entry.implementationStatus === "implemented");
  const partialRequirementIds = ids(applicable.filter((entry) => entry.implementationStatus === "partial"));
  const notImplementedRequirementIds = ids(applicable.filter((entry) => entry.implementationStatus === "not_implemented"));
  const nonConclusiveImplementedRequirementIds = ids(applicableImplemented.filter((entry) => !entry.conclusive));
  const contextualRequirementIds = ids(applicable.filter((entry) => entry.evidenceScope !== "local"));
  const selectionBlockers = selectionBlockersFor(selection);
  const completeVerdictEligible = applicable.length > 0
    && partialRequirementIds.length === 0
    && notImplementedRequirementIds.length === 0
    && nonConclusiveImplementedRequirementIds.length === 0
    && selectionBlockers.length === 0;

  return {
    standard: {
      document: TS119602_SOURCE.document,
      version: TS119602_SOURCE.version,
      publicationDate: TS119602_SOURCE.publicationDate,
    },
    selection: {
      binding: selection.classification.binding,
      bindingStatus: selection.classification.bindingStatus,
      profile: selection.classification.profile,
      profileStatus: selection.classification.profileStatus,
      schemeMode: selection.schemeMode,
    },
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
      selection: selectionBlockers,
    },
    completeVerdictEligible,
    requirements: entries,
  };
}

export function ts119602CoverageFinding(audit: Ts119602CoverageAudit): CheckResult {
  return {
    id: "ts119602.coverage.complete",
    category: "profile",
    status: audit.completeVerdictEligible ? "pass" : "not_checked",
    severity: audit.completeVerdictEligible ? "info" : "warning",
    message: audit.completeVerdictEligible
      ? "Every applicable TS 119 602 ledger family is implemented and every implemented family produced a conclusive result."
      : `A complete TS 119 602 verdict is blocked by ${audit.ledger.partial} partial, ${audit.ledger.notImplemented} not-implemented, ${audit.applicableImplemented.nonConclusive} non-conclusive implemented, and ${audit.blockers.selection.length} selection blockers.`,
    evidence: {
      ...summarizeTs119602Requirements(),
      selection: audit.selection,
      applicable: audit.ledger.applicable,
      applicableImplemented: audit.applicableImplemented,
      completeVerdictEligible: audit.completeVerdictEligible,
      blockers: audit.blockers,
    },
  };
}

export function inferTs119602CoverageSchemeMode(checks: readonly CheckResult[]): Ts119602SchemeMode | "unknown" {
  const evidence = checks.find((entry) => entry.id === "ts119602.structure.scheme_information_presence")?.evidence;
  if (!evidence || typeof evidence !== "object") return "unknown";
  const mode = (evidence as { mode?: unknown }).mode;
  return mode === "implicit" || mode === "explicit" ? mode : "unknown";
}

function auditRequirement(
  requirement: Ts119602Requirement,
  selection: Ts119602CoverageSelection,
  checks: readonly CheckResult[],
): Ts119602RequirementCoverage {
  const applicable = requirementApplicable(requirement, selection);
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

function requirementApplicable(requirement: Ts119602Requirement, selection: Ts119602CoverageSelection): boolean {
  const classification = selection.classification;
  const bindingApplicable = requirement.checkId === "ts119602.binding.supported"
    || (classification.binding !== "unknown" && requirement.applicability.bindings.includes(classification.binding));
  const profileApplicable = !requirement.checkId.startsWith("ts119602.profile.")
    || (classification.profile !== "unknown" && requirement.applicability.profiles.includes(classification.profile));
  const modeApplicable = selection.schemeMode === "unknown"
    || requirement.applicability.schemeModes.includes(selection.schemeMode);
  return bindingApplicable && profileApplicable && modeApplicable;
}

function selectionBlockersFor(selection: Ts119602CoverageSelection): string[] {
  const blockers: string[] = [];
  if (selection.classification.bindingStatus !== "selected" || selection.classification.binding === "unknown") {
    blockers.push("binding_not_selected");
  }
  if (selection.classification.profileStatus === "conflict") blockers.push("profile_conflict");
  if (selection.schemeMode === "unknown") blockers.push("scheme_mode_unknown");
  return blockers;
}

function implementedOutcome(observed: Array<{ status: CheckStatus }>): CheckStatus {
  if (observed.length === 0) return "not_checked";
  const statuses = new Set(observed.map((finding) => finding.status));
  for (const status of ["unsupported", "inconclusive", "not_checked", "fail", "warn", "pass"] as const) {
    if (statuses.has(status)) return status;
  }
  return "not_applicable";
}

function isConclusive(outcome: Ts119602CoverageOutcome): boolean {
  return ["pass", "fail", "warn", "not_applicable"].includes(outcome);
}

function ids(entries: Ts119602RequirementCoverage[]): string[] {
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
