import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FcafTrustedAuthoritiesReadiness, FixtureReadiness, FixtureScenarioStatus, NegativeFixtureDescriptor, TrustedListAuditResult } from "../types.js";

export interface NegativeFixtureDescriptorInput {
  results: TrustedListAuditResult[];
  fcafTrustedAuthorities: FcafTrustedAuthoritiesReadiness;
  fixtureReadiness: FixtureReadiness;
  pointerCertificatesParsed: number;
  accessCaOrWrpacProviderCount: number;
  listTypeCounts: Record<string, number>;
}

/** Describes test-owned negative cases without altering fetched material. */
export function generateNegativeFixtureDescriptors(input: NegativeFixtureDescriptorInput): NegativeFixtureDescriptor[] {
  const successfulSources = input.results.filter((result) => result.fetch.ok).map((result) => result.source);
  const xmlSources = input.results.filter((result) => result.fetch.ok && (result.detected.artifactKind === "ts119612_xml_tsl" || result.detected.artifactKind === "ts119612_xml_lotl")).map((result) => result.source);
  const recognizedSources = input.results.filter((result) => result.fetch.ok && ["ts119612_xml_tsl", "ts119612_xml_lotl", "json_lote", "json_lotl"].includes(result.detected.artifactKind)).map((result) => result.source);
  const scenario = (id: string) => input.fcafTrustedAuthorities.scenarios.find((item) => item.id === id);
  const anchorCount = input.pointerCertificatesParsed;
  const hasRole = input.accessCaOrWrpacProviderCount > 0;
  const chain = input.fixtureReadiness.rpacChain;

  return [
    descriptor("unknown_access_ca", scenario("aki_no_match_possible")?.status ?? "not_ready", "Unknown Access CA", successfulSources, { pointerCertificatesParsed: anchorCount }, ["Use a test-owned verifier/RPAC chain whose issuing Access CA is absent from the selected trusted-authorities set.", "Keep the audited TL/LoTE bytes unchanged."], scenario("aki_no_match_possible")?.missingPrerequisites ?? ["Candidate trust-anchor evidence was not assessed."]),
    descriptor("expired_rpac", hasRole && chain?.chainStructurallyValid ? "ready" : hasRole ? "partially_ready" : "not_ready", "Expired RPAC", successfulSources, { accessCaOrWrpacProviderCount: input.accessCaOrWrpacProviderCount, rpacChainStructurallyValid: chain?.chainStructurallyValid ?? false }, ["Select or issue a test-only RPAC whose validity period ended before the assessment time.", "Use the same trusted-authorities configuration; do not edit the fetched TL/LoTE."], hasRole ? chain?.chainStructurallyValid ? [] : ["Supply a structurally valid RPAC/WRPAC chain to establish the positive chain baseline."] : ["A WE BUILD Access CA/WRPAC provider role is required."]),
    descriptor("wrong_lote_or_list_type", recognizedSources.length > 0 && Object.keys(input.listTypeCounts).length > 0 ? "ready" : recognizedSources.length > 0 ? "partially_ready" : "not_ready", "Wrong LoTE/list type", recognizedSources, { listTypeCounts: input.listTypeCounts, recognizedArtifacts: recognizedSources.length }, ["Configure the test harness to select a different supported list-type identifier than the audited positive fixture.", "Do not relabel or mutate a fetched artifact; use test configuration or a separately owned fixture."], recognizedSources.length === 0 ? ["A successfully fetched TL/LoTE artifact is required."] : Object.keys(input.listTypeCounts).length === 0 ? ["The positive fixture needs a classified list type to select a conflicting type."] : []),
    descriptor("unreachable_tl_url", scenario("etsi_tl_unreachable_negative_possible")?.status ?? "not_checked", "Unreachable TL URL", successfulSources, { auditedPointerSources: input.results.map((result) => result.source) }, ["Configure a test-only trusted-list URL that is unreachable or returns a controlled network failure.", "Leave the audited source URL and fetched artifact untouched."], scenario("etsi_tl_unreachable_negative_possible")?.missingPrerequisites ?? ["An audited LoTL pointer URL is required."]),
    descriptor("invalid_tl_signature", scenario("etsi_tl_invalid_signature_negative_possible")?.status ?? "not_ready", "Invalid TL signature", xmlSources, { xmlTrustedListSources: xmlSources }, ["Create a separate test-owned copy of the signed XML trusted-list fixture and corrupt or replace its signature.", "Serve that copy from the test harness; never modify fetched live artifact bytes."], scenario("etsi_tl_invalid_signature_negative_possible")?.missingPrerequisites ?? ["A signed XML trusted-list source fixture is required."]),
    descriptor("missing_trust_anchor", anchorCount > 0 ? "ready" : "not_ready", "Missing trust anchor", successfulSources, { pointerCertificatesParsed: anchorCount }, ["Run the positive fixture with its candidate trust anchor omitted from the test-owned trusted-authorities configuration.", "Do not remove certificates from a fetched TL/LoTE artifact."], anchorCount > 0 ? [] : ["A parseable candidate trust anchor is required to demonstrate its omission."]),
    descriptor("rpac_chain_not_anchored", chain?.chainStructurallyValid ? "ready" : hasRole ? "partially_ready" : "not_ready", "RPAC chain valid but not anchored in selected TL/LoTE", successfulSources, { rpacChain: chain ?? null, accessCaOrWrpacProviderCount: input.accessCaOrWrpacProviderCount }, ["Use a structurally valid test RPAC/WRPAC chain with a selected TL/LoTE that does not contain its Access CA anchor.", "Keep both positive and negative materials as separate test-owned inputs."], chain?.chainStructurallyValid ? [] : hasRole ? ["Supply a structurally valid RPAC/WRPAC chain to distinguish structural validity from anchor selection."] : ["A WE BUILD Access CA/WRPAC provider role is required."]),
    descriptor("requested_verifier_role_not_present", hasRole && recognizedSources.length > 0 ? "ready" : recognizedSources.length > 0 ? "partially_ready" : "not_ready", "Requested verifier role not present", recognizedSources, { accessCaOrWrpacProviderCount: input.accessCaOrWrpacProviderCount, recognizedArtifacts: recognizedSources.length }, ["Request a verifier role that is absent from the selected test fixture's declared trust-role set.", "Use a test-owned request/configuration change; do not alter the audited artifacts."], recognizedSources.length === 0 ? ["A successfully fetched TL/LoTE artifact is required."] : hasRole ? [] : ["The positive fixture needs an identified Access CA/WRPAC provider role for comparison."]),
  ];
}

export async function writeNegativeFixtureDescriptors(descriptors: NegativeFixtureDescriptor[], directory = join("artifacts", "generated-fixtures")): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(directory, { recursive: true });
  const jsonPath = join(directory, "negative-fixture-descriptors.json");
  const markdownPath = join(directory, "negative-fixture-descriptors.md");
  await writeFile(jsonPath, `${JSON.stringify(descriptors, null, 2)}\n`);
  await writeFile(markdownPath, renderNegativeFixtureDescriptorsMarkdown(descriptors));
  return { jsonPath, markdownPath };
}

export function renderNegativeFixtureDescriptorsMarkdown(descriptors: NegativeFixtureDescriptor[]): string {
  const lines = ["# Negative fixture descriptors", "", "These descriptors describe test-owned configuration or copies. They do not mutate fetched artifacts.", ""];
  for (const descriptor of descriptors) {
    lines.push(`## ${descriptor.id}`, "", `- Status: ${descriptor.status}`, `- Title: ${descriptor.title}`, `- Source artifacts: ${descriptor.sourceArtifacts.join(", ") || "none"}`, `- Missing prerequisites: ${descriptor.missingPrerequisites.join("; ") || "none"}`, "- Steps:");
    descriptor.steps.forEach((step) => lines.push(`  - ${step}`));
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function descriptor(id: NegativeFixtureDescriptor["id"], status: FixtureScenarioStatus, title: string, sourceArtifacts: string[], evidence: Record<string, unknown>, steps: string[], missingPrerequisites: string[]): NegativeFixtureDescriptor {
  return { id, status, title, sourceArtifacts, evidence, steps, missingPrerequisites };
}
