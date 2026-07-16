import { SignedXml } from "xml-crypto";
import { tryCertificateFromBase64 } from "../certs.js";
import type { CertificateSummary, CheckResult } from "../types.js";
import { has, text } from "./xpath.js";

export interface SignatureAssessment {
  checks: CheckResult[];
  certificates: CertificateSummary[];
}

export function assessSignature(xml: string, document: Document, assessmentDate = new Date()): SignatureAssessment {
  const checks: CheckResult[] = [];
  const certificates: CertificateSummary[] = [];
  const signatureNode = document.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0]
    ?? document.getElementsByTagName("Signature")[0];

  if (!signatureNode) {
    checks.push({
      id: "signature.present",
      category: "signature",
      status: "fail",
      severity: "error",
      message: "No ds:Signature element detected.",
    });
    return { checks, certificates };
  }

  checks.push({
    id: "signature.present",
    category: "signature",
    status: "pass",
    severity: "info",
    message: "ds:Signature element detected.",
  });

  const certText = text(signatureNode, ".//*[local-name()='X509Certificate']");
  const signingCert = certText ? tryCertificateFromBase64(certText, "xml_signature", assessmentDate) : undefined;
  if (signingCert) {
    certificates.push(signingCert);
    checks.push({
      id: "signature.signing_cert_present",
      category: "signature",
      status: "pass",
      severity: "info",
      message: "Embedded signing certificate parsed.",
      evidence: {
        subject: signingCert.subject,
        issuer: signingCert.issuer,
        fingerprintSha256: signingCert.fingerprintSha256,
      },
    });
  } else {
    checks.push({
      id: "signature.signing_cert_present",
      category: "signature",
      status: "warn",
      severity: "warning",
      message: "No parseable embedded ds:X509Certificate found in ds:KeyInfo.",
    });
  }

  checks.push(verifyXmlSignature(xml, signatureNode, certText));

  if (has(document, "//*[local-name()='QualifyingProperties']") || has(document, "//*[local-name()='SignedProperties']")) {
    checks.push({
      id: "xades.qualifying_properties",
      category: "xades",
      status: "pass",
      severity: "info",
      message: "XAdES qualifying properties detected.",
    });
  } else {
    checks.push({
      id: "xades.qualifying_properties",
      category: "xades",
      status: "warn",
      severity: "warning",
      message:
        "XAdES Baseline-B material not detected; XMLDSig presence alone may not satisfy the intended signature profile.",
    });
  }

  return { checks, certificates };
}

function verifyXmlSignature(xml: string, signatureNode: Element, certText?: string): CheckResult {
  if (!certText) {
    return {
      id: "signature.verified",
      category: "signature",
      status: "not_checked",
      severity: "warning",
      message: "XMLDSig verification not checked because no embedded signing certificate was available.",
    };
  }

  try {
    const signature = new SignedXml();
    signature.publicCert = pemFromBase64(certText);
    signature.loadSignature(signatureNode);
    const ok = signature.checkSignature(xml);
    return {
      id: "signature.verified",
      category: "signature",
      status: ok ? "pass" : "fail",
      severity: ok ? "info" : "error",
      message: ok ? "XMLDSig verification succeeded." : "XMLDSig verification failed.",
      evidence: ok ? undefined : (signature as unknown as { validationErrors?: unknown }).validationErrors,
    };
  } catch (error) {
    return {
      id: "signature.verified",
      category: "signature",
      status: "not_checked",
      severity: "warning",
      message: "XMLDSig verification could not be completed with xml-crypto.",
      evidence: error instanceof Error ? error.message : String(error),
    };
  }
}

function pemFromBase64(base64: string): string {
  const clean = base64.replace(/\s+/g, "");
  const lines = clean.match(/.{1,64}/g)?.join("\n") ?? clean;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
}
