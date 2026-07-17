# EUDI trust model for this audit tool

This guide explains the trust-material relationships the tool can describe. It is an engineering guide, not a substitute for an EUDI scheme, ETSI specification, wallet policy, certificate policy, or legal assessment.

## The artifacts have different jobs

| Item | Purpose in this workflow | What it is not |
|---|---|---|
| LoTL | A directory that points to one or more TL/LoTE artifacts. | It is not itself every trust anchor a wallet will use. |
| TL | A trusted-list artifact, commonly ETSI XML, that carries trust-service and certificate evidence. | It is not automatically proof that every listed end entity is trusted for every use. |
| LoTE | A JSON-oriented list of trusted entities used by a profile such as WE BUILD. | It is not an ETSI TS 119 612 XML `TrustServiceStatusList`. |
| Access CA | The CA whose anchor is expected to validate an RPAC/WRPAC access-certificate chain. | It is not the verifier's leaf certificate. |
| RPAC / WRPAC | The verifier/Relying Party Instance's end-entity access certificate and associated private key. | It is not a TL/LoTE trust anchor. |
| Registration certificate | Registration or entitlement material that may establish registered attributes or policy context. | It is not interchangeable with an RPAC access certificate. |

The intended relationship is:

```text
LoTL or common trust source
  -> selected TL / LoTE
      -> Access CA trust anchor
          -> RPAC / WRPAC end-entity certificate
              -> verifier signs a presentation request with the RPAC private key
```

## Keep the verifier certificate out of the anchor slot

The key operational rule is simple: place or identify the **Access CA trust anchor** in the applicable TL/LoTE, then supply the verifier's RPAC/WRPAC as a chain that terminates at that anchor. Do not put the verifier's end-entity RPAC/WRPAC certificate directly into a TL/LoTE as though it were an Access CA anchor.

Doing so confuses two separate roles and can hide a broken chain-building setup. A leaf certificate may be useful evidence for a controlled negative fixture, but it is not a substitute for an independently identified CA anchor in the positive path.

Registration material is separate as well. It may explain why a Relying Party is registered or entitled, while the RPAC access certificate is the technical credential that the verifier uses to authenticate/sign. A successful registration check is not a successful access-chain check, and vice versa.

## XML TS 119 612 and JSON LoTE checks are separate

ETSI TS 119 612 is an XML trusted-list format. When this tool detects XML `TrustServiceStatusList` content, it runs the implemented structural, date, signature/certificate-evidence, service-metadata, and optional local-XSD checks.

JSON LoTE/LoTL-style content is not XML TS 119 612 content. The report marks TS 119 612 as `not_applicable` for that artifact and can run the implemented JSON LoTE / TS 119 602-style / WE BUILD profile checks when requested. A passing result in one track does not imply a passing result in the other.

## What the report can establish

The report can preserve and assess evidence such as:

- LoTL pointers, fetched locations, hashes, MIME types, and fetch failures;
- detected artifact types and standard/profile applicability;
- implemented XML or JSON structure/profile checks;
- available embedded or pointer-certificate metadata;
- whether an optional supplied RPAC/WRPAC chain parses, is structurally consistent, and matches separately supplied candidate pointer-anchor material;
- EUDI fixture readiness, FCAF `trusted_authorities` readiness, and deterministic negative-fixture descriptors.

It can therefore help answer whether a bundle has the implemented technical prerequisites for a controlled wallet/verifier fixture.

## What the report cannot establish

The report does not by itself:

- make a legal, regulatory, or full normative ETSI conformance determination;
- make an Access CA trusted merely because a certificate is embedded in an artifact;
- replace a wallet's trust-policy, role, revocation, or status-validation implementation;
- perform CRL/OCSP revocation validation (reported as `not_checked` where relevant);
- prove that a reference wallet accepts or rejects a presentation request;
- create presentation requests, configure a verifier, or protect an RPAC private key.

Use the report as evidence before running behavior tests in the actual wallet and verifier environments.
