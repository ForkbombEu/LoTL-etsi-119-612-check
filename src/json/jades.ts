import {
  constants,
  createHash,
  verify as verifySignature,
  X509Certificate,
} from "node:crypto";
import { sha256Hex, tryCertificateFromBase64 } from "../certs.js";
import type { CertificateSummary, CheckResult } from "../types.js";

const IAT_REQUIRED_FROM = Date.parse("2025-07-15T00:00:00Z") / 1000;

const SUPPORTED_ALGORITHMS = Object.freeze({
  RS256: { digest: "sha256", kind: "rsa" },
  RS384: { digest: "sha384", kind: "rsa" },
  RS512: { digest: "sha512", kind: "rsa" },
  PS256: { digest: "sha256", kind: "rsa-pss" },
  PS384: { digest: "sha384", kind: "rsa-pss" },
  PS512: { digest: "sha512", kind: "rsa-pss" },
  ES256: { digest: "sha256", kind: "ecdsa" },
  ES384: { digest: "sha384", kind: "ecdsa" },
  ES512: { digest: "sha512", kind: "ecdsa" },
  EdDSA: { digest: null, kind: "eddsa" },
} as const);

type SupportedAlgorithm = keyof typeof SUPPORTED_ALGORITHMS;

export interface CompactJadesParseResult {
  serializationValid: boolean;
  errors: string[];
  protectedSegment?: string;
  payloadSegment?: string;
  signatureSegment?: string;
  protectedHeader?: Record<string, unknown>;
  payloadBytes?: Buffer;
  parsedPayload?: unknown;
  signatureBytes?: Buffer;
  signingInput?: Buffer;
  detachedPayload: boolean;
}

export interface JadesAssessmentOptions {
  assessmentDate?: Date;
  schemeTerritory?: string;
  schemeOperatorNames?: readonly string[];
  trustedSignerFingerprintsSha256?: readonly string[];
}

export interface JadesAssessment {
  checks: CheckResult[];
  certificates: CertificateSummary[];
  parse: CompactJadesParseResult;
}

/** Parse JWS Compact Serialization without accepting padded or non-canonical base64url segments. */
export function parseCompactJades(value: string): CompactJadesParseResult {
  const errors: string[] = [];
  const segments = value.trim().split(".");
  if (segments.length !== 3) {
    return { serializationValid: false, errors: ["JWS Compact Serialization requires exactly three dot-separated segments."], detachedPayload: false };
  }
  const [protectedSegment, payloadSegment, signatureSegment] = segments;
  if (!protectedSegment) errors.push("The protected-header segment is empty.");
  if (!signatureSegment) errors.push("The signature-value segment is empty.");

  const protectedBytes = decodeBase64Url(protectedSegment);
  const signatureBytes = decodeBase64Url(signatureSegment);
  if (!protectedBytes) errors.push("The protected-header segment is not canonical base64url.");
  if (!signatureBytes) errors.push("The signature-value segment is not canonical base64url.");

  let protectedHeader: Record<string, unknown> | undefined;
  if (protectedBytes) {
    try {
      const candidate = JSON.parse(protectedBytes.toString("utf8")) as unknown;
      if (isRecord(candidate)) protectedHeader = candidate;
      else errors.push("The decoded protected header is not a JSON object.");
    } catch {
      errors.push("The decoded protected header is not valid JSON.");
    }
  }

  const detachedPayload = payloadSegment.length === 0;
  let payloadBytes: Buffer | undefined;
  if (!detachedPayload) {
    if (protectedHeader?.b64 === false) {
      payloadBytes = Buffer.from(payloadSegment, "utf8");
    } else {
      payloadBytes = decodeBase64Url(payloadSegment);
      if (!payloadBytes) errors.push("The payload segment is not canonical base64url.");
    }
  }

  let parsedPayload: unknown;
  if (payloadBytes) {
    try {
      parsedPayload = JSON.parse(payloadBytes.toString("utf8")) as unknown;
    } catch {
      errors.push("The recovered JWS payload is not valid JSON.");
    }
  }

  return {
    serializationValid: errors.length === 0,
    errors,
    protectedSegment,
    payloadSegment,
    signatureSegment,
    protectedHeader,
    payloadBytes,
    parsedPayload,
    signatureBytes,
    signingInput: protectedSegment && signatureSegment ? Buffer.from(`${protectedSegment}.${payloadSegment}`, "ascii") : undefined,
    detachedPayload,
  };
}

export function assessCompactJades(
  compactSerialization: string | undefined,
  assessedPayload: unknown,
  options: JadesAssessmentOptions = {},
): JadesAssessment {
  const assessmentDate = options.assessmentDate ?? new Date();
  if (!compactSerialization) return missingJadesAssessment(options);

  const parsed = parseCompactJades(compactSerialization);
  const checks: CheckResult[] = [check(
    "json_lote.signature.jades_compact_serialization",
    parsed.serializationValid ? "pass" : "fail",
    parsed.serializationValid ? "info" : "critical",
    parsed.serializationValid
      ? "The signature uses parseable JWS Compact Serialization."
      : "The supplied compact JAdES signature is malformed.",
    { errors: parsed.errors, detachedPayload: parsed.detachedPayload },
  )];

  const header = parsed.protectedHeader;
  const algorithm = typeof header?.alg === "string" ? header.alg : undefined;
  const iat = header?.iat;
  const certificateReferenceNames = ["x5t#S256", "x5c", "sigX5ts", "x5t#o"].filter((name) => header && Object.hasOwn(header, name));
  const validCertificateReferenceNames = certificateReferenceNames.filter((name) => validCertificateReferenceSyntax(header!, name));
  const crit = Array.isArray(header?.crit) && header.crit.every((entry) => typeof entry === "string")
    ? header.crit as string[]
    : undefined;
  const critValid = !Object.hasOwn(header ?? {}, "crit") || Boolean(
    crit
    && crit.length > 0
    && new Set(crit).size === crit.length
    && crit.every((name) => Object.hasOwn(header!, name)),
  );
  const unsupportedCriticalHeaders = crit?.filter((name) => name !== "b64") ?? [];
  const b64Critical = header?.b64 !== false || Boolean(crit?.includes("b64"));
  const sigDCritical = !Object.hasOwn(header ?? {}, "sigD") || Boolean(crit?.includes("sigD"));
  const baselineHeaderValid = Boolean(
    parsed.serializationValid
    && header
    && algorithm
    && algorithm !== "none"
    && Number.isInteger(iat)
    && Number(iat) >= IAT_REQUIRED_FROM
    && !Object.hasOwn(header, "sigT")
    && !Object.hasOwn(header, "x5t")
    && validCertificateReferenceNames.length >= 1
    && validCertificateReferenceNames.length === certificateReferenceNames.length
    && critValid
    && (header.b64 === undefined || typeof header.b64 === "boolean")
    && b64Critical
    && sigDCritical,
  );
  checks.push(
    check(
      "json_lote.signature.jades_protected_header",
      header ? "pass" : "fail",
      header ? "info" : "critical",
      header
        ? "The compact serialization contains a JSON JWS Protected Header."
        : "A JSON JWS Protected Header could not be recovered.",
      header,
    ),
    check(
      "json_lote.signature.jades_baseline_b",
      baselineHeaderValid ? "pass" : "fail",
      baselineHeaderValid ? "info" : "critical",
      baselineHeaderValid
        ? "The protected header satisfies the implemented JAdES Baseline B mandatory-header requirements."
        : "The protected header does not satisfy the implemented JAdES Baseline B mandatory-header requirements.",
      {
        algorithm,
        iat,
        iatRequiredFrom: IAT_REQUIRED_FROM,
        sigTPresent: Boolean(header && Object.hasOwn(header, "sigT")),
        prohibitedSha1ThumbprintPresent: Boolean(header && Object.hasOwn(header, "x5t")),
        certificateReferenceNames,
        validCertificateReferenceNames,
        critValid,
        b64Critical,
        sigDCritical,
      },
    ),
    check(
      "json_lote.signature.jades_critical_headers",
      !critValid ? "fail" : unsupportedCriticalHeaders.length > 0 ? "unsupported" : "pass",
      !critValid ? "critical" : unsupportedCriticalHeaders.length > 0 ? "warning" : "info",
      !critValid
        ? "The protected crit header is malformed, duplicated, or names an absent header parameter."
        : unsupportedCriticalHeaders.length > 0
          ? "One or more critical protected header parameters are not implemented by this verifier."
          : "All declared critical protected header parameters are understood by this verifier.",
      { crit, unsupportedCriticalHeaders },
    ),
    signingTimeCheck(iat),
  );

  const payloadRecovered = parsed.payloadBytes !== undefined && parsed.parsedPayload !== undefined;
  checks.push(check(
    "json_lote.signature.jades_payload_recovered",
    parsed.detachedPayload ? "unsupported" : payloadRecovered ? "pass" : "fail",
    parsed.detachedPayload ? "warning" : payloadRecovered ? "info" : "critical",
    parsed.detachedPayload
      ? "The compact JAdES signature uses a detached payload, but no external payload bytes were supplied to this assessment path."
      : payloadRecovered
        ? "The attached compact JWS payload was recovered as JSON."
        : "The attached compact JWS payload could not be recovered as JSON.",
    parsed.payloadBytes ? { bytes: parsed.payloadBytes.length, sha256: sha256Hex(parsed.payloadBytes) } : undefined,
  ));
  const payloadMatches = payloadRecovered && jsonEquivalent(parsed.parsedPayload, assessedPayload);
  checks.push(check(
    "json_lote.signature.jades_payload_match",
    parsed.detachedPayload ? "not_checked" : payloadRecovered ? payloadMatches ? "pass" : "fail" : "not_checked",
    payloadRecovered && !payloadMatches ? "critical" : "info",
    parsed.detachedPayload
      ? "Payload matching was not checked because the compact signature has a detached payload."
      : !payloadRecovered
        ? "Payload matching was not checked because no JSON payload was recovered."
        : payloadMatches
          ? "The recovered signed JSON payload equals the assessed LoTE value."
          : "The recovered signed JSON payload differs from the assessed LoTE value.",
    payloadRecovered ? {
      recoveredPayloadSha256: sha256Hex(parsed.payloadBytes!),
      assessedCanonicalJsonSha256: sha256Hex(Buffer.from(canonicalJson(assessedPayload), "utf8")),
    } : undefined,
  ));

  const certificateValues = Array.isArray(header?.x5c) && header.x5c.every((entry) => typeof entry === "string")
    ? header.x5c as string[]
    : [];
  const x5cPresent = Boolean(header && Object.hasOwn(header, "x5c"));
  const x5cValid = Array.isArray(header?.x5c) && header.x5c.length > 0 && header.x5c.every((entry) => typeof entry === "string");
  checks.push(check(
    "json_lote.signature.jades_signing_certificate_present",
    certificateValues.length > 0 ? "pass" : x5cPresent && !x5cValid ? "fail" : certificateReferenceNames.length > 0 ? "unsupported" : "fail",
    certificateValues.length > 0 ? "info" : x5cPresent && !x5cValid ? "critical" : "warning",
    certificateValues.length > 0
      ? "The protected x5c header contains signing-certificate material."
      : x5cPresent && !x5cValid
        ? "The protected x5c header is not a non-empty array of base64 certificate strings."
      : certificateReferenceNames.length > 0
        ? "The signature references certificate material but does not embed an x5c chain; external certificate resolution is not implemented."
        : "No signing-certificate material or reference is present.",
    { count: certificateValues.length, certificateReferenceNames },
  ));
  const certificates = certificateValues
    .map((value) => tryCertificateFromBase64(value, "json_signature", assessmentDate))
    .filter((value): value is CertificateSummary => Boolean(value));
  checks.push(check(
    "json_lote.signature.jades_signing_certificate_parsed",
    certificateValues.length === 0 ? "not_checked" : certificates.length === certificateValues.length ? "pass" : "fail",
    certificateValues.length === 0 ? "info" : certificates.length === certificateValues.length ? "info" : "critical",
    certificateValues.length === 0
      ? "Certificate parsing was not checked because no x5c chain is embedded."
      : certificates.length === certificateValues.length
        ? "Every certificate in the protected x5c chain parsed successfully."
        : "One or more protected x5c certificates could not be parsed.",
    certificateValues.length ? { present: certificateValues.length, parsed: certificates.length, certificates } : undefined,
  ));

  const signerCertificate = certificates[0];
  const signerCertificateValue = certificateValues[0];
  checks.push(signingCertificateReferenceCheck(header, signerCertificateValue, certificateReferenceNames));
  checks.push(...cryptographicChecks(parsed, algorithm, signerCertificateValue));
  checks.push(certificateValidityCheck(signerCertificate, iat));
  checks.push(signerSubjectCheck("country", signerCertificate?.subject, options.schemeTerritory ? [options.schemeTerritory] : undefined));
  checks.push(signerSubjectCheck("organization", signerCertificate?.subject, options.schemeOperatorNames));
  checks.push(signerTrustCheck(signerCertificate?.fingerprintSha256, options.trustedSignerFingerprintsSha256));
  return { checks, certificates, parse: parsed };
}

function missingJadesAssessment(options: JadesAssessmentOptions): JadesAssessment {
  const parsed: CompactJadesParseResult = { serializationValid: false, errors: ["No compact JAdES serialization was supplied."], detachedPayload: false };
  return {
    parse: parsed,
    certificates: [],
    checks: [
      check("json_lote.signature.jades_compact_serialization", "fail", "critical", "No compact JAdES serialization was supplied; a JSON signature property is not compact JAdES evidence."),
      check("json_lote.signature.jades_protected_header", "not_checked", "info", "The protected header was not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_baseline_b", "fail", "critical", "JAdES Baseline B requirements fail because compact JAdES is absent."),
      check("json_lote.signature.jades_critical_headers", "not_checked", "info", "Critical protected headers were not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_signing_time", "not_checked", "info", "The claimed signing time was not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_payload_recovered", "not_checked", "info", "Payload recovery was not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_payload_match", "not_checked", "info", "Payload matching was not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_signing_certificate_present", "not_checked", "info", "Signing-certificate presence was not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_signing_certificate_parsed", "not_checked", "info", "Signing-certificate parsing was not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_signing_certificate_reference", "not_checked", "info", "The signing-certificate reference was not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_algorithm", "not_checked", "info", "The signature algorithm was not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_cryptographic_verification_attempted", "not_checked", "info", "Cryptographic verification was not attempted because compact JAdES is absent."),
      check("json_lote.signature.jades_cryptographic_verification_result", "not_checked", "info", "Cryptographic verification has no result because compact JAdES is absent."),
      check("json_lote.signature.jades_signing_certificate_validity", "not_checked", "info", "Signing-certificate validity was not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_signer_subject.country", "not_checked", "info", "Signer country matching was not checked because compact JAdES is absent."),
      check("json_lote.signature.jades_signer_subject.organization", "not_checked", "info", "Signer organization matching was not checked because compact JAdES is absent."),
      signerTrustCheck(undefined, options.trustedSignerFingerprintsSha256),
    ],
  };
}

function signingTimeCheck(value: unknown): CheckResult {
  const valid = Number.isInteger(value) && Number(value) >= IAT_REQUIRED_FROM;
  return check(
    "json_lote.signature.jades_signing_time",
    valid ? "pass" : "fail",
    valid ? "info" : "critical",
    valid
      ? "The protected iat header contains an integer NumericDate at or after the JAdES V1.2.1 transition date."
      : "The protected iat header must contain the claimed signing time as an integer NumericDate for signatures generated under the selected profile.",
    { iat: value, iso: valid ? new Date(Number(value) * 1000).toISOString() : undefined },
  );
}

function signingCertificateReferenceCheck(
  header: Record<string, unknown> | undefined,
  certificate: string | undefined,
  referenceNames: string[],
): CheckResult {
  if (!header || referenceNames.length === 0) {
    return check("json_lote.signature.jades_signing_certificate_reference", "fail", "critical", "No protected signing-certificate reference or x5c value is present.");
  }
  if (!certificate) {
    return check(
      "json_lote.signature.jades_signing_certificate_reference",
      "unsupported",
      "warning",
      "The protected header references an external signing certificate, but external certificate resolution is not implemented.",
      { referenceNames },
    );
  }
  const der = Buffer.from(certificate, "base64");
  const expectedSha256 = createHash("sha256").update(der).digest("base64url");
  const declaredSha256 = typeof header["x5t#S256"] === "string" ? header["x5t#S256"] : undefined;
  const valid = declaredSha256 === undefined || declaredSha256 === expectedSha256;
  return check(
    "json_lote.signature.jades_signing_certificate_reference",
    valid ? "pass" : "fail",
    valid ? "info" : "critical",
    valid
      ? "The protected certificate-reference service identifies the embedded signing certificate."
      : "The protected x5t#S256 value does not identify the embedded signing certificate.",
    { referenceNames, declaredSha256, expectedSha256 },
  );
}

function validCertificateReferenceSyntax(header: Record<string, unknown>, name: string): boolean {
  const value = header[name];
  if (name === "x5c") return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string");
  if (name === "x5t#S256") return typeof value === "string" && decodeBase64Url(value)?.length === 32;
  if (name === "x5t#o") return validOtherCertificateDigest(value);
  if (name === "sigX5ts") return Array.isArray(value) && value.length >= 2 && value.every(validOtherCertificateDigest);
  return false;
}

function validOtherCertificateDigest(value: unknown): boolean {
  if (!isRecord(value)
    || typeof value.digAlg !== "string"
    || typeof value.digVal !== "string"
    || Object.keys(value).length !== 2
    || !Object.keys(value).every((key) => key === "digAlg" || key === "digVal")
    || !decodeBase64Url(value.digVal)) return false;
  const normalizedAlgorithm = value.digAlg.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalizedAlgorithm !== "sha256";
}

function cryptographicChecks(
  parsed: CompactJadesParseResult,
  algorithm: string | undefined,
  signingCertificate: string | undefined,
): CheckResult[] {
  const supported = algorithm !== undefined && Object.hasOwn(SUPPORTED_ALGORITHMS, algorithm);
  const algorithmCheck = check(
    "json_lote.signature.jades_algorithm",
    supported ? "pass" : algorithm ? "unsupported" : "fail",
    supported ? "info" : "warning",
    supported
      ? `The ${algorithm} JWS algorithm is supported for local verification.`
      : algorithm
        ? `The ${algorithm} JWS algorithm is not supported by this implementation.`
        : "The protected alg header is absent.",
    { algorithm, supportedAlgorithms: Object.keys(SUPPORTED_ALGORITHMS) },
  );
  if (!supported) {
    return [
      algorithmCheck,
      check("json_lote.signature.jades_cryptographic_verification_attempted", "not_checked", "info", "Cryptographic verification was not attempted because the declared algorithm is absent or unsupported."),
      check("json_lote.signature.jades_cryptographic_verification_result", algorithm ? "unsupported" : "not_checked", "warning", "Cryptographic verification has no result because the declared algorithm is absent or unsupported."),
    ];
  }
  if (!signingCertificate || !parsed.signingInput || !parsed.signatureBytes) {
    return [
      algorithmCheck,
      check("json_lote.signature.jades_cryptographic_verification_attempted", "not_checked", "info", "Cryptographic verification was not attempted because signing-certificate or compact-signature bytes are unavailable."),
      check("json_lote.signature.jades_cryptographic_verification_result", "not_checked", "warning", "Cryptographic verification has no result because required verification material is unavailable."),
    ];
  }
  try {
    const certificate = new X509Certificate(Buffer.from(signingCertificate, "base64"));
    const valid = verifyJws(algorithm as SupportedAlgorithm, parsed.signingInput, parsed.signatureBytes, certificate);
    return [
      algorithmCheck,
      check("json_lote.signature.jades_cryptographic_verification_attempted", "pass", "info", "Cryptographic verification was attempted over the original compact JWS signing input."),
      check(
        "json_lote.signature.jades_cryptographic_verification_result",
        valid ? "pass" : "fail",
        valid ? "info" : "critical",
        valid ? "The compact JAdES signature value verifies with the embedded signing certificate." : "The compact JAdES signature value does not verify with the embedded signing certificate.",
        { algorithm, signingInputBytes: parsed.signingInput.length, signatureBytes: parsed.signatureBytes.length },
      ),
    ];
  } catch (error) {
    return [
      algorithmCheck,
      check("json_lote.signature.jades_cryptographic_verification_attempted", "pass", "info", "Cryptographic verification was attempted over the original compact JWS signing input."),
      check("json_lote.signature.jades_cryptographic_verification_result", "fail", "critical", "Cryptographic verification failed while processing the embedded signing certificate or signature value.", { error: error instanceof Error ? error.message : String(error) }),
    ];
  }
}

function verifyJws(algorithm: SupportedAlgorithm, input: Buffer, signature: Buffer, certificate: X509Certificate): boolean {
  const definition = SUPPORTED_ALGORITHMS[algorithm];
  if (definition.kind === "rsa") return verifySignature(definition.digest, input, certificate.publicKey, signature);
  if (definition.kind === "rsa-pss") {
    return verifySignature(definition.digest, input, {
      key: certificate.publicKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    }, signature);
  }
  if (definition.kind === "ecdsa") {
    return verifySignature(definition.digest, input, { key: certificate.publicKey, dsaEncoding: "ieee-p1363" }, signature);
  }
  return verifySignature(null, input, certificate.publicKey, signature);
}

function certificateValidityCheck(certificate: CertificateSummary | undefined, iat: unknown): CheckResult {
  if (!certificate) return check("json_lote.signature.jades_signing_certificate_validity", "not_checked", "info", "Signing-certificate validity was not checked because no parseable signing certificate is available.");
  const claimedTime = Number.isInteger(iat) ? new Date(Number(iat) * 1000) : undefined;
  const notBefore = certificate.notBefore ? new Date(certificate.notBefore) : undefined;
  const notAfter = certificate.notAfter ? new Date(certificate.notAfter) : undefined;
  const validAtClaimedTime = Boolean(claimedTime && notBefore && notAfter && claimedTime >= notBefore && claimedTime <= notAfter);
  const valid = certificate.validAtAssessmentTime === true && (!claimedTime || validAtClaimedTime);
  return check(
    "json_lote.signature.jades_signing_certificate_validity",
    valid ? "pass" : "fail",
    valid ? "info" : "error",
    valid
      ? "The signing certificate is valid at the assessment time and claimed signing time."
      : "The signing certificate is not valid at the assessment time or claimed signing time.",
    { notBefore: certificate.notBefore, notAfter: certificate.notAfter, validAtAssessmentTime: certificate.validAtAssessmentTime, validAtClaimedTime },
  );
}

function signerSubjectCheck(attribute: "country" | "organization", subject: string | undefined, expected: readonly string[] | undefined): CheckResult {
  const id = `json_lote.signature.jades_signer_subject.${attribute}`;
  if (!subject) return check(id, "not_checked", "info", `Signer ${attribute} matching was not checked because no parseable signer subject is available.`);
  if (!expected?.length) return check(id, "not_checked", "info", `Signer ${attribute} matching was not checked because the corresponding scheme metadata is absent.`);
  const observed = distinguishedNameValues(subject, attribute === "country" ? "C" : "O");
  const matches = observed.some((value) => expected.includes(value));
  return check(
    id,
    matches ? "pass" : "fail",
    matches ? "info" : "error",
    matches ? `The signer subject ${attribute} equals the corresponding scheme metadata.` : `The signer subject ${attribute} does not equal the corresponding scheme metadata.`,
    { expected, observed, subject },
  );
}

function signerTrustCheck(fingerprint: string | undefined, trustedFingerprints: readonly string[] | undefined): CheckResult {
  if (trustedFingerprints === undefined) {
    return check(
      "json_lote.signature.jades_signer_trust",
      "not_checked",
      "info",
      "Signer trust was not checked because no explicit trusted signer certificate set was supplied; embedded certificate material is evidence, not a trust decision.",
      fingerprint ? { signerFingerprintSha256: fingerprint } : undefined,
    );
  }
  if (!fingerprint) return check("json_lote.signature.jades_signer_trust", "not_checked", "info", "Signer trust was not checked because no parseable signer certificate is available.");
  const normalized = trustedFingerprints.map((value) => value.toLowerCase());
  const trusted = normalized.includes(fingerprint.toLowerCase());
  return check(
    "json_lote.signature.jades_signer_trust",
    trusted ? "pass" : "fail",
    trusted ? "info" : "error",
    trusted ? "The signer certificate matches an explicitly supplied trusted signer fingerprint." : "The signer certificate does not match any explicitly supplied trusted signer fingerprint.",
    { signerFingerprintSha256: fingerprint, trustedSignerFingerprintsSha256: normalized },
  );
}

function distinguishedNameValues(subject: string, attribute: "C" | "O"): string[] {
  const values: string[] = [];
  const pattern = new RegExp(`(?:^|\\n|,\\s*)${attribute}=((?:\\\\.|[^\\n,])*)`, "g");
  for (const match of subject.matchAll(pattern)) values.push(match[1].trim().replace(/\\\\([,=+<>#;"\\\\])/g, "$1"));
  return values;
}

function decodeBase64Url(value: string): Buffer | undefined {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.toString("base64url") === value ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function jsonEquivalent(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("Value is not JSON-compatible.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function check(
  id: string,
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): CheckResult {
  return { id, category: id.includes("certificate") ? "certificates" : "signature", status, severity, message, evidence };
}
