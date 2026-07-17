# Glossary

These definitions describe terms as used by this audit tool and its planned EUDI trust-infrastructure extensions. They do not replace the governing specifications or a scheme's policy documents.

| Term | Meaning |
|---|---|
| TL | Trusted List: a published list of trust-service information, trust anchors, or related service metadata used as trust-distribution evidence. |
| LoTL | List of Trusted Lists: a list that points to other trusted lists or LoTE artifacts. In this repository, the primary input is a WE BUILD JSON LoTL/LoTE structure. |
| LoTE | List of Trusted Entities: a JSON-oriented list/profile used by the WE BUILD ecosystem. JSON LoTE/LoTL content is distinct from an ETSI TS 119 612 XML TSL. |
| TSL | Trust Service Status List: the XML `TrustServiceStatusList` artifact format associated with ETSI TS 119 612. |
| Access CA | Access Certificate Authority: the certificate authority whose trust anchor is used to validate an access certificate for a technical Relying Party or verifier instance. |
| RPAC / WRPAC | Relying Party Access Certificate / Wallet Relying Party Access Certificate: an end-entity certificate carried by, or used to sign, a verifier or presentation request. It should be assessed as chaining to a relevant Access CA anchor, not as the anchor itself. |
| Registration certificate | Certificate or registrar-issued material describing registration, intended use, registered attributes, entitlement, or policy. It is separate from an access certificate and does not by itself authenticate the technical instance in the access-certificate role. |
| Trust anchor | A certificate, public key, or other explicitly designated trust starting point used to validate a certification path. For the planned RPAC assessment, this is normally an Access CA certificate discovered through TL/LoTE evidence. |
| End-entity certificate | A certificate issued to a leaf subject, such as a Relying Party Instance. It is not a trust anchor unless a fixture explicitly declares a simplified or negative test scenario. |
| FCAF `trusted_authorities` | A FCAF wallet-test trust-mechanism fixture setting that supplies trusted authority information, often through an `etsi_tl`-style mechanism. Planned support maps audited TL/LoTE evidence to whether such test fixtures have the required authority and chain inputs; it does not prove wallet enforcement. |
