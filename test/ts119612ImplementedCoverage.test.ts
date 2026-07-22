import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { filterTs119612Requirements } from "../src/standards/ts119612Requirements.js";

interface CoverageCase {
  testFile: string;
  fixtures: string[];
  findingId: string;
  status: "pass" | "fail";
}

interface CoverageEntry {
  requirementId: string;
  positive: CoverageCase;
  negative: CoverageCase;
}

interface CoverageManifest {
  schemaVersion: number;
  standard: string;
  requirements: CoverageEntry[];
}

const MANIFEST = "test/fixtures/ts119612-implemented-coverage.json";

describe("TS 119 612 implemented-family fixture coverage", () => {
  it("links every implemented ledger family to deterministic positive and focused negative evidence", async () => {
    const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as CoverageManifest;
    const implemented = filterTs119612Requirements({ implementationStatus: "implemented" });
    const implementedIds = implemented.map((entry) => entry.checkId).sort();
    const coveredIds = manifest.requirements.map((entry) => entry.requirementId).sort();

    expect(manifest).toMatchObject({ schemaVersion: 1, standard: "ETSI TS 119 612 V2.4.1" });
    expect(new Set(coveredIds).size).toBe(coveredIds.length);
    expect(coveredIds).toEqual(implementedIds);

    for (const entry of manifest.requirements) {
      const requirement = implemented.find((candidate) => candidate.checkId === entry.requirementId);
      expect(requirement, entry.requirementId).toBeDefined();
      await assertCase(entry.requirementId, "positive", entry.positive, requirement?.implementation.existingCheckIds ?? []);
      await assertCase(entry.requirementId, "negative", entry.negative, requirement?.implementation.existingCheckIds ?? []);
    }
  });
});

async function assertCase(
  requirementId: string,
  polarity: "positive" | "negative",
  coverage: CoverageCase,
  existingCheckIds: readonly string[],
): Promise<void> {
  expect(coverage.status, `${requirementId} ${polarity}`).toBe(polarity === "positive" ? "pass" : "fail");
  expect(existingCheckIds.some((pattern) => matchesCheckId(coverage.findingId, pattern)), `${requirementId} ${coverage.findingId}`).toBe(true);
  expect(coverage.fixtures.length, `${requirementId} ${polarity} fixtures`).toBeGreaterThan(0);

  await access(coverage.testFile);
  const testSource = await readFile(coverage.testFile, "utf8");
  expect(testSource, `${coverage.testFile} references ${coverage.findingId}`).toContain(coverage.findingId);
  expect(testSource, `${coverage.testFile} asserts ${coverage.status}`).toContain(`status: "${coverage.status}"`);
  for (const fixture of coverage.fixtures) await access(fixture);
}

function matchesCheckId(checkId: string, pattern: string): boolean {
  if (!pattern.includes("*")) return checkId === pattern;
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`).test(checkId);
}
