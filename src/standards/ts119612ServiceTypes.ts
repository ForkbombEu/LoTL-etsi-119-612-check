export const TS119612_SERVICE_TYPE_PREFIX = "http://uri.etsi.org/TrstSvc/Svctype/";
export const TS119612_NATIONAL_ROOT_SERVICE_TYPE = `${TS119612_SERVICE_TYPE_PREFIX}NationalRootCA-QC`;
export const TS119612_UNSPECIFIED_SERVICE_TYPE = `${TS119612_SERVICE_TYPE_PREFIX}unspecified`;

const QUALIFIED_TYPE_PATHS = [
  "CA/QC", "Certstatus/OCSP/QC", "Certstatus/CRL/QC", "TSA/QTST", "EDS/Q",
  "EDS/REM/Q", "PSES/Q", "QESValidation/Q", "RemoteQSigCDManagement/Q",
  "RemoteQSealCDManagement/Q", "EAA/Q", "ElectronicArchiving/Q", "Ledgers/Q",
] as const;
const NON_QUALIFIED_TYPE_PATHS = [
  "CA/PKC", "Certstatus/OCSP", "Certstatus/CRL", "TSA", "TSA/TSS-QC",
  "TSA/TSS-AdESQCandQES", "EDS", "EDS/REM", "PSES", "AdESValidation",
  "AdESGeneration", "RemoteSigCDManagement", "RemoteSealCDManagement", "EAA",
  "ElectronicArchiving", "Ledgers", "PKCValidation", "PKCPreservation",
  "EAAValidation", "TSTValidation", "EDSValidation", "EAA/Pub-EAA",
  "CA/PKC/CertsforOtherTypesOfTS", "PKCValidation/CertsforOtherTypesOfTS",
] as const;
const NATIONAL_TYPE_PATHS = [
  "RA", "RA/nothavingPKIid", "ACA", "SignaturePolicyAuthority", "Archiv",
  "Archiv/nothavingPKIid", "IdV", "IdV/nothavingPKIid", "KEscrow",
  "KEscrow/nothavingPKIid", "PPwd", "PPwd/nothavingPKIid", "TLIssuer",
  "NationalRootCA-QC", "unspecified",
] as const;
const PKI_OPTIONAL_TYPE_PATHS = [
  "RemoteQSigCDManagement/Q", "RemoteQSealCDManagement/Q", "Ledgers/Q",
  "AdESGeneration", "RemoteSigCDManagement", "RemoteSealCDManagement", "Ledgers",
  "unspecified",
] as const;

export const TS119612_SERVICE_TYPE_REGISTRY = Object.freeze({
  qualified: qualify(QUALIFIED_TYPE_PATHS),
  nonQualified: qualify(NON_QUALIFIED_TYPE_PATHS),
  national: qualify(NATIONAL_TYPE_PATHS),
});

export type Ts119612ServiceTypeClass = "qualified" | "non_qualified" | "national" | "custom";

const QUALIFIED_TYPES = new Set(TS119612_SERVICE_TYPE_REGISTRY.qualified);
const NON_QUALIFIED_TYPES = new Set(TS119612_SERVICE_TYPE_REGISTRY.nonQualified);
const NATIONAL_TYPES = new Set(TS119612_SERVICE_TYPE_REGISTRY.national);
const PKI_OPTIONAL_TYPES = new Set(qualify(PKI_OPTIONAL_TYPE_PATHS));

export function classifyTs119612ServiceType(value: string | undefined): Ts119612ServiceTypeClass {
  if (value && QUALIFIED_TYPES.has(value)) return "qualified";
  if (value && NON_QUALIFIED_TYPES.has(value)) return "non_qualified";
  if (value && NATIONAL_TYPES.has(value)) return "national";
  return "custom";
}

export function isTs119612PkiOptionalServiceType(value: string | undefined): boolean {
  return Boolean(value && PKI_OPTIONAL_TYPES.has(value));
}

function qualify(paths: readonly string[]): readonly string[] {
  return Object.freeze(paths.map((path) => TS119612_SERVICE_TYPE_PREFIX + path));
}
