import { X509Certificate } from "node:crypto";
import { normalizeBase64Certificate, sha256Hex } from "../certs.js";
import { detectArtifact } from "../detect.js";
import { fetchArtifact, type FetchResult } from "../fetcher.js";
import { asArray, firstString, getPath, parseLotlJson, stringValue } from "../lotl.js";
import type {
  ArtifactKind,
  CheckResult,
  ContextArtifactInput,
  DetectedFormat,
  Ts119602AuthoritativeIdentityEvidence,
  TrustedListAuditResult,
  Ts119602ContextOptions,
  Ts119602ResourceAssertion,
  TrustListPointerSignerEvidence,
} from "../types.js";
import { assessJsonLote } from "../json/loteChecks.js";
import { assessCompactJades, parseCompactJades } from "../json/jades.js";
import { assessXmlLoteMetadata } from "../xml/loteMetadata.js";
import { parseXml } from "../xml/parse.js";
import { nodes, text, texts } from "../xml/xpath.js";
import { parseTs119602UtcDateTime } from "./ts119602Syntax.js";
import {
  inspectTs119602Identity,
  matchTs119602IdentityMaterial,
  xmlRsaKeyValue,
  type Ts119602IdentityMaterial,
} from "./ts119602Identity.js";
import type { Ts119602IdentityObservation } from "./ts119602Entities.js";
import {
  extractTs119602ContextFacts,
  type Ts119602ContextFacts,
  type Ts119602ContextParty,
  type Ts119602ContextService,
} from "./ts119602ContextFacts.js";

const DEFAULT_MAX_DEREFERENCES = 16;
const HARD_MAX_DEREFERENCES = 32;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const HARD_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const HARD_MAX_PRIOR_ARTIFACTS = 32;
const SCHEME_INFORMATION_ASSERTIONS = Object.freeze([
  "scheme_scope_and_context",
  "approval_scheme",
  "operator_approval_process",
  "entity_approval_process",
  "approval_criteria",
  "assessor_selection_and_rules",
  "separate_body_responsibilities_and_liabilities",
  "scheme_contact_information",
] as const satisfies readonly Ts119602ResourceAssertion[]);
const SCHEME_RULE_ASSERTIONS = Object.freeze([
  "scheme_policy_and_rules",
  "list_usage_and_interpretation",
] as const satisfies readonly Ts119602ResourceAssertion[]);
const POLICY_ASSERTIONS = Object.freeze([
  "policy_or_legal_notice",
] as const satisfies readonly Ts119602ResourceAssertion[]);

type ReferenceKind = "pointer" | "distribution" | "archive" | "supply_point" | "resource";
type ResourceKind = "scheme_information" | "scheme_rules" | "policy_or_legal_notice";

interface ContextReference {
  kind: ReferenceKind;
  location: string;
  pointerIdentity?: Ts119602IdentityMaterial;
  pointerIdentityDiagnostics?: string[];
  pointerIdentityCount?: number;
  serviceIdentity?: Ts119602IdentityMaterial;
  servicePath?: string;
  resourceKind?: ResourceKind;
  requiredAssertions?: readonly Ts119602ResourceAssertion[];
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
  signerIdentity: Ts119602IdentityMaterial;
  signerCertificates: string[];
  signatureVerified: boolean;
  facts: Ts119602ContextFacts;
  body?: Buffer;
}

interface ArchiveTraversalObservation {
  rootLocation: string;
  parentLocation: string;
  location: string;
  depth: number;
  observation: ArtifactObservation;
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
  const references = extractReferences(input.currentBytes, input.currentContentType, input.options);
  const suppliedPrior = input.options.priorArtifacts ?? [];
  const selectedPrior = suppliedPrior.slice(0, HARD_MAX_PRIOR_ARTIFACTS);
  const prior = await Promise.all(selectedPrior.map((artifact, index) => inspectSuppliedArtifact(artifact, index, limits.maxBytesPerArtifact)));
  const omittedPrior = Math.max(0, suppliedPrior.length - selectedPrior.length);
  const unique = uniqueReferences(references);
  const selectedReferences = unique.slice(0, limits.maxDereferences);
  const omittedReferences = unique.slice(limits.maxDereferences);
  const omitted = omittedReferences.length;
  const fetchCache = new Map<string, Promise<FetchResult>>();
  const dereferenced = input.options.dereference
    ? await fetchReferences(selectedReferences, input.timeoutMs, limits, fetchCache)
    : [];
  const archiveTraversal = input.options.dereference
    ? await traverseArchiveIndexes(
      dereferenced.filter((entry) => entry.reference.kind === "archive"),
      input.timeoutMs,
      limits,
      fetchCache,
      Math.max(0, limits.maxDereferences - new Set(selectedReferences.map((entry) => entry.location)).size),
    )
    : { observations: [], omitted: 0 };

  return [
    sequenceFinding(current, prior),
    pointerFinding(current, references, dereferenced, Boolean(input.options.dereference), omittedCount(omittedReferences, "pointer"), input.options),
    distributionFinding(current, references, dereferenced, Boolean(input.options.dereference), omittedCount(omittedReferences, "distribution")),
    archiveFinding(current, references, prior, dereferenced, archiveTraversal.observations, Boolean(input.options.dereference), omittedCount(omittedReferences, "archive") + archiveTraversal.omitted),
    supplyPointFinding(references, dereferenced, Boolean(input.options.dereference), omittedCount(omittedReferences, "supply_point")),
    registerAuthenticationFinding(current, references, dereferenced, Boolean(input.options.dereference), omittedCount(omittedReferences, "supply_point")),
    resourceSemanticsFinding(references, dereferenced, Boolean(input.options.dereference), omittedCount(omittedReferences, "resource"), input.options),
    authoritativeIdentityFinding(current, input.options),
    historyRetentionFinding(current, prior),
    finalClosedLoteFinding(current, input.options),
    finding(
      "ts119602.context.bounds",
      omitted === 0 && omittedPrior === 0 && archiveTraversal.omitted === 0 ? "pass" : "inconclusive",
      omitted === 0 && omittedPrior === 0 && archiveTraversal.omitted === 0 ? "info" : "warning",
      omitted === 0 && omittedPrior === 0 && archiveTraversal.omitted === 0
        ? "Contextual evidence collection stayed within the configured dereference limits."
        : "Some contextual references were not dereferenced because the configured limit was reached.",
      {
        dereferenceEnabled: Boolean(input.options.dereference),
        discoveredReferences: unique.length,
        selectedReferences: selectedReferences.length,
        omittedReferences: omitted,
        omittedArchiveTraversalReferences: archiveTraversal.omitted,
        archiveTraversalReferences: archiveTraversal.observations.length,
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
    maxTraversalDepth: Math.min(8, positiveInteger(options.maxTraversalDepth, 3)),
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function extractReferences(bytes: Buffer, contentType: string | undefined, options: Ts119602ContextOptions): ContextReference[] {
  const detected = detectArtifact(bytes, contentType);
  if ((detected.artifactKind === "json_lote" || detected.artifactKind === "json_lotl") && detected.parsedJson) {
    return extractJsonReferences(detected.parsedJson, options);
  }
  if (detected.artifactKind === "xml_lote") return extractXmlReferences(bytes.toString("utf8"), options);
  return [];
}

function extractJsonReferences(parsed: unknown, options: Ts119602ContextOptions): ContextReference[] {
  const info = getPath(parsed, ["LoTE", "ListAndSchemeInformation"]);
  const lotl = parseLotlJson(JSON.stringify(parsed));
  const pointers = lotl.pointers.map((pointer) => ({
    kind: "pointer" as const,
    location: pointer.location,
    ...inspectTs119602JsonPointerIdentity(pointer.raw),
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
  const supplyPoints = entities.flatMap((entity, entityIndex) => asArray(getPath(entity, ["TrustedEntityServices"]))
    .flatMap((service, serviceIndex) => {
      const servicePath = `/LoTE/TrustedEntitiesList/${entityIndex}/TrustedEntityServices/${serviceIndex}`;
      const identity = inspectJsonServiceIdentity(getPath(service, ["ServiceInformation", "ServiceDigitalIdentity"]), `${servicePath}/ServiceInformation/ServiceDigitalIdentity`);
      return stringValues(getPath(service, ["ServiceInformation", "ServiceSupplyPoints"]))
        .map((location) => ({ kind: "supply_point" as const, location, serviceIdentity: identity, servicePath }));
    }));
  const resources = options.ts119602?.resources?.length ? [
    ...informationUris.slice(0, 1).map((location) => resourceReference(location, "scheme_information", SCHEME_INFORMATION_ASSERTIONS)),
    ...stringValues(getPath(info, ["SchemeTypeCommunityRules"])).map((location) => resourceReference(location, "scheme_rules", SCHEME_RULE_ASSERTIONS)),
    ...valuesForKey(getPath(info, ["PolicyOrLegalNotice"]), "LoTEPolicy").map((location) => resourceReference(location, "policy_or_legal_notice", POLICY_ASSERTIONS)),
  ] : [];
  return [...pointers, ...distribution, ...archives, ...supplyPoints, ...resources];
}

function extractXmlReferences(xml: string, options: Ts119602ContextOptions): ContextReference[] {
  const parsed = parseXml(xml);
  const root = parsed.document?.documentElement;
  if (!root) return [];
  const pointers = nodes(root, ".//*[local-name()='PointersToOtherLoTE']/*").flatMap((pointer) => {
    const location = text(pointer, ".//*[local-name()='LoTELocation']");
    if (!location) return [];
    const identities = nodes(pointer, ".//*[local-name()='ServiceDigitalIdentity']");
    const inspected = identities.map((identity, index) => inspectTs119602Identity(xmlIdentity(identity, `/pointer/identity/${index}`)));
    return [{
      kind: "pointer" as const,
      location,
      pointerIdentity: mergeIdentityMaterial(inspected),
      pointerIdentityDiagnostics: inspected.flatMap((entry) => entry.diagnostics),
      pointerIdentityCount: identities.length,
    }];
  });
  const distribution = texts(root, ".//*[local-name()='DistributionPoints']//*[local-name()='URI']")
    .map((location) => ({ kind: "distribution" as const, location }));
  const loteType = text(root, ".//*[local-name()='ListAndSchemeInformation']/*[local-name()='LoTEType']");
  const informationUris = texts(root, ".//*[local-name()='ListAndSchemeInformation']/*[local-name()='SchemeInformationURI']//*[local-name()='URI']");
  const archives = loteType?.includes("PubEAAProvidersList") ? [] : informationUris.slice(1).map((location) => ({ kind: "archive" as const, location }));
  const supplyPoints = nodes(root, ".//*[local-name()='TrustedEntityService']").flatMap((service) => {
    const identity = nodes(service, "./*[local-name()='ServiceInformation']/*[local-name()='ServiceDigitalIdentity']")[0];
    const servicePath = xmlNodePath(service);
    return texts(service, "./*[local-name()='ServiceInformation']/*[local-name()='ServiceSupplyPoints']//*[local-name()='URI' or local-name()='ServiceSupplyPoint']")
      .map((location) => ({ kind: "supply_point" as const, location, serviceIdentity: inspectTs119602Identity(xmlIdentity(identity, `${servicePath}/ServiceInformation/ServiceDigitalIdentity`)), servicePath }));
  });
  const resources = options.ts119602?.resources?.length ? [
    ...informationUris.slice(0, 1).map((location) => resourceReference(location, "scheme_information", SCHEME_INFORMATION_ASSERTIONS)),
    ...texts(root, ".//*[local-name()='ListAndSchemeInformation']/*[local-name()='SchemeTypeCommunityRules']//*[local-name()='URI']")
      .map((location) => resourceReference(location, "scheme_rules", SCHEME_RULE_ASSERTIONS)),
    ...texts(root, ".//*[local-name()='ListAndSchemeInformation']/*[local-name()='PolicyOrLegalNotice']/*[local-name()='LoTEPolicy']//*[local-name()='URI']")
      .map((location) => resourceReference(location, "policy_or_legal_notice", POLICY_ASSERTIONS)),
  ] : [];
  return [...pointers, ...distribution, ...archives, ...supplyPoints, ...resources];
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
  fetchedByLocation = new Map<string, Promise<FetchResult>>(),
): Promise<Array<{ reference: ContextReference; observation: ArtifactObservation }>> {
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

async function traverseArchiveIndexes(
  roots: Array<{ reference: ContextReference; observation: ArtifactObservation }>,
  timeoutMs: number,
  limits: ReturnType<typeof normalizedLimits>,
  fetchedByLocation: Map<string, Promise<FetchResult>>,
  budget: number,
): Promise<{ observations: ArchiveTraversalObservation[]; omitted: number }> {
  const observations: ArchiveTraversalObservation[] = [];
  const seen = new Set(fetchedByLocation.keys());
  const queue = roots.flatMap(({ reference, observation }) => observation.fetch?.ok && observation.body
    ? [{ rootLocation: reference.location, parentLocation: reference.location, observation, depth: 0 }]
    : []);
  let omitted = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= limits.maxTraversalDepth || !current.observation.body) continue;
    const links = discoverArchiveLinks(current.observation.body, current.observation.contentType, current.parentLocation)
      .filter((location) => sameOrigin(location, current.rootLocation) && !seen.has(location));
    for (const location of links) {
      seen.add(location);
      if (observations.length >= budget) {
        omitted += 1;
        continue;
      }
      let pending = fetchedByLocation.get(location);
      if (!pending) {
        pending = fetchArtifact(location, timeoutMs, { maxBytes: limits.maxBytesPerArtifact });
        fetchedByLocation.set(location, pending);
      }
      const fetched = await pending;
      const observation = fetched.bytes
        ? await inspectArtifact(fetched.bytes, fetched.fetch.contentType, location, fetched.fetch)
        : failedObservation(location, fetched.fetch);
      const entry = { rootLocation: current.rootLocation, parentLocation: current.parentLocation, location, depth: current.depth + 1, observation };
      observations.push(entry);
      if (observation.fetch?.ok && observation.body && !isComparableLoteObservation(observation)) queue.push({
        rootLocation: current.rootLocation,
        parentLocation: location,
        observation,
        depth: current.depth + 1,
      });
    }
  }
  return { observations, omitted };
}

function discoverArchiveLinks(bytes: Buffer, contentType: string | undefined, base: string): string[] {
  const detected = detectArtifact(bytes, contentType);
  const candidates: string[] = [];
  if ((detected.format === "json" || detected.format === "jws") && detected.parsedJson) collectArchiveJsonLinks(detected.parsedJson, candidates);
  if (detected.format === "html") {
    const html = bytes.toString("utf8");
    for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/giu)) candidates.push(match[1]);
  }
  return [...new Set(candidates.flatMap((candidate) => {
    try {
      const resolved = new URL(candidate, base);
      resolved.hash = "";
      return [resolved.href];
    } catch {
      return [];
    }
  }))];
}

function collectArchiveJsonLinks(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectArchiveJsonLinks(entry, output));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && /^(?:url|href|location|artifact|artifactUrl|download)$/iu.test(key)) output.push(entry);
    else if (typeof entry === "object" && entry !== null) collectArchiveJsonLinks(entry, output);
  }
}

function sameOrigin(location: string, root: string): boolean {
  try { return new URL(location).origin === new URL(root).origin; } catch { return false; }
}

function isComparableLoteObservation(observation: ArtifactObservation): boolean {
  return observation.artifactKind === "json_lote" || observation.artifactKind === "xml_lote";
}

async function inspectArtifact(bytes: Buffer, contentType: string | undefined, source: string, fetch?: FetchResult["fetch"]): Promise<ArtifactObservation> {
  const detected = detectArtifact(bytes, contentType);
  let assessed: Pick<TrustedListAuditResult, "ts119602" | "extracted"> | undefined;
  let genericJadesVerified: boolean | undefined;
  if (detected.artifactKind === "json_lote" || detected.artifactKind === "json_lotl") {
    assessed = assessJsonLote(detected.parsedJson, true, new Date(), { compactJades: detected.compactJades });
  } else if (detected.artifactKind === "xml_lote") {
    assessed = await assessXmlLoteMetadata(bytes.toString("utf8"));
  } else if (detected.format === "jws" && detected.compactJades) {
    const generic = assessCompactJades(detected.compactJades, detected.parsedJson, { assessmentDate: new Date() });
    genericJadesVerified = generic.checks.some((entry) => entry.id === "json_lote.signature.jades_cryptographic_verification_result" && entry.status === "pass");
  }
  return observationFromAssessment(bytes, contentType, source, detected.format, detected.artifactKind, assessed, fetch, signerCertificates(bytes, detected.format), genericJadesVerified);
}

function observationFromResult(bytes: Buffer, contentType: string | undefined, result: TrustedListAuditResult): ArtifactObservation {
  return observationFromAssessment(bytes, contentType, result.source, result.detected.format, result.detected.artifactKind, result, result.fetch, signerCertificates(bytes, result.detected.format));
}

function observationFromAssessment(
  bytes: Buffer,
  contentType: string | undefined,
  source: string,
  format: DetectedFormat,
  artifactKind: ArtifactKind,
  assessed?: Pick<TrustedListAuditResult, "ts119602" | "extracted">,
  fetch?: FetchResult["fetch"],
  signingCertificates: string[] = [],
  signatureVerifiedOverride?: boolean,
): ArtifactObservation {
  const metadata = assessed?.extracted?.jsonLote;
  const certificates = assessed?.extracted?.certificates ?? [];
  const signatureIds = format === "jws" || format === "json"
    ? ["json_lote.signature.jades_cryptographic_verification_result"]
    : ["signature.cryptographic_verification_result"];
  const signerInspection = inspectTs119602Identity(identityObservation("/signature", { certificates: signingCertificates }));
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
    signerIdentity: signerInspection,
    signerCertificates: signingCertificates,
    signatureVerified: signatureVerifiedOverride ?? Boolean(assessed?.ts119602.checks.some((entry) => signatureIds.includes(entry.id) && entry.status === "pass")),
    facts: extractTs119602ContextFacts(bytes, contentType),
    body: bytes,
  };
}

function failedObservation(source: string, fetch: FetchResult["fetch"]): ArtifactObservation {
  return { source, fetch, sha256: "", bytes: 0, contentType: fetch.contentType, format: "unknown", artifactKind: "unknown", signerFingerprintsSha256: [], signerIdentity: emptyIdentityMaterial(), signerCertificates: [], signatureVerified: false, facts: { nextUpdatePresent: false, nextUpdateNull: false, entities: [] } };
}

function sequenceFinding(current: ArtifactObservation, prior: ArtifactObservation[]): CheckResult {
  if (prior.length === 0) {
    return finding("ts119602.scheme.sequence.history", "not_checked", "warning", "No prior LoTE artifact was supplied, so sequence progression cannot be established.", { current: compactObservation(current), priorCount: 0 });
  }
  const comparable = prior.filter((entry) => entry.sequenceNumber !== undefined && entry.loteType === current.loteType);
  const ordered = [...comparable].sort((left, right) => left.sequenceNumber! - right.sequenceNumber!);
  const currentIssue = parseTs119602UtcDateTime(current.issueDateTime)?.getTime();
  const results = ordered.map((entry, index) => ({
    ...compactObservation(entry),
    expectedSequence: index + 1,
    sequenceExact: entry.sequenceNumber === index + 1,
    issueTimeIncreases: Boolean(parseTs119602UtcDateTime(entry.issueDateTime)
      && (index === 0
        || parseTs119602UtcDateTime(ordered[index - 1].issueDateTime)
          && parseTs119602UtcDateTime(entry.issueDateTime)!.getTime() > parseTs119602UtcDateTime(ordered[index - 1].issueDateTime)!.getTime())),
  }));
  const complete = current.sequenceNumber !== undefined
    && current.sequenceNumber > 1
    && ordered.length === current.sequenceNumber - 1
    && results.every((entry) => entry.sequenceExact);
  const currentFollows = Boolean(currentIssue && ordered.length > 0 && parseTs119602UtcDateTime(ordered.at(-1)?.issueDateTime)
    && currentIssue > parseTs119602UtcDateTime(ordered.at(-1)?.issueDateTime)!.getTime());
  const invalid = results.some((entry) => !entry.sequenceExact || !entry.issueTimeIncreases) || complete && !currentFollows;
  const status = invalid ? "fail" : comparable.length !== prior.length || !complete ? "inconclusive" : "pass";
  return finding(
    "ts119602.scheme.sequence.history",
    status,
    status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass" ? "The supplied instances form the complete sequence from 1 through the current LoTE with strictly increasing issue times." : status === "inconclusive" ? "The supplied prior evidence does not contain a complete same-type sequence from the first release through the current LoTE." : "Supplied prior instances contain a sequence gap, duplicate/reset, or non-increasing issue time.",
    { current: compactObservation(current), suppliedPriorCount: prior.length, comparablePriorCount: comparable.length, completeSequence: complete, currentIssueTimeIncreases: currentFollows, results },
  );
}

function pointerFinding(
  current: ArtifactObservation,
  references: ContextReference[],
  fetched: Array<{ reference: ContextReference; observation: ArtifactObservation }>,
  enabled: boolean,
  omitted: number,
  options: Ts119602ContextOptions,
): CheckResult {
  const pointers = references.filter((entry) => entry.kind === "pointer");
  if (pointers.length === 0) return finding("ts119602.scheme.pointers.authentication", "not_applicable", "info", "Pointer authentication is not applicable because no pointers are present.", { pointerCount: 0 });
  if (!enabled) return finding("ts119602.scheme.pointers.authentication", "not_checked", "warning", "Pointer targets were not dereferenced because contextual dereferencing is disabled.", { pointerCount: pointers.length });
  const results = fetched.filter((entry) => entry.reference.kind === "pointer").map(({ reference, observation }) => {
    const declared = reference.pointerIdentity ?? emptyIdentityMaterial();
    const identityMatch = matchTs119602IdentityMaterial(declared, observation.signerIdentity);
    const signerEvidence = options.pointerSigners?.find((entry) => entry.location === reference.location);
    const trust = pointerSignerTrust(observation.signerCertificates[0], signerEvidence, new Date());
    const selfPointerIdentical = observation.sha256 === current.sha256;
    const unsupportedIdentityOnly = (reference.pointerIdentityCount ?? 0) > 0
      && declared.certificateFingerprintsSha256.length === 0
      && declared.publicKeyHashesSha256.length === 0
      && declared.subjectKeyIdentifiers.length === 0
      && (reference.pointerIdentityDiagnostics?.length ?? 0) === 0;
    const evidenceAcceptable = trust.path.status !== "fail"
      && trust.revocation.status !== "fail"
      && trust.revocation.status !== "inconclusive";
    return {
      location: reference.location,
      fetch: observation.fetch,
      target: compactObservation(observation),
      signatureVerified: observation.signatureVerified,
      declaredIdentity: declared,
      declaredIdentityCount: reference.pointerIdentityCount ?? 0,
      declaredIdentityDiagnostics: reference.pointerIdentityDiagnostics ?? [],
      signerIdentity: observation.signerIdentity,
      identityMatch,
      unsupportedIdentityOnly,
      signerTrustEvidence: trust,
      selfPointerIdentical,
      authenticated: Boolean(observation.fetch?.ok && observation.signatureVerified && identityMatch.matched && selfPointerIdentical && evidenceAcceptable),
    };
  });
  const inconclusiveTrust = results.some((entry) => entry.signerTrustEvidence.revocation.status === "inconclusive");
  const unsupportedIdentity = results.some((entry) => entry.unsupportedIdentityOnly);
  const definitiveFailure = results.some((entry) => !entry.authenticated
    && !entry.unsupportedIdentityOnly
    && entry.signerTrustEvidence.revocation.status !== "inconclusive");
  const valid = results.length === pointers.length && results.every((entry) => entry.authenticated);
  const status = definitiveFailure ? "fail" : omitted > 0 || inconclusiveTrust || unsupportedIdentity ? "inconclusive" : valid ? "pass" : "fail";
  return finding(
    "ts119602.scheme.pointers.authentication",
    status,
    status === "pass" ? "info" : status === "fail" ? "critical" : "warning",
    status === "pass"
      ? "Every self-pointer returned the current LoTE bytes with a verified signature matching a declared certificate, PublicKeyValue, or X509SKI identity."
      : status === "inconclusive"
        ? "Pointer authentication is inconclusive because references were omitted, only non-PKI OtherId forms were supplied, or signer revocation evidence is inconclusive."
        : "One or more pointed-to LoTEs could not be authenticated by a declared pointer identity or failed supplied path/revocation evidence.",
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

function archiveFinding(
  current: ArtifactObservation,
  references: ContextReference[],
  prior: ArtifactObservation[],
  fetched: Array<{ reference: ContextReference; observation: ArtifactObservation }>,
  traversed: ArchiveTraversalObservation[],
  enabled: boolean,
  omitted: number,
): CheckResult {
  const archives = references.filter((entry) => entry.kind === "archive");
  if (archives.length === 0) return finding("ts119602.context.archive", "not_applicable", "info", "No selected-profile archive reference is present.", { archiveReferenceCount: 0 });
  if (!enabled) return finding("ts119602.context.archive", "not_checked", "warning", "Archive references were not dereferenced because contextual dereferencing is disabled.", { archiveReferenceCount: archives.length, suppliedPriorArtifacts: prior.length });
  const direct = fetched.filter((entry) => entry.reference.kind === "archive").map(({ reference, observation }) => ({
    rootLocation: reference.location, location: reference.location, depth: 0, fetch: observation.fetch, artifact: compactObservation(observation),
  }));
  const descendants = traversed.map((entry) => ({
    rootLocation: entry.rootLocation, location: entry.location, parentLocation: entry.parentLocation, depth: entry.depth,
    fetch: entry.observation.fetch, artifact: compactObservation(entry.observation),
  }));
  const results = [...direct, ...descendants];
  const archived = [...prior, ...fetched.filter((entry) => entry.reference.kind === "archive").map((entry) => entry.observation), ...traversed.map((entry) => entry.observation)]
    .filter((entry) => entry.loteType === current.loteType && entry.sequenceNumber !== undefined && current.sequenceNumber !== undefined && entry.sequenceNumber < current.sequenceNumber);
  const foundSequences = [...new Set(archived.map((entry) => entry.sequenceNumber!))].sort((left, right) => left - right);
  const complete = current.sequenceNumber === 1 || Boolean(current.sequenceNumber !== undefined && current.sequenceNumber > 1
    && foundSequences.length === current.sequenceNumber - 1
    && foundSequences.every((value, index) => value === index + 1));
  const failed = direct.some((entry) => !entry.fetch?.ok);
  const status = failed ? "fail" : omitted > 0 || !complete ? "inconclusive" : "pass";
  return finding("ts119602.context.archive", status, status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass" ? "Bounded archive traversal and supplied evidence expose every previous LoTE sequence from the first release." : status === "fail" ? "A required archive location could not be fetched." : "Archive evidence is reachable but does not establish every previous LoTE instance; unsupported index protocols or bounded omissions may remain.",
    { archiveReferenceCount: archives.length, omittedReferences: omitted, suppliedPriorArtifacts: prior.map(compactObservation), foundSequences, completeSequence: complete, results });
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
    machineProcessable: Boolean(observation.fetch?.ok && ["json", "xml", "jws"].includes(observation.format)),
  }));
  const valid = results.length === points.length && results.every((entry) => entry.machineProcessable);
  const status = omitted > 0 ? "inconclusive" : valid ? "pass" : "fail";
  return finding("ts119602.context.supply_point", status, status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass" ? "Every service supply point returned machine-processable JSON or XML content." : status === "inconclusive" ? "Supply-point content validation is inconclusive because references were omitted by the bound." : "One or more service supply points failed or did not return machine-processable JSON/XML content.",
    { supplyPointCount: points.length, omittedReferences: omitted, results });
}

function registerAuthenticationFinding(
  current: ArtifactObservation,
  references: ContextReference[],
  fetched: Array<{ reference: ContextReference; observation: ArtifactObservation }>,
  enabled: boolean,
  omitted: number,
): CheckResult {
  if (current.loteType !== "http://uri.etsi.org/19602/LoTEType/EURegistrarsAndRegistersList") {
    return finding("ts119602.context.register_authentication", "not_applicable", "info", "Register-data authentication is specific to the Annex I registrars and registers profile.", { loteType: current.loteType });
  }
  const points = references.filter((entry) => entry.kind === "supply_point");
  if (points.length === 0) return finding("ts119602.context.register_authentication", "fail", "critical", "The Annex I list contains no register supply point to authenticate.", { supplyPointCount: 0 });
  if (!enabled) return finding("ts119602.context.register_authentication", "not_checked", "warning", "Register supply points were not dereferenced because contextual dereferencing is disabled.", { supplyPointCount: points.length });
  const results = fetched.filter((entry) => entry.reference.kind === "supply_point").map(({ reference, observation }) => {
    const identityMatch = matchTs119602IdentityMaterial(reference.serviceIdentity ?? emptyIdentityMaterial(), observation.signerIdentity);
    const signedRepresentationSupported = observation.format === "jws";
    return {
      servicePath: reference.servicePath,
      location: reference.location,
      fetch: observation.fetch,
      format: observation.format,
      signatureVerified: observation.signatureVerified,
      declaredServiceIdentity: reference.serviceIdentity,
      signerIdentity: observation.signerIdentity,
      identityMatch,
      authenticated: Boolean(observation.fetch?.ok && observation.signatureVerified && identityMatch.matched),
      signedRepresentationSupported,
    };
  });
  const definitiveFailure = results.some((entry) => !entry.fetch?.ok || entry.signedRepresentationSupported && !entry.authenticated);
  const valid = results.length === points.length && results.every((entry) => entry.authenticated);
  const status = definitiveFailure ? "fail" : omitted > 0 || !valid ? "inconclusive" : "pass";
  return finding(
    "ts119602.context.register_authentication",
    status,
    status === "pass" ? "info" : status === "fail" ? "critical" : "warning",
    status === "pass"
      ? "Every fetched register uses a verified compact JWS signature whose signer matches its declaring ServiceDigitalIdentity."
      : status === "fail"
        ? "One or more fetched register representations failed compact-JWS authentication with the declaring service identity."
        : "Register authentication is inconclusive because a representation is unsigned, uses an unsupported signature/seal format, or was omitted by the bound.",
    { supplyPointCount: points.length, omittedReferences: omitted, supportedSignedRepresentation: "compact JWS with embedded x5c", results },
  );
}

function resourceSemanticsFinding(
  references: ContextReference[],
  fetched: Array<{ reference: ContextReference; observation: ArtifactObservation }>,
  enabled: boolean,
  omitted: number,
  options: Ts119602ContextOptions,
): CheckResult {
  const supplied = options.ts119602?.resources ?? [];
  if (supplied.length === 0) return finding("ts119602.context.scheme_resources", "not_checked", "warning", "No hash-bound human review was supplied for scheme information, rules, or policy resources.", { suppliedEvidenceCount: 0 });
  const resources = references.filter((entry) => entry.kind === "resource");
  if (!enabled) return finding("ts119602.context.scheme_resources", "not_checked", "warning", "Scheme resources were not dereferenced, so supplied semantic assertions could not be bound to fetched bytes.", { resourceCount: resources.length, suppliedEvidenceCount: supplied.length });
  const results = fetched.filter((entry) => entry.reference.kind === "resource").map(({ reference, observation }) => {
    const evidence = supplied.find((entry) => entry.location === reference.location);
    const required = reference.requiredAssertions ?? [];
    const observedAssertions = evidence?.assertions ?? [];
    return {
      location: reference.location,
      resourceKind: reference.resourceKind,
      fetch: observation.fetch,
      observedSha256: observation.sha256,
      evidenceSha256: evidence?.sha256.toLowerCase(),
      hashMatches: Boolean(evidence && observation.sha256 === evidence.sha256.toLowerCase()),
      evidenceSource: evidence?.source,
      evidencePresent: Boolean(evidence),
      checkedAt: evidence?.checkedAt,
      checkedAtValid: Boolean(evidence && parseDate(evidence.checkedAt)),
      requiredAssertions: required,
      observedAssertions,
      missingAssertions: required.filter((assertion) => !observedAssertions.includes(assertion)),
    };
  });
  const declaredLocations = new Set(resources.map((entry) => entry.location));
  const unreferencedEvidence = supplied.filter((entry) => !declaredLocations.has(entry.location)).map((entry) => entry.location);
  const definitiveFailure = results.some((entry) => !entry.fetch?.ok || entry.evidencePresent && (!entry.hashMatches || !entry.checkedAtValid));
  const complete = results.length === resources.length && results.every((entry) => entry.hashMatches && entry.missingAssertions.length === 0 && entry.checkedAtValid);
  const status = definitiveFailure ? "fail" : omitted > 0 || unreferencedEvidence.length > 0 || !complete ? "inconclusive" : "pass";
  return finding(
    "ts119602.context.scheme_resources",
    status,
    status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass"
      ? "Every declared scheme-information, rules, and policy resource is bound by SHA-256 to supplied human-reviewed semantic assertions."
      : status === "fail"
        ? "Fetched scheme-resource bytes do not match supplied review evidence, a fetch failed, or review time evidence is invalid."
        : "Scheme-resource semantics remain inconclusive because review evidence, assertions, or bounded dereferences are incomplete.",
    { resourceCount: resources.length, suppliedEvidenceCount: supplied.length, omittedReferences: omitted, unreferencedEvidence, results },
  );
}

function authoritativeIdentityFinding(current: ArtifactObservation, options: Ts119602ContextOptions): CheckResult {
  const supplied = options.ts119602?.authoritative;
  if (!supplied) return finding("ts119602.context.authoritative_identity", "not_checked", "warning", "No authoritative registration/contact evidence was supplied for the scheme operator or trusted entities.", { entityCount: current.facts.entities.length });
  const operator = current.facts.schemeOperator && supplied.schemeOperator
    ? compareAuthoritativeParty(current.facts.schemeOperator, supplied.schemeOperator)
    : undefined;
  const entities = current.facts.entities.map((entity) => {
    const evidence = supplied.entities?.find((entry) => entry.entityPath === entity.path);
    return evidence ? compareAuthoritativeParty(entity, evidence) : { path: entity.path, evidencePresent: false, valid: false, complete: false };
  });
  const explicitMismatches = [operator, ...entities].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .some((entry) => entry.evidencePresent && !entry.valid);
  const complete = Boolean(operator?.complete) && entities.every((entry) => entry.complete);
  const status = explicitMismatches ? "fail" : complete ? "pass" : "inconclusive";
  return finding(
    "ts119602.context.authoritative_identity",
    status,
    status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass"
      ? "Supplied authoritative evidence matches the scheme operator and every trusted entity's names, registration identifiers, contacts, and associated-body relationships."
      : status === "fail"
        ? "One or more local identity/contact claims conflict with supplied authoritative evidence."
        : "Authoritative identity assessment is incomplete because evidence is missing for the scheme operator or one or more trusted entities.",
    { schemeOperator: operator ?? { evidencePresent: false }, entities },
  );
}

function compareAuthoritativeParty(
  party: Ts119602ContextParty,
  evidence: Ts119602AuthoritativeIdentityEvidence,
) {
  const nameMatches = party.names.some((value) => evidence.names.includes(value));
  const registrationIdentifiersMatch = party.registrationIdentifiers.every((value) => evidence.registrationIdentifiers?.includes(value));
  const postalAddressesMatch = party.postalAddresses.every((value) => evidence.postalAddresses.some((entry) => entry.streetAddress === value.streetAddress && entry.country === value.country));
  const electronicAddressesMatch = party.electronicAddresses.every((value) => evidence.electronicAddresses.includes(value));
  const associatedBodiesMatch = party.associatedBodies.every((value) => evidence.associatedBodies?.includes(value));
  const checkedAtValid = Boolean(parseDate(evidence.checkedAt));
  const sourcePresent = evidence.source.trim().length > 0;
  return {
    path: party.path,
    evidencePresent: true,
    evidenceSource: evidence.source,
    checkedAt: evidence.checkedAt,
    nameMatches,
    registrationIdentifiers: party.registrationIdentifiers,
    registrationIdentifiersMatch,
    postalAddressesMatch,
    electronicAddressesMatch,
    associatedBodies: party.associatedBodies,
    associatedBodiesMatch,
    checkedAtValid,
    sourcePresent,
    complete: true,
    valid: nameMatches && registrationIdentifiersMatch && postalAddressesMatch && electronicAddressesMatch && associatedBodiesMatch && checkedAtValid && sourcePresent,
  };
}

function historyRetentionFinding(current: ArtifactObservation, prior: ArtifactObservation[]): CheckResult {
  const period = current.facts.historyPeriod;
  if (period === undefined || period === 0) return finding("ts119602.service.history_retention", "not_applicable", "info", "Historical retention is not required because HistoricalInformationPeriod is absent or zero.", { historicalInformationPeriod: period ?? null });
  if (period !== 65535) return finding("ts119602.service.history_retention", "inconclusive", "warning", "Finite historical retention requires a scheme-defined duration unit/policy that was not supplied.", { historicalInformationPeriod: period });
  if (prior.length === 0) return finding("ts119602.service.history_retention", "not_checked", "warning", "No prior LoTE instances were supplied to assess never-remove history retention.", { historicalInformationPeriod: period });
  const comparable = prior.filter((entry) => entry.loteType === current.loteType && entry.sequenceNumber !== undefined);
  const sequenceComplete = current.sequenceNumber !== undefined && current.sequenceNumber > 1
    && new Set(comparable.map((entry) => entry.sequenceNumber)).size === current.sequenceNumber - 1
    && Array.from({ length: current.sequenceNumber - 1 }, (_, index) => index + 1).every((value) => comparable.some((entry) => entry.sequenceNumber === value));
  const currentServices = current.facts.entities.flatMap((entity) => entity.services);
  const results = comparable.flatMap((artifact) => artifact.facts.entities.flatMap((entity) => entity.services.map((priorService) => {
    const service = currentServices.find((entry) => entry.key === priorService.key);
    const retainedAsCurrent = Boolean(service && sameServiceState(priorService, service));
    const retainedInHistory = Boolean(service?.history.some((entry) => sameServiceState(priorService, entry)));
    return {
      source: artifact.source,
      sequenceNumber: artifact.sequenceNumber,
      serviceKey: priorService.key,
      servicePath: priorService.path,
      currentServicePath: service?.path,
      retainedAsCurrent,
      retainedInHistory,
      retained: retainedAsCurrent || retainedInHistory,
    };
  })));
  const missing = results.some((entry) => !entry.retained);
  const status = missing ? "fail" : sequenceComplete && comparable.length === prior.length ? "pass" : "inconclusive";
  return finding(
    "ts119602.service.history_retention",
    status,
    status === "pass" ? "info" : status === "fail" ? "error" : "warning",
    status === "pass"
      ? "Every service state in the complete supplied LoTE sequence remains represented as current information or service history."
      : status === "fail"
        ? "At least one service state observed in a supplied prior LoTE is absent from current information and service history."
        : "Observed prior service states are retained, but the supplied LoTE sequence is incomplete.",
    { historicalInformationPeriod: period, completeSequence: sequenceComplete, comparablePriorCount: comparable.length, suppliedPriorCount: prior.length, results },
  );
}

function finalClosedLoteFinding(current: ArtifactObservation, options: Ts119602ContextOptions): CheckResult {
  if (!current.facts.nextUpdateNull) return finding("ts119602.scheme.final_closed_list", "not_applicable", "info", "Final closed-list semantics are not applicable because NextUpdate is not null.", { nextUpdatePresent: current.facts.nextUpdatePresent, nextUpdateNull: current.facts.nextUpdateNull });
  const services = current.facts.entities.flatMap((entity) => entity.services);
  if (services.length === 0) return finding("ts119602.scheme.final_closed_list", "pass", "info", "The final closed LoTE contains no services requiring an expired status.", { serviceCount: 0 });
  const missingStatus = services.filter((service) => !service.status).map((service) => service.path);
  if (missingStatus.length > 0) return finding("ts119602.scheme.final_closed_list", "fail", "critical", "A final closed LoTE has services without an explicit expired status.", { serviceCount: services.length, missingStatus });
  const expiredUris = options.ts119602?.expiredServiceStatusUris ?? [];
  if (expiredUris.length === 0) return finding("ts119602.scheme.final_closed_list", "inconclusive", "warning", "NextUpdate is null, but no profile/scheme policy defining the URI meaning expired was supplied.", { serviceCount: services.length, observedStatuses: uniqueStrings(services.map((service) => service.status!)) });
  const results = services.map((service) => ({ path: service.path, status: service.status, expired: expiredUris.includes(service.status!) }));
  const valid = results.every((entry) => entry.expired);
  return finding("ts119602.scheme.final_closed_list", valid ? "pass" : "fail", valid ? "info" : "critical",
    valid ? "NextUpdate is null and every service status has caller-supplied profile semantics meaning expired." : "NextUpdate is null but one or more service statuses are not defined as expired by the supplied profile policy.",
    { serviceCount: services.length, expiredServiceStatusUris: expiredUris, results });
}

function sameServiceState(left: Ts119602ContextService, right: Pick<Ts119602ContextService, "status" | "statusStartingTime" | "identity">): boolean {
  return left.status === right.status
    && left.statusStartingTime === right.statusStartingTime
    && matchTs119602IdentityMaterial(left.identity, right.identity).matched;
}

function uniqueReferences(references: ContextReference[]): ContextReference[] {
  const seen = new Set<string>();
  return references.filter((entry) => {
    const key = `${entry.kind}\u0000${entry.resourceKind ?? ""}\u0000${entry.servicePath ?? ""}\u0000${entry.location}`;
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
    signerIdentity: observation.signerIdentity,
    signatureVerified: observation.signatureVerified,
  };
}

function resourceReference(
  location: string,
  resourceKind: ResourceKind,
  requiredAssertions: readonly Ts119602ResourceAssertion[],
): ContextReference {
  return { kind: "resource", location, resourceKind, requiredAssertions };
}

function valuesForKey(value: unknown, key: string): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => valuesForKey(entry, key));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([entryKey, entryValue]) => {
    if (entryKey !== key) return valuesForKey(entryValue, key);
    if (typeof entryValue === "string") return [entryValue];
    if (!isRecord(entryValue)) return [];
    return [entryValue.uriValue, entryValue.value, entryValue.val].filter((entry): entry is string => typeof entry === "string");
  });
}

function inspectJsonServiceIdentity(value: unknown, path: string): Ts119602IdentityMaterial {
  const record = isRecord(value) ? value : {};
  return inspectTs119602Identity(identityObservation(path, {
    certificates: asArray(record.X509Certificates).map((entry) => getPath(entry, ["val"]) ?? entry),
    publicKeys: asArray(record.PublicKeyValues),
    skis: asArray(record.X509SKIs),
  }));
}

export function inspectTs119602JsonPointerIdentity(pointer: unknown): {
  pointerIdentity: Ts119602IdentityMaterial;
  pointerIdentityDiagnostics: string[];
} {
  const identities = asArray(getPath(pointer, ["ServiceDigitalIdentities"])).map((value, index) => {
    const record = isRecord(value) ? value : {};
    return inspectTs119602Identity(identityObservation(`/pointer/identity/${index}`, {
      certificates: asArray(record.X509Certificates).map((entry) => getPath(entry, ["val"]) ?? entry),
      publicKeys: asArray(record.PublicKeyValues),
      skis: asArray(record.X509SKIs),
    }));
  });
  return { pointerIdentity: mergeIdentityMaterial(identities), pointerIdentityDiagnostics: identities.flatMap((entry) => entry.diagnostics) };
}

function xmlIdentity(node: Node | undefined, path: string): Ts119602IdentityObservation {
  if (!node) return identityObservation(path, {});
  const digitalIds = nodes(node, "./*[local-name()='DigitalId']");
  const entries = (name: string) => digitalIds.flatMap((digitalId) => nodes(digitalId, `./*[local-name()='${name}']`));
  return {
    ...identityObservation(path, {
      certificates: entries("X509Certificate").map((entry) => entry.textContent?.replace(/\s+/g, "") ?? ""),
      skis: entries("X509SKI").map((entry) => entry.textContent?.replace(/\s+/g, "") ?? ""),
      publicKeys: entries("KeyValue").map((entry) => xmlRsaKeyValue(
        text(entry, ".//*[local-name()='RSAKeyValue']/*[local-name()='Modulus']"),
        text(entry, ".//*[local-name()='RSAKeyValue']/*[local-name()='Exponent']"),
      ) ?? { unsupportedXmlKeyValue: entry.nodeName }),
    }),
    subjectNames: entries("X509SubjectName").map((entry, index) => ({ path: `${path}/subject/${index}`, value: entry.textContent?.trim() })),
  };
}

function xmlNodePath(node: Node): string {
  const segments: string[] = [];
  let current: Node | null = node;
  while (current?.nodeType === 1) {
    const element = current as Element;
    let position = 1;
    let sibling = element.previousSibling;
    while (sibling) {
      if (sibling.nodeType === 1 && (sibling as Element).localName === element.localName) position += 1;
      sibling = sibling.previousSibling;
    }
    segments.unshift(`${element.localName}[${position}]`);
    current = element.parentNode;
  }
  return `/${segments.join("/")}`;
}

function identityObservation(
  path: string,
  values: { certificates?: unknown[]; publicKeys?: unknown[]; skis?: unknown[] },
): Ts119602IdentityObservation {
  const located = (name: string, entries: unknown[] | undefined) => (entries ?? []).map((value, index) => ({ path: `${path}/${name}/${index}`, value }));
  return {
    path,
    present: true,
    certificates: located("certificate", values.certificates),
    subjectNames: [],
    publicKeys: located("public-key", values.publicKeys),
    skis: located("ski", values.skis),
    otherIds: [],
  };
}

function mergeIdentityMaterial(entries: Ts119602IdentityMaterial[]): Ts119602IdentityMaterial {
  return {
    certificateFingerprintsSha256: uniqueStrings(entries.flatMap((entry) => entry.certificateFingerprintsSha256)),
    publicKeyHashesSha256: uniqueStrings(entries.flatMap((entry) => entry.publicKeyHashesSha256)),
    subjectKeyIdentifiers: uniqueStrings(entries.flatMap((entry) => entry.subjectKeyIdentifiers)),
  };
}

function emptyIdentityMaterial(): Ts119602IdentityMaterial {
  return { certificateFingerprintsSha256: [], publicKeyHashesSha256: [], subjectKeyIdentifiers: [] };
}

function signerCertificates(bytes: Buffer, format: DetectedFormat): string[] {
  if (format === "jws") {
    try {
      const header = parseCompactJades(bytes.toString("utf8").trim()).protectedHeader;
      return Array.isArray(header?.x5c) ? header.x5c.filter((entry): entry is string => typeof entry === "string") : [];
    } catch {
      return [];
    }
  }
  if (format === "xml") {
    const root = parseXml(bytes.toString("utf8")).document?.documentElement;
    return root ? texts(root, ".//*[local-name()='Signature']/*[local-name()='KeyInfo']//*[local-name()='X509Certificate']")
      .map((value) => value.replace(/\s+/g, "")) : [];
  }
  return [];
}

function pointerSignerTrust(
  signerCertificate: string | undefined,
  evidence: TrustListPointerSignerEvidence | undefined,
  assessmentDate: Date,
) {
  return {
    supplied: Boolean(evidence),
    path: pointerPathEvidence(signerCertificate, evidence, assessmentDate),
    revocation: pointerRevocationEvidence(signerCertificate, evidence, assessmentDate),
  };
}

function pointerPathEvidence(
  signerCertificate: string | undefined,
  evidence: TrustListPointerSignerEvidence | undefined,
  assessmentDate: Date,
) {
  if (!evidence?.trustAnchors?.length) {
    return { status: "not_checked" as const, suppliedIntermediates: evidence?.intermediateCertificates?.length ?? 0, suppliedTrustAnchors: 0 };
  }
  if (!signerCertificate) return { status: "fail" as const, reason: "The pointed artifact has no parseable signing certificate." };
  try {
    const chain = [signerCertificate, ...(evidence.intermediateCertificates ?? [])].map(parseCertificate);
    const anchors = evidence.trustAnchors.map(parseCertificate);
    const temporalValid = [...chain, ...anchors].every((entry) => assessmentDate >= new Date(entry.validFrom) && assessmentDate <= new Date(entry.validTo));
    const linksValid = chain.slice(0, -1).every((entry, index) => entry.checkIssued(chain[index + 1]) && entry.verify(chain[index + 1].publicKey));
    const last = chain.at(-1)!;
    const anchor = anchors.find((candidate) => fingerprint(candidate) === fingerprint(last)
      || (last.checkIssued(candidate) && last.verify(candidate.publicKey)));
    const valid = temporalValid && linksValid && Boolean(anchor);
    return {
      status: valid ? "pass" as const : "fail" as const,
      temporalValid,
      linksValid,
      anchorMatched: Boolean(anchor),
      signerFingerprintSha256: fingerprint(chain[0]),
      anchorFingerprintSha256: anchor ? fingerprint(anchor) : undefined,
    };
  } catch (error) {
    return { status: "fail" as const, reason: error instanceof Error ? error.message : String(error) };
  }
}

function pointerRevocationEvidence(
  signerCertificate: string | undefined,
  evidence: TrustListPointerSignerEvidence | undefined,
  assessmentDate: Date,
) {
  if (!evidence?.revocation) return { status: "not_checked" as const };
  const signer = signerCertificate ? inspectTs119602Identity(identityObservation("/pointer/signer", { certificates: [signerCertificate] })) : undefined;
  const fingerprintSha256 = signer?.certificateFingerprintsSha256[0];
  const checkedAt = parseDate(evidence.revocation.checkedAt);
  const nextUpdate = evidence.revocation.nextUpdate ? parseDate(evidence.revocation.nextUpdate) : undefined;
  const fingerprintMatches = Boolean(fingerprintSha256)
    && evidence.revocation.signerFingerprintSha256.toLowerCase() === fingerprintSha256;
  const temporallyApplicable = Boolean(checkedAt && checkedAt <= assessmentDate
    && (!evidence.revocation.nextUpdate || (nextUpdate && nextUpdate >= assessmentDate)));
  if (!fingerprintMatches || !temporallyApplicable) {
    return { status: "inconclusive" as const, fingerprintMatches, temporallyApplicable, supplied: evidence.revocation };
  }
  return { status: evidence.revocation.status === "good" ? "pass" as const : evidence.revocation.status === "revoked" ? "fail" as const : "inconclusive" as const, supplied: evidence.revocation };
}

function parseCertificate(value: string): X509Certificate {
  return new X509Certificate(Buffer.from(normalizeBase64Certificate(value), "base64"));
}
function fingerprint(value: X509Certificate): string { return value.fingerprint256.replaceAll(":", "").toLowerCase(); }
function parseDate(value: string): Date | undefined { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? undefined : parsed; }
function uniqueStrings(values: string[]): string[] { return [...new Set(values.map((value) => value.toLowerCase()))].sort(); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

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
