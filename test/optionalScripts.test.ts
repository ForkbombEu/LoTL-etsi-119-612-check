import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

function run(script: string, args: string[]) {
  return spawnSync("bash", [script, ...args], { encoding: "utf8" });
}

describe("optional smoke scripts", () => {
  it("rejects an unsupported live reference source before running a smoke", () => {
    const result = run("scripts/optional/run-reference-smoke.sh", ["unsupported-source"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown reference source");
  });

  it("requires a timestamped smoke directory when packaging", () => {
    const result = run("scripts/optional/package-reference-smoke.sh", ["we-build-lotl-json", "not-a-timestamp"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid timestamp");
  });

  it("documents bounded manual TS 119 612 live checks without adding them to the normal suite", async () => {
    const procedure = await readFile("docs/ts119612-live-smoke.md", "utf8");
    expect(procedure).toContain("https://trustedlist.serviceproviders.eudiw.dev/LOTL/01.xml");
    expect(procedure).toContain("https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.xml");
    expect(procedure).toContain('"maxDereferences":8');
    expect(procedure).toContain('"maxBytesPerArtifact":5242880');
    expect(procedure).toContain('"maxTraversalDepth":3');
    expect(procedure).toContain("must not run from\n`npm test`");
    expect(procedure).toContain("completeVerdictEligible");
  });

  it("documents bounded manual TS 119 602 live checks without adding them to the normal suite", async () => {
    const procedure = await readFile("docs/ts119602-live-smoke.md", "utf8");
    expect(procedure).toContain("https://trustedlist.serviceproviders.eudiw.dev/");
    expect(procedure).toContain("https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.json");
    expect(procedure).toContain("https://webuild-consortium.github.io/wp4-trust-group/list_of_trusted_lists.xml");
    expect(procedure).toContain('"maxDereferences":8');
    expect(procedure).toContain('"maxBytesPerArtifact":5242880');
    expect(procedure).toContain('"maxTraversalDepth":3');
    expect(procedure).toContain("must not run from `npm test`");
    expect(procedure).toContain("ts119602Coverage");
    expect(procedure).toContain("completeVerdictEligible");
  });
});
