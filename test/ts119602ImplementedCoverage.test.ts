import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { TS119602_REQUIREMENTS } from "../src/standards/ts119602Requirements.js";

interface FixtureSet {
  positive: string[];
  negative: string[];
}

interface CoverageEntry {
  requirementId: string;
  findingId: string;
  testFile: string;
  fixtureSet: string;
}

interface CoverageManifest {
  schemaVersion: number;
  standard: string;
  fixtureSets: Record<string, FixtureSet>;
  requirements: CoverageEntry[];
}

const MANIFEST = "test/fixtures/ts119602-implemented-coverage.json";

describe("TS 119 602 implemented-family fixture coverage", () => {
  it("links every implemented ledger family to deterministic positive and focused negative evidence", async () => {
    const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as CoverageManifest;
    const implemented = TS119602_REQUIREMENTS.filter((entry) => entry.implementation.status === "implemented");
    const implementedIds = implemented.map((entry) => entry.checkId).sort();
    const coveredIds = manifest.requirements.map((entry) => entry.requirementId).sort();

    expect(manifest).toMatchObject({ schemaVersion: 1, standard: "ETSI TS 119 602 V1.1.1" });
    expect(new Set(coveredIds).size).toBe(coveredIds.length);
    expect(coveredIds).toEqual(implementedIds);

    for (const entry of manifest.requirements) {
      const requirement = implemented.find((candidate) => candidate.checkId === entry.requirementId);
      const fixtures = manifest.fixtureSets[entry.fixtureSet];
      expect(requirement, entry.requirementId).toBeDefined();
      expect(fixtures, `${entry.requirementId} fixture set`).toBeDefined();
      expect(matchesAnyCheckId(entry.findingId, requirement?.implementation.existingCheckIds ?? []), entry.requirementId).toBe(true);
      expect(fixtures.positive.length, `${entry.requirementId} positive fixtures`).toBeGreaterThan(0);
      expect(fixtures.negative.length, `${entry.requirementId} negative fixtures`).toBeGreaterThan(0);

      await access(entry.testFile);
      const testSource = await readFile(entry.testFile, "utf8");
      expect(referencesFinding(testSource, entry.findingId), `${entry.testFile} references ${entry.findingId}`).toBe(true);
      for (const fixture of [...fixtures.positive, ...fixtures.negative]) await access(fixture);
    }
  });
});

function referencesFinding(source: string, findingId: string): boolean {
  return source.includes(findingId)
    || (findingId.startsWith("ts119602.profile.") && source.includes("ts119602.profile.${profile}"));
}

function matchesAnyCheckId(checkId: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const expression = pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${expression}$`).test(checkId);
  });
}
