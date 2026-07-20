import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SignatureVerificationResult } from "./signature.js";
import { nodes } from "./xpath.js";

const execFileAsync = promisify(execFile);
const DEFAULT_XMLSEC_EXECUTABLE = "xmlsec1";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 1_048_576;

interface XmlsecProcessResult {
  stdout: string;
  stderr: string;
}

export type XmlsecRunner = (
  executable: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<XmlsecProcessResult>;

export interface XmlsecDependencies {
  executable?: string;
  runner?: XmlsecRunner;
  timeoutMs?: number;
}

export interface XmlsecReferenceEvidence {
  uris: string[];
  expectedRootCovered: boolean;
  prohibitedUris: string[];
  root: {
    localName: string;
    namespace?: string;
    idAttribute?: string;
    id?: string;
  };
}

export interface XmlsecVerification extends SignatureVerificationResult {
  referenceEvidence: XmlsecReferenceEvidence;
}

/**
 * Verifies XMLDSig cryptography with xmlsec1 and an explicitly supplied
 * ds:KeyInfo certificate. Certificate trust is deliberately assessed elsewhere.
 */
export async function verifyXmlSignatureWithXmlsec(
  xml: string,
  document: Document,
  signatureNode: Element,
  certificate: string,
  dependencies: XmlsecDependencies = {},
): Promise<XmlsecVerification> {
  const referenceEvidence = inspectReferences(document, signatureNode);
  if (referenceEvidence.prohibitedUris.length > 0) {
    return {
      status: "not_checked",
      attempted: false,
      message: "XMLDSig verification was not attempted because external or unsupported Reference URIs are prohibited.",
      evidence: { backend: "xmlsec1", ...referenceEvidence },
      referenceEvidence,
    };
  }

  const executable = dependencies.executable ?? DEFAULT_XMLSEC_EXECUTABLE;
  const runner = dependencies.runner ?? runXmlsec;
  const timeout = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const directory = await mkdtemp(join(tmpdir(), "we-build-xmlsec-"));
  const xmlPath = join(directory, "artifact.xml");
  const certificatePath = join(directory, "signer.pem");

  try {
    await Promise.all([
      writeFile(xmlPath, xml, { encoding: "utf8", mode: 0o600 }),
      writeFile(certificatePath, pemFromBase64(certificate), { encoding: "utf8", mode: 0o600 }),
    ]);
    const args = verificationArguments(document, certificatePath, xmlPath);
    const version = await xmlsecVersion(executable, runner, timeout);
    try {
      const result = await runner(executable, args, { timeout, maxBuffer: MAX_OUTPUT_BYTES });
      return {
        status: "pass",
        attempted: true,
        message: "XMLDSig cryptographic verification succeeded with xmlsec1.",
        evidence: {
          backend: "xmlsec1",
          version,
          commandPolicy: { referenceUris: ["empty", "same-doc"], explicitSigningCertificate: true },
          output: compactOutput(result),
          ...referenceEvidence,
        },
        referenceEvidence,
      };
    } catch (error) {
      const details = processError(error);
      const unsupported = /not supported|unsupported|disabled during compilation|unknown transform/i.test(`${details.stderr}\n${details.message}`);
      return {
        status: unsupported || details.unavailable || details.timedOut ? "not_checked" : "fail",
        attempted: !details.unavailable,
        message: unsupported
          ? "xmlsec1 could not verify the XMLDSig because an algorithm or transform is unsupported by this build."
          : details.unavailable
            ? "XMLDSig verification was not attempted because the xmlsec1 executable is unavailable."
            : details.timedOut
              ? "XMLDSig verification did not complete before the xmlsec1 timeout."
              : "XMLDSig cryptographic verification failed with xmlsec1.",
        evidence: { backend: "xmlsec1", version, ...details, ...referenceEvidence },
        referenceEvidence,
      };
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function inspectReferences(document: Document, signatureNode: Element): XmlsecReferenceEvidence {
  const root = document.documentElement;
  const idAttribute = ["Id", "ID", "id"].find((name) => root.hasAttribute(name));
  const id = idAttribute ? root.getAttribute(idAttribute) ?? undefined : undefined;
  const uris = nodes(signatureNode, "./*[local-name()='SignedInfo']/*[local-name()='Reference']")
    .map((reference) => (reference as Element).getAttribute("URI") ?? "");
  const prohibitedUris = uris.filter((uri) => uri !== "" && !uri.startsWith("#"));
  return {
    uris,
    expectedRootCovered: uris.some((uri) => uri === "" || Boolean(id && uri === `#${id}`)),
    prohibitedUris,
    root: {
      localName: root.localName || root.nodeName,
      namespace: root.namespaceURI ?? undefined,
      idAttribute,
      id,
    },
  };
}

function verificationArguments(document: Document, certificatePath: string, xmlPath: string): string[] {
  const root = document.documentElement;
  const idAttribute = ["Id", "ID", "id"].find((name) => root.hasAttribute(name));
  const args = [
    "verify",
    "--enabled-reference-uris",
    "empty,same-doc",
    "--pubkey-cert-pem",
    certificatePath,
  ];
  if (idAttribute) {
    const rootName = root.localName || root.nodeName;
    args.push(`--id-attr:${idAttribute}`, root.namespaceURI ? `${root.namespaceURI}:${rootName}` : rootName);
  }
  args.push(xmlPath);
  return args;
}

async function runXmlsec(
  executable: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
): Promise<XmlsecProcessResult> {
  const result = await execFileAsync(executable, args, {
    encoding: "utf8",
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    windowsHide: true,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

async function xmlsecVersion(
  executable: string,
  runner: XmlsecRunner,
  timeout: number,
): Promise<string | undefined> {
  try {
    const result = await runner(executable, ["--version"], { timeout, maxBuffer: MAX_OUTPUT_BYTES });
    return result.stdout.trim() || result.stderr.trim() || undefined;
  } catch {
    return undefined;
  }
}

function processError(error: unknown): {
  message: string;
  code?: string | number;
  signal?: string;
  stdout?: string;
  stderr?: string;
  unavailable: boolean;
  timedOut: boolean;
} {
  const value = error as {
    message?: string;
    code?: string | number;
    signal?: string;
    stdout?: string;
    stderr?: string;
    killed?: boolean;
  };
  return {
    message: value?.message ?? String(error),
    code: value?.code,
    signal: value?.signal,
    stdout: value?.stdout?.trim() || undefined,
    stderr: value?.stderr?.trim() || undefined,
    unavailable: value?.code === "ENOENT",
    timedOut: value?.killed === true || value?.signal === "SIGTERM",
  };
}

function compactOutput(result: XmlsecProcessResult): { stdout?: string; stderr?: string } {
  return {
    stdout: result.stdout.trim() || undefined,
    stderr: result.stderr.trim() || undefined,
  };
}

function pemFromBase64(base64: string): string {
  const clean = base64.replace(/\s+/g, "");
  const lines = clean.match(/.{1,64}/g)?.join("\n") ?? clean;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
}
