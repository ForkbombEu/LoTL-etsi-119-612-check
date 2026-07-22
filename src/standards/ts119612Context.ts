import { certificateFingerprintSha256, sha256Hex } from "../certs.js";
import { detectArtifact } from "../detect.js";
import { fetchArtifact, type FetchResult } from "../fetcher.js";
import type {
  ArtifactKind,
  CheckResult,
  ContextArtifactInput,
  DetectedFormat,
  TrustedListAuditResult,
  TrustListContextOptions,
} from "../types.js";
import { parseXml } from "../xml/parse.js";
import { assessTs119612Xml, type Ts119612XmlAssessment } from "../xml/ts119612Checks.js";
import { inspectTs119612DigitalIdentity } from "../xml/ts119612ServiceSemantics.js";
import { parseTs119602UtcDateTime } from "./ts119602Syntax.js";

const DEFAULT_MAX_DEREFERENCES = 16;
const HARD_MAX_DEREFERENCES = 32;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const HARD_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_TRAVERSAL_DEPTH = 3;
const HARD_MAX_TRAVERSAL_DEPTH = 8;
const HARD_MAX_PRIOR_ARTIFACTS = 32;
const EU_GENERIC = "http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric";
const EU_LIST_OF_LISTS = "http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUlistofthelists";

type TslArtifactKind = Extract<ArtifactKind, "ts119612_xml_tsl" | "ts119612_xml_lotl">;
type ReferenceKind = "pointer" | "distribution";

interface ContextReference {
  kind: ReferenceKind;
  location: string;
  parentSource: string;
  depth: number;
  path: string[];
  pointerCertificateFingerprintsSha256: string[];
  expectedTargetKind?: TslArtifactKind;
  cycle?: boolean;
}

interface ServiceState {
  status?: string;
  start?: string;
}

interface ServiceSnapshot {
  serviceType?: string;
  identityKeys: string[];
  current: ServiceState;
  history: ServiceState[];
}

interface ArtifactObservation {
  source: string;
  fetch?: FetchResult["fetch"];
  bytes?: Buffer;
  sha256: string;
  byteLength: number;
  contentType?: string;
  format: DetectedFormat;
  artifactKind: ArtifactKind;
  sequenceNumber?: number;
  tslType?: string;
  schemeTerritory?: string;
  issueDateTime?: string;
  signerFingerprintsSha256: string[];
  signatureVerified: boolean;
  currentAtAssessment: boolean;
  services: ServiceSnapshot[];
}

interface TraversalResult {
  observations: Array<{ reference: ContextReference; observation?: ArtifactObservation; omittedReason?: "dereference_bound" | "depth_bound" }>;
  fetchedLocationCount: number;
  discoveredPointerCount: number;
  cycleCount: number;
  omittedByDereferenceBound: number;
  omittedByDepthBound: number;
}

export interface Ts119612ContextAssessmentInput {
  currentBytes: Buffer;
  currentContentType?: string;
  currentResult: TrustedListAuditResult;
  timeoutMs: number;
  options: TrustListContextOptions;
}

export interface Ts119612ContextDependencies {
  fetcher?: typeof fetchArtifact;
  assessor?: (xml: string) => Promise<Ts119612XmlAssessment>;
}

/** Assess supplied prior instances and opt-in bounded TS 119 612 references. */
export async function assessTs119612Context(
  input: Ts119612ContextAssessmentInput,
  dependencies: Ts119612ContextDependencies = {},
): Promise<CheckResult[]> {
  const limits = normalizedLimits(input.options);
  const assessor = dependencies.assessor ?? ((xml: string) => assessTs119612Xml(xml, { strict: false }));
  const current = observationFromResult(input.currentBytes, input.currentContentType, input.currentResult);
  const rootReferences = extractReferences(input.currentBytes, input.currentResult.source, 0, []);
  const selectedPrior = (input.options.priorArtifacts ?? []).slice(0, HARD_MAX_PRIOR_ARTIFACTS);
  const prior = await Promise.all(selectedPrior.map((artifact, index) => inspectSuppliedArtifact(
    artifact, index, limits.maxBytesPerArtifact, assessor,
  )));
  const omittedPrior = Math.max(0, (input.options.priorArtifacts?.length ?? 0) - selectedPrior.length);
  const traversal = input.options.dereference
    ? await traverseReferences(rootReferences, input.timeoutMs, limits, dependencies.fetcher ?? fetchArtifact, assessor)
    : emptyTraversal(rootReferences);

  return [
    sequenceFinding(current, prior, omittedPrior),
    historyFinding(current, prior, omittedPrior),
    pointerAuthenticationFinding(rootReferences, traversal, Boolean(input.options.dereference)),
    distributionFinding(current, rootReferences, traversal, Boolean(input.options.dereference)),
    traversalFinding(rootReferences, traversal, Boolean(input.options.dereference), limits, prior.length, omittedPrior),
  ];
}

function normalizedLimits(options: TrustListContextOptions) {
  return {
    maxDereferences: Math.min(HARD_MAX_DEREFERENCES, positiveInteger(options.maxDereferences, DEFAULT_MAX_DEREFERENCES)),
    maxBytesPerArtifact: Math.min(HARD_MAX_BYTES, positiveInteger(options.maxBytesPerArtifact, DEFAULT_MAX_BYTES)),
    concurrency: Math.min(HARD_MAX_DEREFERENCES, positiveInteger(options.concurrency, DEFAULT_CONCURRENCY)),
    maxTraversalDepth: Math.min(HARD_MAX_TRAVERSAL_DEPTH, positiveInteger(options.maxTraversalDepth, DEFAULT_MAX_TRAVERSAL_DEPTH)),
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

async function inspectSuppliedArtifact(
  artifact: ContextArtifactInput,
  index: number,
  maxBytes: number,
  assessor: NonNullable<Ts119612ContextDependencies["assessor"]>,
): Promise<ArtifactObservation> {
  const bytes = Buffer.from(artifact.content, "utf8");
  const source = artifact.source ?? `prior-artifact-${index + 1}`;
  if (bytes.length > maxBytes) return failedObservation(source, artifact.contentType, `Supplied prior artifact exceeds the ${maxBytes}-byte limit.`);
  return inspectArtifact(bytes, artifact.contentType, source, assessor);
}

async function inspectArtifact(
  bytes: Buffer,
  contentType: string | undefined,
  source: string,
  assessor: NonNullable<Ts119612ContextDependencies["assessor"]>,
  fetch?: FetchResult["fetch"],
): Promise<ArtifactObservation> {
  const detected = detectArtifact(bytes, contentType);
  if (detected.artifactKind !== "ts119612_xml_tsl" && detected.artifactKind !== "ts119612_xml_lotl") {
    return {
      source, fetch, bytes, sha256: sha256Hex(bytes), byteLength: bytes.length, contentType,
      format: detected.format, artifactKind: detected.artifactKind, signerFingerprintsSha256: [],
      signatureVerified: false, currentAtAssessment: false, services: [],
    };
  }
  const assessment = await assessor(bytes.toString("utf8"));
  return observationFromAssessment(bytes, contentType, source, detected.format, detected.artifactKind, assessment, fetch);
}

function observationFromResult(
  bytes: Buffer,
  contentType: string | undefined,
  result: TrustedListAuditResult,
): ArtifactObservation {
  return observationFromAssessment(bytes, contentType, result.source, result.detected.format,
    result.detected.artifactKind, result, result.fetch);
}

function observationFromAssessment(
  bytes: Buffer,
  contentType: string | undefined,
  source: string,
  format: DetectedFormat,
  artifactKind: ArtifactKind,
  assessment: Pick<TrustedListAuditResult, "ts119612" | "extracted"> | Ts119612XmlAssessment,
  fetch?: FetchResult["fetch"],
): ArtifactObservation {
  const parsed = parseXml(bytes.toString("utf8")).document;
  return {
    source,
    fetch,
    bytes,
    sha256: sha256Hex(bytes),
    byteLength: bytes.length,
    contentType,
    format,
    artifactKind,
    sequenceNumber: numberValue(assessment.extracted?.tslSequenceNumber),
    tslType: assessment.extracted?.tslType,
    schemeTerritory: assessment.extracted?.schemeTerritory,
    issueDateTime: assessment.extracted?.listIssueDateTime,
    signerFingerprintsSha256: (assessment.extracted?.certificates ?? [])
      .filter((certificate) => certificate.source === "xml_signature")
      .map((certificate) => certificate.fingerprintSha256)
      .filter(isString),
    signatureVerified: assessment.ts119612.checks.some((entry) => (
      entry.id === "signature.cryptographic_verification_result" && entry.status === "pass"
    )),
    currentAtAssessment: assessment.ts119612.checks.some((entry) => (
      (entry.id === "dates.next_update_expired" && entry.status === "pass")
      || (entry.id === "ts119612.scheme.next_update" && entry.status === "pass"
        && typeof entry.evidence === "object" && entry.evidence !== null
        && "closed" in entry.evidence && entry.evidence.closed === true)
    )),
    services: parsed ? extractServices(parsed) : [],
  };
}

function failedObservation(source: string, contentType: string | undefined, error: string, fetch?: FetchResult["fetch"]): ArtifactObservation {
  return {
    source,
    fetch: fetch ?? { attempted: false, ok: false, contentType, bytes: 0, error },
    sha256: "",
    byteLength: 0,
    contentType,
    format: "unknown",
    artifactKind: "unknown",
    signerFingerprintsSha256: [],
    signatureVerified: false,
    currentAtAssessment: false,
    services: [],
  };
}

function extractReferences(bytes: Buffer, parentSource: string, depth: number, path: string[]): ContextReference[] {
  const document = parseXml(bytes.toString("utf8")).document;
  if (!document) return [];
  const root = document.documentElement;
  const pointers = descendants(root, "OtherTSLPointer").flatMap((pointer) => {
    const location = value(child(pointer, "TSLLocation"));
    if (!location) return [];
    const certificates = descendants(child(pointer, "ServiceDigitalIdentities"), "X509Certificate")
      .map(value).filter(isString).map(certificateFingerprintSha256).filter(isString);
    const type = descendants(child(pointer, "AdditionalInformation"), "TSLType").map(value).find(isString);
    return [{
      kind: "pointer" as const,
      location,
      parentSource,
      depth: depth + 1,
      path,
      pointerCertificateFingerprintsSha256: certificates,
      expectedTargetKind: type === EU_GENERIC ? "ts119612_xml_tsl" as const
        : type === EU_LIST_OF_LISTS ? "ts119612_xml_lotl" as const : undefined,
    }];
  });
  const scheme = child(root, "SchemeInformation");
  const distribution = descendants(child(scheme, "DistributionPoints"), "URI").map(value).filter(isString).map((location) => ({
    kind: "distribution" as const,
    location,
    parentSource,
    depth,
    path,
    pointerCertificateFingerprintsSha256: [],
  }));
  return [...pointers, ...distribution];
}

async function traverseReferences(
  initial: ContextReference[],
  timeoutMs: number,
  limits: ReturnType<typeof normalizedLimits>,
  fetcher: typeof fetchArtifact,
  assessor: NonNullable<Ts119612ContextDependencies["assessor"]>,
): Promise<TraversalResult> {
  const observations: TraversalResult["observations"] = [];
  const cache = new Map<string, ArtifactObservation>();
  const expanded = new Set<string>();
  let frontier = uniqueEdges(initial);
  let fetchedLocationCount = 0;
  let discoveredPointerCount = initial.filter((entry) => entry.kind === "pointer").length;
  let cycleCount = 0;
  let omittedByDereferenceBound = 0;
  let omittedByDepthBound = 0;

  while (frontier.length > 0) {
    const byLocation = new Map<string, ContextReference[]>();
    frontier.forEach((reference) => byLocation.set(reference.location, [...(byLocation.get(reference.location) ?? []), reference]));
    frontier = [];
    const locationsToFetch: string[] = [];
    for (const location of byLocation.keys()) {
      if (cache.has(location)) continue;
      if (fetchedLocationCount + locationsToFetch.length >= limits.maxDereferences) {
        const omitted = byLocation.get(location) ?? [];
        omitted.forEach((reference) => observations.push({ reference, omittedReason: "dereference_bound" }));
        omittedByDereferenceBound += omitted.length;
      } else {
        locationsToFetch.push(location);
      }
    }
    const fetched = await mapConcurrent(locationsToFetch, limits.concurrency, async (location) => {
      const result = await fetcher(location, timeoutMs, { maxBytes: limits.maxBytesPerArtifact });
      const observation = result.bytes
        ? await inspectArtifact(result.bytes, result.fetch.contentType, location, assessor, result.fetch)
        : failedObservation(location, result.fetch.contentType, result.fetch.error ?? "Fetch failed.", result.fetch);
      return { location, observation };
    });
    fetchedLocationCount += fetched.length;
    fetched.forEach(({ location, observation }) => cache.set(location, observation));

    for (const [location, references] of byLocation) {
      const observation = cache.get(location);
      if (!observation) continue;
      references.forEach((reference) => observations.push({ reference, observation }));
      const pointerReferences = references.filter((reference) => reference.kind === "pointer");
      const authenticatedParent = pointerReferences.some((reference) => pointerAuthenticated(reference, observation));
      if (!authenticatedParent || !observation.bytes || expanded.has(location)) continue;
      expanded.add(location);
      const parentReference = pointerReferences[0];
      const nextPath = [...parentReference.path, location];
      const children = extractReferences(observation.bytes, location, parentReference.depth, nextPath)
        .filter((reference) => reference.kind === "pointer");
      discoveredPointerCount += children.length;
      for (const childReference of children) {
        if (nextPath.includes(childReference.location)) {
          cycleCount += 1;
          const cycleReference = { ...childReference, cycle: true };
          const priorObservation = cache.get(childReference.location);
          observations.push(priorObservation
            ? { reference: cycleReference, observation: priorObservation }
            : { reference: cycleReference, omittedReason: "depth_bound" });
          if (!priorObservation) omittedByDepthBound += 1;
        } else if (childReference.depth > limits.maxTraversalDepth) {
          observations.push({ reference: childReference, omittedReason: "depth_bound" });
          omittedByDepthBound += 1;
        } else {
          frontier.push(childReference);
        }
      }
    }
  }
  return { observations, fetchedLocationCount, discoveredPointerCount, cycleCount, omittedByDereferenceBound, omittedByDepthBound };
}

function emptyTraversal(references: ContextReference[]): TraversalResult {
  return {
    observations: [],
    fetchedLocationCount: 0,
    discoveredPointerCount: references.filter((entry) => entry.kind === "pointer").length,
    cycleCount: 0,
    omittedByDereferenceBound: 0,
    omittedByDepthBound: 0,
  };
}

function sequenceFinding(current: ArtifactObservation, prior: ArtifactObservation[], omittedPrior: number): CheckResult {
  if (prior.length === 0) return finding("ts119612.scheme.sequence.history", "not_checked", "warning",
    "No prior TL artifact was supplied, so sequence progression cannot be established.",
    { current: compactObservation(current), suppliedPriorCount: 0, omittedPriorArtifacts: omittedPrior });
  const comparable = prior.filter((entry) => entry.tslType === current.tslType && entry.schemeTerritory === current.schemeTerritory
    && (entry.artifactKind === "ts119612_xml_tsl" || entry.artifactKind === "ts119612_xml_lotl"));
  const currentIssue = parseTs119602UtcDateTime(current.issueDateTime)?.getTime();
  const results = comparable.map((entry) => ({
    ...compactObservation(entry),
    sequenceIncreases: current.sequenceNumber !== undefined && entry.sequenceNumber !== undefined
      && current.sequenceNumber > entry.sequenceNumber,
    issueTimeIncreases: Boolean(currentIssue && parseTs119602UtcDateTime(entry.issueDateTime)
      && currentIssue > parseTs119602UtcDateTime(entry.issueDateTime)!.getTime()),
  }));
  const valid = results.length > 0 && results.every((entry) => entry.sequenceIncreases && entry.issueTimeIncreases);
  const status = omittedPrior > 0 || comparable.length !== prior.length ? "inconclusive" : valid ? "pass" : "fail";
  return finding("ts119612.scheme.sequence.history", status,
    status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass"
      ? "The current TL sequence and issue time increase across every supplied comparable prior instance."
      : status === "fail"
        ? "Supplied comparable prior instances show a recycled/non-increasing sequence or issue time."
        : "One or more supplied prior artifacts are omitted or not comparable to the current TL.",
    { current: compactObservation(current), suppliedPriorCount: prior.length, comparablePriorCount: comparable.length, omittedPriorArtifacts: omittedPrior, results });
}

function historyFinding(current: ArtifactObservation, prior: ArtifactObservation[], omittedPrior: number): CheckResult {
  if (current.services.length === 0) return finding("ts119612.context.history_retention", "not_applicable", "info",
    "Service-history retention comparison is not applicable because the current artifact has no services.", { currentServiceCount: 0 });
  if (prior.length === 0) return finding("ts119612.context.history_retention", "not_checked", "warning",
    "No prior TL artifact was supplied, so service-history retention cannot be established from one instance.",
    { currentServiceCount: current.services.length, suppliedPriorCount: 0, omittedPriorArtifacts: omittedPrior });
  const comparable = prior.filter((entry) => entry.tslType === current.tslType && entry.schemeTerritory === current.schemeTerritory
    && entry.services.length > 0);
  const comparisons = comparable.flatMap((entry) => entry.services.map((priorService) => compareServiceHistory(priorService, current.services, entry.source)));
  const valid = comparisons.length > 0 && comparisons.every((entry) => entry.serviceRetained && entry.statesRetained);
  const status = omittedPrior > 0 || comparable.length !== prior.length ? "inconclusive" : valid ? "pass" : "fail";
  return finding("ts119612.context.history_retention", status,
    status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass"
      ? "Every service and status state from supplied comparable prior TLs remains represented in the current TL."
      : status === "fail"
        ? "The current TL omits a service or status state present in supplied comparable prior evidence."
        : "Service-history retention is inconclusive because prior evidence is omitted or not comparable.",
    { currentServiceCount: current.services.length, suppliedPriorCount: prior.length, comparablePriorCount: comparable.length, omittedPriorArtifacts: omittedPrior, comparisons });
}

function compareServiceHistory(prior: ServiceSnapshot, current: ServiceSnapshot[], priorSource: string) {
  const match = current.find((candidate) => candidate.serviceType === prior.serviceType
    && candidate.identityKeys.some((key) => prior.identityKeys.includes(key)));
  const priorStates = [prior.current, ...prior.history].map(stateKey);
  const currentStates = match ? [match.current, ...match.history].map(stateKey) : [];
  return {
    priorSource,
    serviceType: prior.serviceType ?? null,
    identityKeys: prior.identityKeys,
    serviceRetained: Boolean(match),
    statesRetained: Boolean(match) && priorStates.every((state) => currentStates.includes(state)),
    missingStates: priorStates.filter((state) => !currentStates.includes(state)),
  };
}

function pointerAuthenticationFinding(references: ContextReference[], traversal: TraversalResult, enabled: boolean): CheckResult {
  const pointers = references.filter((entry) => entry.kind === "pointer");
  if (pointers.length === 0) return finding("ts119612.scheme.pointers.authentication", "not_applicable", "info",
    "Pointer authentication is not applicable because no pointers are present.", { pointerCount: 0 });
  if (!enabled) return finding("ts119612.scheme.pointers.authentication", "not_checked", "warning",
    "Pointer targets were not dereferenced because contextual dereferencing is disabled.", { pointerCount: pointers.length });
  const results = traversal.observations.filter((entry) => entry.reference.kind === "pointer").map(pointerResult);
  const omitted = results.some((entry) => entry.omittedReason);
  const valid = results.length > 0 && results.every((entry) => entry.authenticated);
  const status = omitted ? "inconclusive" : valid ? "pass" : "fail";
  return finding("ts119612.scheme.pointers.authentication", status,
    status === "pass" ? "info" : status === "fail" ? "critical" : "warning",
    status === "pass"
      ? "Every traversed pointed list has a verified, current signature whose signing-certificate digest matches a declared pointer certificate."
      : status === "fail"
        ? "One or more pointed lists could not be authenticated by a declared pointer certificate identity."
        : "Pointer authentication is inconclusive because a configured traversal bound omitted one or more pointer targets.",
    { rootPointerCount: pointers.length, discoveredPointerCount: traversal.discoveredPointerCount, results });
}

function pointerResult(entry: TraversalResult["observations"][number]) {
  const observation = entry.observation;
  const declared = entry.reference.pointerCertificateFingerprintsSha256.map((fingerprint) => fingerprint.toLowerCase());
  const signerMatch = Boolean(observation?.signerFingerprintsSha256.some((fingerprint) => declared.includes(fingerprint.toLowerCase())));
  const targetKindMatches = Boolean(observation && (!entry.reference.expectedTargetKind
    || observation.artifactKind === entry.reference.expectedTargetKind));
  return {
    parentSource: entry.reference.parentSource,
    location: entry.reference.location,
    depth: entry.reference.depth,
    cycle: Boolean(entry.reference.cycle),
    omittedReason: entry.omittedReason,
    fetch: observation?.fetch,
    target: observation ? compactObservation(observation) : undefined,
    declaredCertificateFingerprintsSha256: declared,
    signerMatch,
    targetKindMatches,
    authenticated: Boolean(observation && pointerAuthenticated(entry.reference, observation)),
  };
}

function pointerAuthenticated(reference: ContextReference, observation: ArtifactObservation): boolean {
  const declared = reference.pointerCertificateFingerprintsSha256.map((fingerprint) => fingerprint.toLowerCase());
  const signerMatch = observation.signerFingerprintsSha256.some((fingerprint) => declared.includes(fingerprint.toLowerCase()));
  const targetKindMatches = !reference.expectedTargetKind || observation.artifactKind === reference.expectedTargetKind;
  return Boolean(observation.fetch?.ok && observation.signatureVerified && observation.currentAtAssessment
    && signerMatch && targetKindMatches);
}

function distributionFinding(current: ArtifactObservation, references: ContextReference[], traversal: TraversalResult, enabled: boolean): CheckResult {
  const points = references.filter((entry) => entry.kind === "distribution");
  if (points.length === 0) return finding("ts119612.scheme.distribution_consistency", "not_applicable", "info",
    "Distribution consistency is not applicable because no distribution points are present.", { distributionPointCount: 0 });
  if (!enabled) return finding("ts119612.scheme.distribution_consistency", "not_checked", "warning",
    "Distribution points were not dereferenced because contextual dereferencing is disabled.", { distributionPointCount: points.length });
  const results = traversal.observations.filter((entry) => entry.reference.kind === "distribution").map((entry) => ({
    location: entry.reference.location,
    omittedReason: entry.omittedReason,
    fetch: entry.observation?.fetch,
    observedSha256: entry.observation?.sha256,
    expectedSha256: current.sha256,
    identical: Boolean(entry.observation?.fetch?.ok && entry.observation.sha256 === current.sha256),
  }));
  const omitted = results.length !== points.length || results.some((entry) => entry.omittedReason);
  const valid = results.length === points.length && results.every((entry) => entry.identical);
  const status = omitted ? "inconclusive" : valid ? "pass" : "fail";
  return finding("ts119612.scheme.distribution_consistency", status,
    status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass"
      ? "Every distribution point returned bytes identical to the assessed current TL."
      : status === "fail"
        ? "One or more distribution points failed or returned bytes different from the assessed current TL."
        : "Distribution consistency is inconclusive because a configured dereference bound omitted evidence.",
    { distributionPointCount: points.length, results });
}

function traversalFinding(
  references: ContextReference[],
  traversal: TraversalResult,
  enabled: boolean,
  limits: ReturnType<typeof normalizedLimits>,
  suppliedPriorCount: number,
  omittedPriorArtifacts: number,
): CheckResult {
  if (!enabled) return finding("ts119612.context.traversal", "not_checked", "warning",
    "Cross-list traversal was not attempted because contextual dereferencing is disabled.",
    { dereferenceEnabled: false, rootReferenceCount: references.length, suppliedPriorCount, omittedPriorArtifacts, limits });
  const omitted = traversal.omittedByDereferenceBound + traversal.omittedByDepthBound + omittedPriorArtifacts;
  return finding("ts119612.context.traversal", omitted === 0 ? "pass" : "inconclusive",
    omitted === 0 ? "info" : "warning",
    omitted === 0
      ? "Cross-list traversal completed within count, depth, concurrency and byte bounds; cycles were detected without recursive re-fetching."
      : "Cross-list traversal reached a configured bound, so some contextual evidence was not assessed.",
    { dereferenceEnabled: true, rootReferenceCount: references.length, suppliedPriorCount, omittedPriorArtifacts, ...traversal, observations: undefined, limits });
}

function extractServices(document: Document): ServiceSnapshot[] {
  return descendants(document.documentElement, "ServiceInformation").filter((information) => local(information.parentNode as Element) === "TSPService").map((information) => {
    const identity = inspectTs119612DigitalIdentity(child(information, "ServiceDigitalIdentity"), information.namespaceURI ?? undefined);
    const nonPkiIdentifiers = descendants(child(information, "ServiceDigitalIdentity"), "Other").map(value).filter(isString);
    const identityKeys = [...new Set([
      ...identity.keyHashes.map((key) => `key:${key}`),
      ...identity.skis.map((ski) => `ski:${ski}`),
      ...nonPkiIdentifiers.map((identifier) => `other:${identifier}`),
    ])];
    const service = information.parentNode as Element;
    const history = child(service, "ServiceHistory");
    return {
      serviceType: value(child(information, "ServiceTypeIdentifier")),
      identityKeys,
      current: { status: value(child(information, "ServiceStatus")), start: value(child(information, "StatusStartingTime")) },
      history: descendants(history, "ServiceHistoryInstance").map((instance) => ({
        status: value(child(instance, "ServiceStatus")), start: value(child(instance, "StatusStartingTime")),
      })),
    };
  });
}

function compactObservation(observation: ArtifactObservation) {
  return {
    source: observation.source,
    sha256: observation.sha256,
    bytes: observation.byteLength,
    contentType: observation.contentType,
    format: observation.format,
    artifactKind: observation.artifactKind,
    sequenceNumber: observation.sequenceNumber,
    tslType: observation.tslType,
    schemeTerritory: observation.schemeTerritory,
    issueDateTime: observation.issueDateTime,
    signerFingerprintsSha256: observation.signerFingerprintsSha256,
    signatureVerified: observation.signatureVerified,
    currentAtAssessment: observation.currentAtAssessment,
    serviceCount: observation.services.length,
  };
}

function uniqueEdges(references: ContextReference[]): ContextReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}\0${reference.parentSource}\0${reference.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stateKey(state: ServiceState): string { return `${state.status ?? ""}\0${state.start ?? ""}`; }
function numberValue(value: unknown): number | undefined { const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : undefined; }
function descendants(parent: Node | undefined, name: string): Element[] { return parent ? Array.from((parent as Element).getElementsByTagNameNS("*", name)) : []; }
function directChildren(parent: Node | undefined): Element[] { return parent ? Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1) : []; }
function child(parent: Element | undefined, name: string): Element | undefined { return directChildren(parent).find((element) => local(element) === name && element.namespaceURI === parent?.namespaceURI); }
function local(element: Element): string { return element.localName || element.nodeName.split(":").at(-1) as string; }
function value(element: Element | undefined): string | undefined { const result = element?.textContent?.trim(); return result || undefined; }
function isString(value: string | undefined): value is string { return Boolean(value); }
function finding(id: string, status: CheckResult["status"], severity: CheckResult["severity"], message: string, evidence?: unknown): CheckResult { return { id, category: "profile", status, severity, message, evidence }; }

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
