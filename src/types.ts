export type ConformanceLevel =
  | "conformant"
  | "partially_conformant"
  | "non_conformant"
  | "not_applicable"
  | "not_checked"
  | "fetch_failed"
  | "parse_failed";

export type DetectedFormat = "xml" | "json" | "html" | "text" | "empty" | "unknown";

export type ArtifactKind =
  | "ts119612_xml_tsl"
  | "ts119612_xml_lotl"
  | "xml_lotl_like"
  | "json_lote"
  | "json_lotl"
  | "html_error"
  | "unknown";

export type ApplicabilityStatus = "applicable" | "not_applicable" | "unknown";

export interface StandardApplicability {
  ts119612: ApplicabilityStatus;
  ts119602: ApplicabilityStatus;
  weBuildProfile: ApplicabilityStatus;
  eudiTrustRole: ApplicabilityStatus;
}

export type CheckStatus = "pass" | "fail" | "warn" | "not_applicable" | "not_checked";
export type CheckSeverity = "info" | "warning" | "error" | "critical";

export interface CheckResult {
  id: string;
  category:
    | "fetch"
    | "parse"
    | "schema"
    | "structure"
    | "dates"
    | "signature"
    | "xades"
    | "services"
    | "certificates"
    | "profile";
  status: CheckStatus;
  severity: CheckSeverity;
  message: string;
  evidence?: unknown;
}

export interface CertificateSummary {
  source: "pointer" | "xml_signature" | "service_digital_identity";
  subject?: string;
  issuer?: string;
  serialNumber?: string;
  notBefore?: string;
  notAfter?: string;
  fingerprintSha256?: string;
  validAtAssessmentTime?: boolean;
}

export interface AuditReport {
  schemaVersion: 2;
  tool: {
    name: "we-build-tl-audit";
    version: string;
  };
  generatedAt: string;
  input: {
    source: string;
    kind: "file" | "url" | "json";
    sha256?: string;
  };
  lotl: {
    schemeOperatorName?: string;
    schemeName?: string;
    loteType?: string;
    sequenceNumber?: number;
    issueDateTime?: string;
    nextUpdate?: string;
    pointerCount: number;
    uniqueLocationCount: number;
    duplicateLocations: string[];
  };
  weBuildProfile: {
    recognized: boolean;
    recognitionReasons: string[];
    listTypeCounts: Record<string, number>;
    roleCounts: Record<string, number>;
    pointerConsistency: {
      declaredMimeMismatches: number;
      duplicateLocations: number;
      pointersMissingServiceDigitalIdentities: number;
      pointersMissingQualifiers: number;
      pointerCertificatesParsed: number;
      pointerCertificatesInvalidAtAssessment: number;
    };
  };
  fixtureReadiness: FixtureReadiness;
  fcafTrustedAuthorities: FcafTrustedAuthoritiesReadiness;
  negativeFixtureDescriptors: NegativeFixtureDescriptor[];
  summary: {
    totalPointers: number;
    fetched: number;
    fetchFailed: number;
    xmlArtifacts: number;
    jsonArtifacts: number;
    unknownArtifacts: number;
    ts119612: {
      conformant: number;
      partiallyConformant: number;
      nonConformant: number;
      notApplicable: number;
      notChecked: number;
      parseFailed: number;
    };
  };
  results: TrustedListAuditResult[];
}

export interface TrustedListAuditResult {
  /** Stable within a report for the same pointer position and location. */
  id: string;
  index: number;
  /** The assessed artifact source URL or path. */
  source: string;
  /** @deprecated Use source. Retained for existing integrations. */
  location: string;
  declared: {
    mimeType?: string;
    loteType?: string;
    schemeOperatorName?: string;
    schemeTerritory?: string;
    pointerCertificateFingerprintsSha256: string[];
  };
  fetch: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    statusText?: string;
    finalUrl?: string;
    contentType?: string;
    durationMs?: number;
    sha256?: string;
    bytes?: number;
    error?: string;
  };
  detected: {
    format: DetectedFormat;
    artifactKind: ArtifactKind;
  };
  standardApplicability: StandardApplicability;
  ts119612: {
    applicable: boolean;
    conformanceLevel: ConformanceLevel;
    score: number | null;
    checks: CheckResult[];
    mandatoryFailures: string[];
    warnings: string[];
  };
  extracted?: {
    tslVersionIdentifier?: string;
    tslSequenceNumber?: string;
    tslType?: string;
    schemeOperatorName?: string[];
    schemeName?: string[];
    schemeTerritory?: string;
    statusDeterminationApproach?: string;
    listIssueDateTime?: string;
    nextUpdate?: string;
    distributionPoints?: string[];
    trustServiceProviderCount?: number;
    serviceCount?: number;
    certificates?: CertificateSummary[];
    jsonLote?: Record<string, unknown>;
  };
}

export interface PointerInfo {
  index: number;
  location: string;
  declared: TrustedListAuditResult["declared"];
  raw: unknown;
}

export interface CliOptions {
  input: string;
  outDir: string;
  concurrency: number;
  timeoutMs: number;
  xsd?: string;
  strict: boolean;
  includeJsonLoteChecks: boolean;
  fetch: boolean;
  rpacChain?: string;
  generateNegativeFixtures?: boolean;
}

export interface FixtureReadiness {
  usableForWalletTrustFixture: boolean;
  verdict: "ready" | "not_ready" | "partially_ready" | "not_checked";
  checks: CheckResult[];
  caveats: string[];
  rpacChain?: {
    chainStructurallyValid: boolean;
    trustedByTlLote: boolean;
  };
}

export type FixtureScenarioStatus = "ready" | "not_ready" | "partially_ready" | "not_checked";

export type FcafTrustedAuthoritiesScenarioId =
  | "aki_positive_match_possible"
  | "aki_no_match_possible"
  | "etsi_tl_positive_match_possible"
  | "etsi_tl_no_match_possible"
  | "etsi_tl_unreachable_negative_possible"
  | "etsi_tl_invalid_signature_negative_possible"
  | "etsi_tl_cascading_lotl_tl_possible"
  | "rpac_chain_to_access_ca_possible";

export interface FcafTrustedAuthoritiesScenario {
  id: FcafTrustedAuthoritiesScenarioId;
  status: FixtureScenarioStatus;
  evidence: Record<string, unknown>;
  missingPrerequisites: string[];
}

export interface FcafTrustedAuthoritiesReadiness {
  scenarios: FcafTrustedAuthoritiesScenario[];
}

export type NegativeFixtureDescriptorId =
  | "unknown_access_ca"
  | "expired_rpac"
  | "wrong_lote_or_list_type"
  | "unreachable_tl_url"
  | "invalid_tl_signature"
  | "missing_trust_anchor"
  | "rpac_chain_not_anchored"
  | "requested_verifier_role_not_present";

export interface NegativeFixtureDescriptor {
  id: NegativeFixtureDescriptorId;
  status: FixtureScenarioStatus;
  title: string;
  sourceArtifacts: string[];
  evidence: Record<string, unknown>;
  steps: string[];
  missingPrerequisites: string[];
}
