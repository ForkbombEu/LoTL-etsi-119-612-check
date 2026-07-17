import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { tryCertificateFromBase64 } from "../src/certs.js";

describe("certificate parsing", () => {
  it("parses the EC pointer certificates in the WE BUILD LoTL fixture", async () => {
    const document = JSON.parse(await readFile("test/fixtures/list_of_trusted_lists.json", "utf8")) as {
      LoTE: { ListAndSchemeInformation: { PointersToOtherLoTE: Array<{ ServiceDigitalIdentities: Array<{ X509Certificates: Array<{ val: string }> }> }> } };
    };
    const values = document.LoTE.ListAndSchemeInformation.PointersToOtherLoTE
      .flatMap((pointer) => pointer.ServiceDigitalIdentities)
      .flatMap((identity) => identity.X509Certificates)
      .map((certificate) => certificate.val);
    const parsed = values.map((value) => tryCertificateFromBase64(value, "pointer", new Date("2026-08-01T00:00:00Z")));
    expect(parsed).toHaveLength(10);
    expect(parsed.every(Boolean)).toBe(true);
    expect(parsed[0]).toMatchObject({ subject: expect.stringContaining("WEBUILD"), fingerprintSha256: expect.any(String) });
  });
});
