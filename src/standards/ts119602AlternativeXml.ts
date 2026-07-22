import type { CheckResult, Ts119602Classification } from "../types.js";
import type { Ts119612ValidatedFacts } from "../xml/ts119612Facts.js";
import { buildTs119602EntityFindings } from "./ts119602Entities.js";
import { findTs119602Interpretation } from "./ts119602Interpretations.js";
import { buildTs119602MetadataFindings } from "./ts119602Metadata.js";
import { buildTs119602ProfileFindings } from "./ts119602Profiles.js";
import { summarizeTs119602Requirements } from "./ts119602Requirements.js";

const EXPECTED_TABLE_A1_ROWS = 34;

export interface Ts119602AlternativeXmlAssessment {
  checks: CheckResult[];
  mapped: boolean;
  entityCount: number;
  serviceCount: number;
}

/** Assess Annex A.2.2 exclusively from facts emitted by the TS 119 612 assessor. */
export function assessTs119602AlternativeXml(
  facts: Ts119612ValidatedFacts | undefined,
  sourceChecks: readonly CheckResult[],
  profileSelectionStatus: Ts119602Classification["profileStatus"],
): Ts119602AlternativeXmlAssessment {
  if (!facts) {
    return gated([finding(
      "ts119602.binding.ts119612_mapping", "fail", "critical",
      "The TS 119 612 assessor did not emit the typed facts required for Annex A.2.2 mapping.",
      { sourceFactsPresent: false, expectedTableRows: EXPECTED_TABLE_A1_ROWS },
    )]);
  }

  const mapping = mappingFinding(facts);
  if (mapping.status !== "pass") {
    return gated([
      mapping,
      finding(
        "ts119602.profile.mapping_gate", mapping.status === "fail" ? "fail" : "not_checked",
        mapping.status === "fail" ? "critical" : "warning",
        "TS 119 602 profile checks were not applied because the TS 119 612 schema/binding mapping gate did not pass.",
        { mappingStatus: mapping.status, sourceSchemaStatus: facts.sourceSchemaStatus, sourceBindingStatus: facts.sourceBindingStatus },
      ),
      coverageFinding(),
    ], facts);
  }

  const entityAssessment = buildTs119602EntityFindings(facts.entities);
  const metadataChecks = buildTs119602MetadataFindings(facts.metadata)
    .filter((entry) => entry.id !== "ts119602.structure.lote_tag");
  const profileChecks = buildTs119602ProfileFindings({
    binding: "ts119612_alternative_xml",
    metadata: facts.metadata,
    entities: facts.entities,
    signatureChecks: sourceChecks,
    profileSelectionStatus,
  });
  return {
    checks: [
      mapping,
      loteTagConflictFinding(facts),
      versionConflictFinding(facts),
      ...metadataChecks,
      ...entityAssessment.checks,
      ...profileChecks,
      coverageFinding(),
    ],
    mapped: true,
    entityCount: facts.entities.entities.length,
    serviceCount: facts.entities.entities.reduce((sum, entity) => sum + entity.services.length, 0),
  };
}

function mappingFinding(facts: Ts119612ValidatedFacts): CheckResult {
  const tableComplete = facts.mappedFields.length === EXPECTED_TABLE_A1_ROWS
    && new Set(facts.mappedFields.map((entry) => entry.targetComponent)).size === EXPECTED_TABLE_A1_ROWS;
  const evidence = {
    citation: "ETSI TS 119 602 V1.1.1 Annex A.2.2, Table A.1",
    sourceNamespace: facts.sourceNamespace,
    sourceSchemaStatus: facts.sourceSchemaStatus,
    sourceBindingStatus: facts.sourceBindingStatus,
    expectedRowCount: EXPECTED_TABLE_A1_ROWS,
    observedRowCount: facts.mappedFields.length,
    tableComplete,
    rows: facts.mappedFields,
    xmlReparsedByTs119602: false,
  };
  if (facts.sourceSchemaStatus === "fail" || !tableComplete) {
    return finding("ts119602.binding.ts119612_mapping", "fail", "critical",
      "The Annex A.2.2 mapping gate failed because the source schema failed or Table A.1 is incomplete.", evidence);
  }
  if (facts.sourceSchemaStatus !== "pass") {
    return finding("ts119602.binding.ts119612_mapping", "not_checked", "warning",
      "Table A.1 facts were emitted, but the source TS 119 612 schema was not conclusively validated.", evidence);
  }
  if (facts.sourceBindingStatus !== "pass") {
    return finding("ts119602.binding.ts119612_mapping", "inconclusive", "warning",
      "The source schema passed, but TS 119 612 namespace/version binding evidence is not conclusive.", evidence);
  }
  return finding("ts119602.binding.ts119612_mapping", "pass", "info",
    "The validated TS 119 612 source was mapped through every Annex A.2.2 Table A.1 component without reparsing it in the TS 119 602 assessor.", evidence);
}

function versionConflictFinding(facts: Ts119612ValidatedFacts): CheckResult {
  const interpretation = findTs119602Interpretation("ts119602-v1.1.1-alternative-binding-version");
  return finding(
    "ts119602.binding.ts119612_mapping.version_conflict", "inconclusive", "warning",
    "Table A.1 maps TSLVersionIdentifier to LoTEVersionIdentifier, but the applicable source and Pub-EAA profile require different fixed values; the observed value was preserved.",
    { observedMappedValue: facts.metadata.version, ts119612V241Expected: 6, ts119602PubEaaExpected: 1, interpretation },
  );
}

function loteTagConflictFinding(facts: Ts119612ValidatedFacts): CheckResult {
  const interpretation = findTs119602Interpretation("ts119602-v1.1.1-alternative-binding-tag");
  return finding(
    "ts119602.structure.lote_tag", "inconclusive", "warning",
    "Clause 6.2 requires LOTETag, while Table A.1 does not map it to the source TSLTag; TSLTag was retained only as evidence and was not silently treated as LOTETag.",
    { observedTslTag: facts.metadata.loteTag.value ?? null, interpretation },
  );
}

function coverageFinding(): CheckResult {
  return finding(
    "ts119602.coverage.complete", "not_checked", "warning",
    "Complete ETSI TS 119 602 V1.1.1 contextual, multilingual and profile coverage remains incomplete for the alternative XML binding.",
    summarizeTs119602Requirements(),
  );
}

function gated(checks: CheckResult[], facts?: Ts119612ValidatedFacts): Ts119602AlternativeXmlAssessment {
  return {
    checks,
    mapped: false,
    entityCount: facts?.entities.entities.length ?? 0,
    serviceCount: facts?.entities.entities.reduce((sum, entity) => sum + entity.services.length, 0) ?? 0,
  };
}

function finding(
  id: string,
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): CheckResult {
  return { id, category: id.includes("binding") || id.includes("mapping") ? "profile" : "structure", status, severity, message, evidence };
}
