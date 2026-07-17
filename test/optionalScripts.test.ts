import { spawnSync } from "node:child_process";
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
});
