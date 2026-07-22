const STATUS_PREFIX = "http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/";
const QUALIFIER_PREFIX = "http://uri.etsi.org/TrstSvc/TrustedList/SvcInfoExt/";
const SERVICE_TYPE_PREFIX = "http://uri.etsi.org/TrstSvc/Svctype/";

export const TS119612_SERVICE_STATUSES = new Set([
  "undersupervision", "supervisionincessation", "supervisionceased", "supervisionrevoked",
  "accredited", "accreditationceased", "accreditationrevoked", "granted", "withdrawn",
  "setbynationallaw", "recognisedatnationallevel", "deprecatedbynationallaw",
  "deprecatedatnationallevel",
].map((value) => `${STATUS_PREFIX}${value}`));

export const TS119612_QUALIFIERS = new Set([
  "QCWithSSCD", "QCNoSSCD", "QCSSCDStatusAsInCert", "QCWithQSCD", "QCNoQSCD",
  "QCQSCDStatusAsInCert", "QCQSCDManagedOnBehalf", "QCForLegalPerson", "QCForESig",
  "QCForESeal", "QCForWSA", "NotQualified", "QCStatement",
].map((value) => `${QUALIFIER_PREFIX}${value}`));

export const TS119612_KEY_USAGE_NAMES = new Set([
  "digitalSignature", "nonRepudiation", "keyEncipherment", "dataEncipherment",
  "keyAgreement", "keyCertSign", "crlSign", "encipherOnly", "decipherOnly",
]);

export const TS119612_ADDITIONAL_INFORMATION = new Set([
  "ForeSignatures", "ForeSeals", "ForWebSiteAuthentication", "RootCA-QC",
].map((value) => `${QUALIFIER_PREFIX}${value}`));

export const EXPIRED_CERT_SERVICE_TYPES = new Set([
  "CA/PKC", "CA/QC", "NationalRootCA-QC", "OCSP", "OCSP/QC", "CRL", "CRL/QC",
].map((value) => `${SERVICE_TYPE_PREFIX}${value}`));

export const CA_SERVICE_TYPES = new Set([
  "CA/PKC", "CA/QC", "NationalRootCA-QC",
].map((value) => `${SERVICE_TYPE_PREFIX}${value}`));

export const CRL_SERVICE_TYPES = new Set([
  "CRL", "CRL/QC",
].map((value) => `${SERVICE_TYPE_PREFIX}${value}`));

export const QUALIFIED_CA_SERVICE_TYPE = `${SERVICE_TYPE_PREFIX}CA/QC`;

export const ADDITIONAL_INFORMATION_INAPPLICABLE_TYPES = new Set([
  `${SERVICE_TYPE_PREFIX}CA/PKC/CertsforOtherTypesOfTS`,
  `${SERVICE_TYPE_PREFIX}PKCValidation/CertsforOtherTypesOfTS`,
]);

export const QUALIFIER_CONFLICTS: ReadonlyArray<readonly [string, string]> = [
  [`${QUALIFIER_PREFIX}QCWithSSCD`, `${QUALIFIER_PREFIX}QCNoSSCD`],
  [`${QUALIFIER_PREFIX}QCWithQSCD`, `${QUALIFIER_PREFIX}QCNoQSCD`],
  [`${QUALIFIER_PREFIX}QCStatement`, `${QUALIFIER_PREFIX}NotQualified`],
];
