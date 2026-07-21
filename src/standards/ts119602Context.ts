import { certificateFingerprintSha256, sha256Hex } from "../certs.js";
import { detectArtifact } from "../detect.js";
import { fetchArtifact, type FetchResult } from "../fetcher.js";
import { asArray, firstString, getPath, parseLotlJson, stringValue } from "../lotl.js";
import type {
  ArtifactKind,
  CheckResult,
  ContextArtifactInput,
  DetectedFormat,
  TrustedListAuditResult,
  Ts119602ContextOptions,
} from "../types.js";
import { assessJsonLote } from "../json/loteChecks.js";
import { assessXmlLoteMetadata } from "../xml/loteMetadata.js";
import { parseXml } from "../xml/parse.js";
import { nodes, text, texts } from "../xml/xpath.js";
import { parseTs119602UtcDateTime } from "./ts119602Syntax.js";

const DEFAULT_MAX_DEREFERENCES = 16;
const HARD_MAX_DEREFERENCES = 32;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const HARD_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const HARD_MAX_PRIOR_ARTIFACTS = 32;

type ReferenceKind = "pointer" | "distribution" | "archive" | "supply_point";

interface ContextReference {
  kind: ReferenceKind;
  location: string;
  pointerIdentityFingerprintsSha256?: string[];
  pointerIdentityCount?: number;
}

interface ArtifactObservation {
  source: string;
  fetch?: FetchResult["fetch"];
  sha256: string;
  bytes: number;
  contentType?: string;
  format: DetectedFormat;
  artifactKind: ArtifactKind;
  sequenceNumber?: number;
  loteType?: string;
  issueDateTime?: string;
  signerFingerprintsSha256: string[];
  signatureVerified: boolean;
}

export interface Ts119602ContextAssessmentInput {
  currentBytes: Buffer;
  currentContentType?: string;
  currentResult: TrustedListAuditResult;
  timeoutMs: number;
  options: Ts119602ContextOptions;
}

/** Collect and validate explicitly supplied or opt-in dereferenced contextual evidence. */
export async function assessTs119602Context(input: Ts119602ContextAssessmentInput): Promise<CheckResult[]> {
  const limits = normalizedLimits(input.options);
  const current = observationFromResult(input.currentBytes, input.currentContentType, input.currentResult);
  const references = extractReferences(input.currentBytes, input.currentContentType);
  const suppliedPrior = input.options.priorArtifacts ?? [];
  const selectedPrior = suppliedPrior.slice(0, HARD_MAX_PRIOR_ARTIFACTS);
  const prior = await Promise.all(selectedPrior.map((artifact, index) => inspectSuppliedArtifact(artifact, index, limits.maxBytesPerArtifact)));
  const omittedPrior = Math.max(0, suppliedPrior.length - selectedPrior.length);
  const unique = uniqueReferences(references);
  const selectedReferences = unique.slice(0, limits.maxDereferences);
  const omittedReferences = unique.slice(limits.maxDereferences);
  const omitted = omittedReferences.length;
  const dereferenced = input.options.dereference
    ? await fetchReferences(selectedReferences, input.timeoutMs, limits)
    : [];

  return [
    sequenceFinding(current, prior),
    pointerFinding(current, references, dereferenced, Boolean(input.options.dereference), omittedCount(omittedReferences, "pointer")),
    distributionFinding(current, references, dereferenced, Boolean(input.options.dereference), omittedCount(omittedReferences, "distribution")),
    archiveFinding(current, references, prior, dereferenced, Boolean(input.options.dereference), omittedCount(omittedReferences, "archive")),
    supplyPointFinding(references, dereferenced, Boolean(input.options.dereference), omittedCount(omittedReferences, "supply_point")),
    finding(
      "ts119602.context.bounds",
      omitted === 0 && omittedPrior === 0 ? "pass" : "inconclusive",
      omitted === 0 && omittedPrior === 0 ? "info" : "warning",
      omitted === 0 && omittedPrior === 0
        ? "Contextual evidence collection stayed within the configured dereference limits."
        : "Some contextual references were not dereferenced because the configured limit was reached.",
      {
        dereferenceEnabled: Boolean(input.options.dereference),
        discoveredReferences: unique.length,
        selectedReferences: selectedReferences.length,
        omittedReferences: omitted,
        omittedPriorArtifacts: omittedPrior,
        suppliedPriorArtifacts: prior.length,
        limits,
      },
    ),
  ];
}

function normalizedLimits(options: Ts119602ContextOptions) {
  return {
    maxDereferences: Math.min(HARD_MAX_DEREFERENCES, positiveInteger(options.maxDereferences, DEFAULT_MAX_DEREFERENCES)),
    maxBytesPerArtifact: Math.min(HARD_MAX_BYTES, positiveInteger(options.maxBytesPerArtifact, DEFAULT_MAX_BYTES)),
    concurrency: Math.min(HARD_MAX_DEREFERENCES, positiveInteger(options.concurrency, DEFAULT_CONCURRENCY)),
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function extractReferences(bytes: Buffer, contentType?: string): ContextReference[] {
  const detected = detectArtifact(bytes, contentType);
  if ((detected.artifactKind === "json_lote" || detected.artifactKind === "json_lotl") && detected.parsedJson) {
    return extractJsonReferences(detected.parsedJson);
  }
  if (detected.artifactKind === "xml_lote") return extractXmlReferences(bytes.toString("utf8"));
  return [];
}

function extractJsonReferences(parsed: unknown): ContextReference[] {
  const info = getPath(parsed, ["LoTE", "ListAndSchemeInformation"]);
  const lotl = parseLotlJson(JSON.stringify(parsed));
  const pointers = lotl.pointers.map((pointer) => ({
    kind: "pointer" as const,
    location: pointer.location,
    pointerIdentityFingerprintsSha256: pointer.declared.pointerCertificateFingerprintsSha256,
    pointerIdentityCount: asArray(getPath(pointer.raw, ["ServiceDigitalIdentities"])).length,
  }));
  const distribution = stringValues(getPath(info, ["DistributionPoints"])).map((location) => ({ kind: "distribution" as const, location }));
  const informationUris = stringValues(getPath(info, ["SchemeInformationURI"]));
  const profileHasArchive = new Set([
    "http://uri.etsi.org/19602/LoTEType/EUPIDProvidersList",
    "http://uri.etsi.org/19602/LoTEType/EUWalletProvidersList",
    "http://uri.etsi.org/19602/LoTEType/EUWRPACProvidersList",
    "http://uri.etsi.org/19602/LoTEType/EUWRPRCProvidersList",
    "http://uri.etsi.org/19602/LoTEType/EURegistrarsAndRegistersList",
  ]).has(firstString(getPath(info, ["LoTEType"])) ?? "");
  const archives = (profileHasArchive ? informationUris.slice(1) : []).map((location) => ({ kind: "archive" as const, location }));
  const entities = asArray(getPath(parsed, ["LoTE", "TrustedEntitiesList"]));
  const supplyPoints = entities.flatMap((entity) => asArray(getPath(entity, ["TrustedEntityServices"])))
    .flatMap((service) => stringValues(getPath(service, ["ServiceInformation", "ServiceSupplyPoints"])))
    .map((location) => ({ kind: "supply_point" as const, location }));
  return [...pointers, ...distribution, ...archives, ...supplyPoints];
}

function extractXmlReferences(xml: string): ContextReference[] {
  const parsed = parseXml(xml);
  const root = parsed.document?.documentElement;
  if (!root) return [];
  const pointers = nodes(root, ".//*[local-name()='PointersToOtherLoTE']/*").flatMap((pointer) => {
    const location = text(pointer, ".//*[local-name()='LoTELocation']");
    if (!location) return [];
    const identities = nodes(pointer, ".//*[local-name()='ServiceDigitalIdentity']");
    const fingerprints = texts(pointer, ".//*[local-name()='ServiceDigitalIdentity']//*[local-name()='X509Certificate']")
      .map(certificateFingerprintSha256)
      .filter((value): value is string => Boolean(value));
    return [{ kind: "pointer" as const, location, pointerIdentityFingerprintsSha256: fingerprints, pointerIdentityCount: identities.length }];
  });
  const distribution = texts(root, ".//*[local-name()='DistributionPoints']//*[local-name()='URI']")
    .map((location) => ({ kind: "distribution" as const, location }));
  const loteType = text(root, ".//*[local-name()='ListAndSchemeInformation']/*[local-name()='LoTEType']");
  const informationUris = texts(root, ".//*[local-name()='ListAndSchemeInformation']/*[local-name()='SchemeInformationURI']//*[local-name()='URI']");
  const archives = loteType?.includes("PubEAAProvidersList") ? [] : informationUris.slice(1).map((location) => ({ kind: "archive" as const, location }));
  const supplyPoints = texts(root, ".//*[local-name()='ServiceSupplyPoints']//*[local-name()='URI']")
    .map((location) => ({ kind: "supply_point" as const, location }));
  return [...pointers, ...distribution, ...archives, ...supplyPoints];
}

async function inspectSuppliedArtifact(artifact: ContextArtifactInput, index: number, maxBytes: number): Promise<ArtifactObservation> {
  const bytes = Buffer.from(artifact.content, "utf8");
  if (bytes.length > maxBytes) {
    return failedObservation(artifact.source ?? `prior-artifact-${index + 1}`, {
      attempted: false,
      ok: false,
      bytes: bytes.length,
      error: `Supplied prior artifact exceeds the ${maxBytes}-byte limit.`,
    });
  }
  return inspectArtifact(bytes, artifact.contentType, artifact.source ?? `prior-artifact-${index + 1}`);
}

async function fetchReferences(
  references: ContextReference[],
  timeoutMs: number,
  limits: ReturnType<typeof normalizedLimits>,
): Promise<Array<{ reference: ContextReference; observation: ArtifactObservation }>> {
  const fetchedByLocation = new Map<string, Promise<FetchResult>>();
  const fetchOnce = (location: string) => {
    let pending = fetchedByLocation.get(location);
    if (!pending) {
      pending = fetchArtifact(location, timeoutMs, { maxBytes: limits.maxBytesPerArtifact });
      fetchedByLocation.set(location, pending);
    }
    return pending;
  };
  return mapConcurrent(references, limits.concurrency, async (reference) => {
    const fetched = await fetchOnce(reference.location);
    const observation = fetched.bytes
      ? await inspectArtifact(fetched.bytes, fetched.fetch.contentType, reference.location, fetched.fetch)
      : failedObservation(reference.location, fetched.fetch);
    return { reference, observation };
  });
}

async function inspectArtifact(bytes: Buffer, contentType: string | undefined, source: string, fetch?: FetchResult["fetch"]): Promise<ArtifactObservation> {
  const detected = detectArtifact(bytes, contentType);
  let assessed: Pick<TrustedListAuditResult, "ts119602" | "extracted"> | undefined;
  if (detected.artifactKind === "json_lote" || detected.artifactKind === "json_lotl") {
    assessed = assessJsonLote(detected.parsedJson, true, new Date(), { compactJades: detected.compactJades });
  } else if (detected.artifactKind === "xml_lote") {
    assessed = await assessXmlLoteMetadata(bytes.toString("utf8"));
  }
  return observationFromAssessment(bytes, contentType, source, detected.format, detected.artifactKind, assessed, fetch);
}

function observationFromResult(bytes: Buffer, contentType: string | undefined, result: TrustedListAuditResult): ArtifactObservation {
  return observationFromAssessment(bytes, contentType, result.source, result.detected.format, result.detected.artifactKind, result, result.fetch);
}

function observationFromAssessment(
  bytes: Buffer,
  contentType: string | undefined,
  source: string,
  format: DetectedFormat,
  artifactKind: ArtifactKind,
  assessed?: Pick<TrustedListAuditResult, "ts119602" | "extracted">,
  fetch?: FetchResult["fetch"],
): ArtifactObservation {
  const metadata = assessed?.extracted?.jsonLote;
  const certificates = assessed?.extracted?.certificates ?? [];
  const signatureIds = format === "jws" || format === "json"
    ? ["json_lote.signature.jades_cryptographic_verification_result"]
    : ["signature.cryptographic_verification_result"];
  return {
    source,
    fetch,
    sha256: sha256Hex(bytes),
    bytes: bytes.length,
    contentType,
    format,
    artifactKind,
    sequenceNumber: numberValue(metadata?.LoTESequenceNumber ?? assessed?.extracted?.tslSequenceNumber),
    loteType: firstString(metadata?.LoTEType, assessed?.extracted?.tslType),
    issueDateTime: firstString(metadata?.ListIssueDateTime, assessed?.extracted?.listIssueDateTime),
    signerFingerprintsSha256: certificates
      .filter((certificate) => certificate.source === "json_signature" || certificate.source === "xml_signature")
      .map((certificate) => certificate.fingerprintSha256)
      .filter((value): value is string => Boolean(value)),
    signatureVerified: Boolean(assessed?.ts119602.checks.some((entry) => signatureIds.includes(entry.id) && entry.status === "pass")),
  };
}

function failedObservation(source: string, fetch: FetchResult["fetch"]): ArtifactObservation {
  return { source, fetch, sha256: "", bytes: 0, contentType: fetch.contentType, format: "unknown", artifactKind: "unknown", signerFingerprintsSha256: [], signatureVerified: false };
}

function sequenceFinding(current: ArtifactObservation, prior: ArtifactObservation[]): CheckResult {
  if (prior.length === 0) {
    return finding("ts119602.scheme.sequence.history", "not_checked", "warning", "No prior LoTE artifact was supplied, so sequence progression cannot be established.", { current: compactObservation(current), priorCount: 0 });
  }
  const comparable = prior.filter((entry) => entry.sequenceNumber !== undefined && entry.loteType === current.loteType);
  const currentIssue = parseTs119602UtcDateTime(current.issueDateTime)?.getTime();
  const results = comparable.map((entry) => ({
    ...compactObservation(entry),
    sequenceIncreases: current.sequenceNumber !== undefined && entry.sequenceNumber !== undefined && current.sequenceNumber > entry.sequenceNumber,
    issueTimeIncreases: Boolean(currentIssue && parseTs119602UtcDateTime(entry.issueDateTime)
      && currentIssue > parseTs119602UtcDateTime(entry.issueDateTime)!.getTime()),
  }));
  const valid = results.length > 0 && results.every((entry) => entry.sequenceIncreases && entry.issueTimeIncreases);
  const status = comparable.length === 0 || comparable.length !== prior.length ? "inconclusive" : valid ? "pass" : "fail";
  return finding(
    "ts119602.scheme.sequence.history",
    status,
    status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass" ? "The current LoTE sequence and issue time increase across every supplied comparable prior instance." : status === "inconclusive" ? "One or more supplied prior artifacts are not comparable same-type LoTE instances, so sequence progression is inconclusive." : "Supplied comparable prior artifacts do not establish valid LoTE sequence and issue-time progression.",
    { current: compactObservation(current), suppliedPriorCount: prior.length, comparablePriorCount: comparable.length, results },
  );
}

function pointerFinding(current: ArtifactObservation, references: ContextReference[], fetched: Array<{ reference: ContextReference; observation: ArtifactObservation }>, enabled: boolean, omitted: number): CheckResult {
  const pointers = references.filter((entry) => entry.kind === "pointer");
  if (pointers.length === 0) return finding("ts119602.scheme.pointers.authentication", "not_applicable", "info", "Pointer authentication is not applicable because no pointers are present.", { pointerCount: 0 });
  if (!enabled) return finding("ts119602.scheme.pointers.authentication", "not_checked", "warning", "Pointer targets were not dereferenced because contextual dereferencing is disabled.", { pointerCount: pointers.length });
  const results = fetched.filter((entry) => entry.reference.kind === "pointer").map(({ reference, observation }) => {
    const declared = reference.pointerIdentityFingerprintsSha256 ?? [];
    const normalizedDeclared = declared.map((fingerprint) => fingerprint.toLowerCase());
    const signerMatch = observation.signerFingerprintsSha256.some((fingerprint) => normalizedDeclared.includes(fingerprint.toLowerCase()));
    const nonCertificateIdentityOnly = declared.length === 0 && (reference.pointerIdentityCount ?? 0) > 0;
    const selfPointerIdentical = observation.sha256 === current.sha256;
    return {
      location: reference.location,
      fetch: observation.fetch,
      target: compactObservation(observation),
      signatureVerified: observation.signatureVerified,
      declaredIdentityFingerprintsSha256: declared,
      signerMatch,
      nonCertificateIdentityOnly,
      selfPointerIdentical,
      authenticated: Boolean(observation.fetch?.ok && observation.signatureVerified && signerMatch && selfPointerIdentical),
    };
  });
  const unsupportedIdentity = results.some((entry) => entry.nonCertificateIdentityOnly);
  const valid = results.length === pointers.length && results.every((entry) => entry.authenticated);
  const status = omitted > 0 || unsupportedIdentity ? "inconclusive" : valid ? "pass" : "fail";
  return finding(
    "ts119602.scheme.pointers.authentication",
    status,
    status === "pass" ? "info" : status === "fail" ? "critical" : "warning",
    status === "pass"
      ? "Every self-pointer returned the current LoTE bytes with a verified signature matching at least one pointer certificate identity."
      : status === "inconclusive"
        ? "Pointer authentication is inconclusive because references were omitted or only unsupported non-certificate identity forms were supplied."
        : "One or more pointed-to LoTEs could not be authenticated by a declared pointer certificate identity.",
    { pointerCount: pointers.length, omittedReferences: omitted, results },
  );
}

function distributionFinding(current: ArtifactObservation, references: ContextReference[], fetched: Array<{ reference: ContextReference; observation: ArtifactObservation }>, enabled: boolean, omitted: number): CheckResult {
  const points = references.filter((entry) => entry.kind === "distribution");
  if (points.length === 0) return finding("ts119602.scheme.distribution_consistency", "not_applicable", "info", "Distribution consistency is not applicable because no distribution points are present.", { distributionPointCount: 0 });
  if (!enabled) return finding("ts119602.scheme.distribution_consistency", "not_checked", "warning", "Distribution points were not dereferenced because contextual dereferencing is disabled.", { distributionPointCount: points.length });
  const results = fetched.filter((entry) => entry.reference.kind === "distribution").map(({ reference, observation }) => ({
    location: reference.location,
    fetch: observation.fetch,
    observedSha256: observation.sha256,
    expectedSha256: current.sha256,
    identical: Boolean(observation.fetch?.ok && observation.sha256 === current.sha256),
  }));
  const valid = results.length === points.length && results.every((entry) => entry.identical);
  const status = omitted > 0 ? "inconclusive" : valid ? "pass" : "fail";
  return finding("ts119602.scheme.distribution_consistency", status, status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass" ? "Every distribution point returned bytes identical to the assessed current LoTE." : status === "inconclusive" ? "Distribution consistency is inconclusive because one or more references were omitted by the bound." : "One or more distribution points failed or returned bytes different from the assessed current LoTE.",
    { distributionPointCount: points.length, omittedReferences: omitted, results });
}

function archiveFinding(current: ArtifactObservation, references: ContextReference[], prior: ArtifactObservation[], fetched: Array<{ reference: ContextReference; observation: ArtifactObservation }>, enabled: boolean, omitted: number): CheckResult {
  const archives = references.filter((entry) => entry.kind === "archive");
  if (archives.length === 0) return finding("ts119602.context.archive", "not_applicable", "info", "No selected-profile archive reference is present.", { archiveReferenceCount: 0 });
  if (!enabled) return finding("ts119602.context.archive", "not_checked", "warning", "Archive references were not dereferenced because contextual dereferencing is disabled.", { archiveReferenceCount: archives.length, suppliedPriorArtifacts: prior.length });
  const results = fetched.filter((entry) => entry.reference.kind === "archive").map(({ reference, observation }) => ({
    location: reference.location,
    fetch: observation.fetch,
    artifact: compactObservation(observation),
    previousInstance: Boolean(observation.fetch?.ok && observation.loteType === current.loteType && observation.sequenceNumber !== undefined && current.sequenceNumber !== undefined && observation.sequenceNumber < current.sequenceNumber),
  }));
  const hasPrevious = results.some((entry) => entry.previousInstance);
  const failed = results.some((entry) => !entry.fetch?.ok);
  const status = omitted > 0 ? "inconclusive" : hasPrevious ? "pass" : failed ? "fail" : "inconclusive";
  return finding("ts119602.context.archive", status, status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass" ? "A dereferenced archive location directly exposed a comparable previous LoTE instance." : status === "fail" ? "A required archive location could not be fetched." : "Archive locations were reachable but did not directly expose a comparable previous LoTE instance; an index or additional protocol may be involved.",
    { archiveReferenceCount: archives.length, omittedReferences: omitted, suppliedPriorArtifacts: prior.map(compactObservation), results });
}

function supplyPointFinding(references: ContextReference[], fetched: Array<{ reference: ContextReference; observation: ArtifactObservation }>, enabled: boolean, omitted: number): CheckResult {
  const points = references.filter((entry) => entry.kind === "supply_point");
  if (points.length === 0) return finding("ts119602.context.supply_point", "not_applicable", "info", "Service supply-point content checks are not applicable because no supply points are present.", { supplyPointCount: 0 });
  if (!enabled) return finding("ts119602.context.supply_point", "not_checked", "warning", "Service supply points were not dereferenced because contextual dereferencing is disabled.", { supplyPointCount: points.length });
  const results = fetched.filter((entry) => entry.reference.kind === "supply_point").map(({ reference, observation }) => ({
    location: reference.location,
    fetch: observation.fetch,
    format: observation.format,
    contentType: observation.contentType,
    machineProcessable: Boolean(observation.fetch?.ok && ["json", "xml"].includes(observation.format)),
  }));
  const valid = results.length === points.length && results.every((entry) => entry.machineProcessable);
  const status = omitted > 0 ? "inconclusive" : valid ? "pass" : "fail";
  return finding("ts119602.context.supply_point", status, status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass" ? "Every service supply point returned machine-processable JSON or XML content." : status === "inconclusive" ? "Supply-point content validation is inconclusive because references were omitted by the bound." : "One or more service supply points failed or did not return machine-processable JSON/XML content.",
    { supplyPointCount: points.length, omittedReferences: omitted, results });
}

function uniqueReferences(references: ContextReference[]): ContextReference[] {
  const seen = new Set<string>();
  return references.filter((entry) => {
    const key = `${entry.kind}\u0000${entry.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function omittedCount(references: ContextReference[], kind: ReferenceKind): number {
  return references.filter((entry) => entry.kind === kind).length;
}

function compactObservation(observation: ArtifactObservation) {
  return {
    source: observation.source,
    sha256: observation.sha256,
    bytes: observation.bytes,
    contentType: observation.contentType,
    format: observation.format,
    artifactKind: observation.artifactKind,
    sequenceNumber: observation.sequenceNumber,
    loteType: observation.loteType,
    issueDateTime: observation.issueDateTime,
    signerFingerprintsSha256: observation.signerFingerprintsSha256,
    signatureVerified: observation.signatureVerified,
  };
}

function stringValues(value: unknown): string[] {
  return asArray(value).map(stringValue).filter((entry): entry is string => Boolean(entry));
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function finding(id: string, status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult {
  return { id, category: "profile", status, severity, message, evidence };
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
