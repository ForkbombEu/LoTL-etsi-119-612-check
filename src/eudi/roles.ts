export type EudiTrustRole =
  | "wallet_provider"
  | "pid_provider"
  | "qeaa_provider"
  | "pub_eaa_provider"
  | "access_ca_or_wrpac_provider"
  | "registration_ca_or_wrprc_provider"
  | "registrar_or_register";

export const EUDI_TRUST_ROLES: readonly EudiTrustRole[] = [
  "wallet_provider",
  "pid_provider",
  "qeaa_provider",
  "pub_eaa_provider",
  "access_ca_or_wrpac_provider",
  "registration_ca_or_wrprc_provider",
  "registrar_or_register",
] as const;

export function isAccessCertificateRole(role: EudiTrustRole | undefined): boolean {
  return role === "access_ca_or_wrpac_provider";
}
