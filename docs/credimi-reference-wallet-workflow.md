# Credimi / Reference Wallet / Verifier trust-list workflow

This cookbook turns the audit output into a controlled trust-fixture workflow. It deliberately stops before real wallet behavior testing: wallet acceptance and rejection are external system tests, not claims made by this audit tool.

## 1. Obtain an RPAC through the registration flow

Use the EUDI RI RP Registration Service available in your target environment to generate or obtain the Relying Party Access Certificate (RPAC/WRPAC) and protect its private key according to that environment's operational rules. Record the certificate chain separately from the private key.

Do not treat registration material as the access chain. The registration flow may produce both registration/entitlement evidence and an RPAC; use the RPAC certificate chain for the technical Access CA path.

## 2. Identify the Access CA anchor in a TL or LoTE

Produce or locate a TL/LoTE that contains evidence for the **Access CA trust anchor** that issued, directly or through intermediates, the RPAC/WRPAC. The verifier leaf certificate should remain in the supplied RPAC chain; it should not be installed as a TL/LoTE anchor.

Keep the positive inputs distinct:

```text
TL/LoTE -> Access CA anchor
RPAC chain -> verifier end entity, intermediates, and chain evidence
RPAC private key -> verifier signing operation
```

## 3. Publish or select the TL/LoTE through a LoTL/common trust source

Add the selected TL/LoTE to the LoTL or common trust-source configuration used by the controlled wallet/test environment. Preserve the original location, list type, declared MIME type, and certificate material so the audit can explain later findings.

For deterministic test work, use small owned fixtures or an explicitly selected reference source. Do not modify a fetched live artifact to create a negative case; use the report's negative-fixture descriptors to create a separate test-owned copy or configuration.

## 4. Configure the verifier

Configure the verifier to use the RPAC private key corresponding to the RPAC/WRPAC end-entity certificate. Configure its public certificate chain separately as required by the verifier and target wallet. The audit tool never receives or stores the private key.

If the deployment distinguishes verifier registration from access authorization, configure both according to the environment policy; do not infer access authorization solely from a registration certificate.

## 5. Configure the wallet/test environment

Point the wallet or test harness at the LoTL/common trust source that resolves to the selected TL/LoTE. Confirm which list type, role, and trusted-authorities mechanism the target environment expects. The FCAF readiness matrix identifies implemented prerequisites for cases such as AKI matching, `etsi_tl`, cascading LoTL-to-TL, and RPAC-to-Access-CA chaining.

## 6. Run the audit before behavior tests

CLI example using a local LoTL and an RPAC chain file:

```bash
npm run build
node dist/cli.js \
  --input ./fixtures/list_of_trusted_lists.json \
  --rpac-chain ./fixtures/rpac-chain.pem \
  --include-json-lote-checks \
  --generate-negative-fixtures \
  --out-dir ./audit-output
```

Review `audit-output/report.json` first. In particular, inspect `fixtureReadiness`, `fcafTrustedAuthorities`, and `negativeFixtureDescriptors`. The explicit flag additionally writes compact descriptors below ignored `artifacts/generated-fixtures/`.

API example using raw LoTL file content and an RPAC chain:

```bash
curl -s -X POST http://127.0.0.1:3000/api/audit/fixture-readiness \
  -H 'content-type: application/json' \
  --data "$(jq -n --rawfile lotl ./fixtures/list_of_trusted_lists.json --rawfile chain ./fixtures/rpac-chain.pem \
    '{content: $lotl, rpacChain: $chain, options: {fetch: true, includeJsonLoteChecks: true}}')" | jq
```

For a single artifact supplied without a network fetch:

```bash
curl -s -X POST http://127.0.0.1:3000/api/audit/artifact \
  -H 'content-type: application/json' \
  --data "$(jq -n --rawfile artifact ./fixtures/tl.xml \
    '{content: $artifact, source: "fixture-tl.xml", contentType: "application/xml"}')" | jq '.result'
```

The examples use `jq` only to safely encode file contents into JSON. They do not send the RPAC private key.

## 7. Run wallet behavior tests externally

After the evidence is ready, run the actual presentation-request behavior tests in the Reference Wallet and verifier environments. Cover the positive chain and controlled negatives such as unknown Access CA, expired RPAC, wrong list type, unreachable TL URL, invalid signature, missing anchor, unanchored chain, and missing verifier role.

Record wallet outcomes separately from this report. A report finding of `ready` means the tool found the implemented fixture prerequisites; it does not guarantee a wallet outcome. Similarly, a negative descriptor says how to construct/select a test input, not that a wallet has been tested.
