import type { FcafTrustedAuthoritiesReadiness, FcafTrustedAuthoritiesScenario, FixtureReadiness, TrustedListAuditResult } from "../types.js";

export interface FcafTrustedAuthoritiesInput {
  pointerCount: number;
  results: TrustedListAuditResult[];
  pointerCertificatesParsed: number;
  accessCaOrWrpacProviderCount: number;
  fixtureReadiness: FixtureReadiness;
}

/**
 * Maps already-audited material to FCAF WS_RP `trusted_authorities` fixture
 * prerequisites. It describes fixture potential only; it does not issue a
 * presentation request or decide verifier trust.
 */
export function assessFcafTrustedAuthorities(input: FcafTrustedAuthoritiesInput): FcafTrustedAuthoritiesReadiness {
  const successful = input.results.filter((result) => result.fetch.ok);
  const xml = successful.filter((result) => result.detected.artifactKind === "ts119612_xml_tsl" || result.detected.artifactKind === "ts119612_xml_lotl");
  const recognized = successful.filter((result) => ["ts119612_xml_tsl", "ts119612_xml_lotl", "json_lote", "json_lotl"].includes(result.detected.artifactKind));
  const signingEvidence = xml.filter((result) => hasPassingCheck(result, "signature.signing_certificate_parsed"));
  const failedFetches = input.results.filter((result) => result.fetch.attempted && !result.fetch.ok);
  const hasAnchors = input.pointerCertificatesParsed > 0;
  const hasAccessCa = input.accessCaOrWrpacProviderCount > 0;
  const tlPositiveReady = xml.length > 0 && signingEvidence.length > 0 && hasAnchors;

  return {
    scenarios: [
      scenario("aki_positive_match_possible", hasAnchors ? "ready" : "not_ready", {
        pointerCertificatesParsed: input.pointerCertificatesParsed,
        recognizedArtifacts: recognized.length,
      }, hasAnchors ? [] : ["A parseable pointer certificate is required as trusted-authority evidence for an AKI match."]),
      scenario("aki_no_match_possible", hasAnchors ? "ready" : "not_ready", {
        pointerCertificatesParsed: input.pointerCertificatesParsed,
        recognizedArtifacts: recognized.length,
      }, hasAnchors ? [] : ["A parseable pointer certificate is required so a deliberately non-matching AKI can be assessed."]),
      scenario("etsi_tl_positive_match_possible", tlPositiveReady ? "ready" : xml.length > 0 ? "partially_ready" : "not_ready", {
        xmlTrustedLists: xml.length,
        parsedSigningCertificates: signingEvidence.length,
        pointerCertificatesParsed: input.pointerCertificatesParsed,
      }, tlPrerequisites(xml.length, signingEvidence.length, hasAnchors)),
      scenario("etsi_tl_no_match_possible", tlPositiveReady ? "ready" : xml.length > 0 ? "partially_ready" : "not_ready", {
        xmlTrustedLists: xml.length,
        parsedSigningCertificates: signingEvidence.length,
        pointerCertificatesParsed: input.pointerCertificatesParsed,
      }, tlPrerequisites(xml.length, signingEvidence.length, hasAnchors)),
      scenario("etsi_tl_unreachable_negative_possible", input.pointerCount > 0 ? "ready" : "not_checked", {
        lotlPointers: input.pointerCount,
        observedFetchFailures: failedFetches.length,
        pointerSources: input.results.map((result) => result.source),
      }, input.pointerCount > 0 ? [] : ["At least one LoTL pointer URL is required to model an unreachable ETSI TL." ]),
      scenario("etsi_tl_invalid_signature_negative_possible", xml.length === 0 ? "not_ready" : signingEvidence.length > 0 ? "ready" : "partially_ready", {
        xmlTrustedLists: xml.length,
        parsedSigningCertificates: signingEvidence.length,
      }, xml.length === 0
        ? ["A fetched ETSI TS 119 612 XML trusted-list artifact is required as the immutable source fixture."]
        : signingEvidence.length === 0
          ? ["Parsed XML signing-certificate evidence is required to establish a signed source fixture before an invalid-signature variant is described."]
          : []),
      scenario("etsi_tl_cascading_lotl_tl_possible", input.pointerCount > 0 && recognized.length > 0 ? "ready" : input.pointerCount > 0 ? "partially_ready" : "not_ready", {
        lotlPointers: input.pointerCount,
        recognizedArtifacts: recognized.length,
      }, input.pointerCount === 0
        ? ["The audited LoTL must contain a pointer to a child TL/LoTE artifact."]
        : recognized.length === 0
          ? ["At least one successfully fetched child TL/LoTE artifact is required for a cascading LoTL-to-TL scenario."]
          : []),
      scenario("rpac_chain_to_access_ca_possible", rpacStatus(input.fixtureReadiness, hasAccessCa), {
        accessCaOrWrpacProviderCount: input.accessCaOrWrpacProviderCount,
        rpacChain: input.fixtureReadiness.rpacChain ?? null,
      }, rpacPrerequisites(input.fixtureReadiness, hasAccessCa)),
    ],
  };
}

function scenario(id: FcafTrustedAuthoritiesScenario["id"], status: FcafTrustedAuthoritiesScenario["status"], evidence: Record<string, unknown>, missingPrerequisites: string[]): FcafTrustedAuthoritiesScenario {
  return { id, status, evidence, missingPrerequisites };
}

function hasPassingCheck(result: TrustedListAuditResult, id: string): boolean {
  return result.ts119612.checks.some((check) => check.id === id && check.status === "pass");
}

function tlPrerequisites(xmlCount: number, signingCount: number, hasAnchors: boolean): string[] {
  const missing: string[] = [];
  if (xmlCount === 0) missing.push("A fetched ETSI TS 119 612 XML trusted-list artifact is required.");
  if (signingCount === 0) missing.push("Parsed XML signing-certificate evidence is required.");
  if (!hasAnchors) missing.push("A parseable pointer certificate is required as candidate trusted-authority evidence.");
  return missing;
}

function rpacStatus(readiness: FixtureReadiness, hasAccessCa: boolean): FcafTrustedAuthoritiesScenario["status"] {
  if (!hasAccessCa) return "not_ready";
  if (!readiness.rpacChain) return "not_checked";
  return readiness.rpacChain.chainStructurallyValid && readiness.rpacChain.trustedByTlLote ? "ready" : "partially_ready";
}

function rpacPrerequisites(readiness: FixtureReadiness, hasAccessCa: boolean): string[] {
  const missing: string[] = [];
  if (!hasAccessCa) missing.push("A WE BUILD Access CA/WRPAC provider role is required.");
  if (!readiness.rpacChain) missing.push("Supply an RPAC/WRPAC chain with --rpac-chain to assess chaining to an Access CA.");
  else {
    if (!readiness.rpacChain.chainStructurallyValid) missing.push("The supplied RPAC/WRPAC chain must be structurally valid.");
    if (!readiness.rpacChain.trustedByTlLote) missing.push("The supplied RPAC/WRPAC chain must match a candidate TL/LoTE trust anchor.");
  }
  return missing;
}
