import { detectArtifact } from "../detect.js";
import { asArray, getPath } from "../lotl.js";
import { parseXml } from "../xml/parse.js";
import { nodes, text, texts } from "../xml/xpath.js";
import {
  inspectTs119602Identity,
  type Ts119602IdentityMaterial,
} from "./ts119602Identity.js";
import type { Ts119602IdentityObservation } from "./ts119602Entities.js";

export interface Ts119602ContextAddress {
  postalAddresses: Array<{ streetAddress: string; country: string }>;
  electronicAddresses: string[];
}

export interface Ts119602ContextParty extends Ts119602ContextAddress {
  path: string;
  names: string[];
  registrationIdentifiers: string[];
  associatedBodies: string[];
}

export interface Ts119602ContextHistoryState {
  status?: string;
  statusStartingTime?: string;
  identity: Ts119602IdentityMaterial;
}

export interface Ts119602ContextService extends Ts119602ContextHistoryState {
  path: string;
  key: string;
  names: string[];
  typeIdentifier?: string;
  history: Ts119602ContextHistoryState[];
  supplyPoints: string[];
}

export interface Ts119602ContextEntity extends Ts119602ContextParty {
  services: Ts119602ContextService[];
}

export interface Ts119602ContextFacts {
  nextUpdatePresent: boolean;
  nextUpdateNull: boolean;
  historyPeriod?: number;
  schemeOperator?: Ts119602ContextParty;
  entities: Ts119602ContextEntity[];
}

/** Extract only the facts needed by cross-instance and externally evidenced TS 119 602 rules. */
export function extractTs119602ContextFacts(bytes: Buffer, contentType?: string): Ts119602ContextFacts {
  const detected = detectArtifact(bytes, contentType);
  if ((detected.format === "json" || detected.format === "jws") && detected.parsedJson) {
    return jsonFacts(detected.parsedJson);
  }
  if (detected.artifactKind === "xml_lote") return xmlFacts(bytes.toString("utf8"));
  return { nextUpdatePresent: false, nextUpdateNull: false, entities: [] };
}

function jsonFacts(parsed: unknown): Ts119602ContextFacts {
  const info = record(getPath(parsed, ["LoTE", "ListAndSchemeInformation"]));
  const entities = asArray(getPath(parsed, ["LoTE", "TrustedEntitiesList"]));
  const nextUpdatePresent = Object.hasOwn(info, "NextUpdate");
  const schemeAddress = jsonAddress(info.SchemeOperatorAddress, "SchemeOperatorPostalAddress", "SchemeOperatorElectronicAddress");
  return {
    nextUpdatePresent,
    nextUpdateNull: nextUpdatePresent && info.NextUpdate === null,
    historyPeriod: integer(info.HistoricalInformationPeriod),
    schemeOperator: {
      path: "/LoTE/ListAndSchemeInformation/SchemeOperator",
      names: multilingualStrings(info.SchemeOperatorName),
      registrationIdentifiers: [],
      associatedBodies: [],
      ...schemeAddress,
    },
    entities: entities.map((value, entityIndex) => jsonEntity(value, entityIndex)),
  };
}

function jsonEntity(value: unknown, entityIndex: number): Ts119602ContextEntity {
  const entity = record(value);
  const information = record(entity.TrustedEntityInformation);
  const path = `/LoTE/TrustedEntitiesList/${entityIndex}`;
  const names = multilingualStrings(information.TEName);
  const address = jsonAddress(information.TEAddress, "TEPostalAddress", "TEElectronicAddress");
  return {
    path,
    names,
    registrationIdentifiers: multilingualStrings(information.TETradeName).filter(isRegistrationIdentifier),
    associatedBodies: valuesForKey(information.TEInformationExtensions, "AssociatedBodyName"),
    ...address,
    services: asArray(entity.TrustedEntityServices).map((service, serviceIndex) =>
      jsonService(service, `${path}/TrustedEntityServices/${serviceIndex}`, names)),
  };
}

function jsonService(value: unknown, path: string, entityNames: string[]): Ts119602ContextService {
  const service = record(value);
  const information = record(service.ServiceInformation);
  const names = multilingualStrings(information.ServiceName);
  const typeIdentifier = string(information.ServiceTypeIdentifier);
  return {
    path,
    key: serviceKey(entityNames, names, typeIdentifier),
    names,
    typeIdentifier,
    status: string(information.ServiceStatus),
    statusStartingTime: string(information.StatusStartingTime),
    identity: jsonIdentity(information.ServiceDigitalIdentity, `${path}/ServiceInformation/ServiceDigitalIdentity`),
    history: asArray(service.ServiceHistory).map((entry, index) => jsonHistory(entry, `${path}/ServiceHistory/${index}`)),
    supplyPoints: uriStrings(information.ServiceSupplyPoints),
  };
}

function jsonHistory(value: unknown, path: string): Ts119602ContextHistoryState {
  const entry = record(value);
  return {
    status: string(entry.ServiceStatus),
    statusStartingTime: string(entry.StatusStartingTime),
    identity: jsonIdentity(entry.ServiceDigitalIdentity, `${path}/ServiceDigitalIdentity`),
  };
}

function jsonIdentity(value: unknown, path: string): Ts119602IdentityMaterial {
  const identity = record(value);
  return inspectTs119602Identity({
    path,
    present: Object.keys(identity).length > 0,
    certificates: identityValues(identity.X509Certificates, `${path}/X509Certificates`),
    subjectNames: identityValues(identity.X509SubjectNames, `${path}/X509SubjectNames`),
    publicKeys: identityValues(identity.PublicKeyValues, `${path}/PublicKeyValues`, true),
    skis: identityValues(identity.X509SKIs, `${path}/X509SKIs`),
    otherIds: identityValues(identity.OtherIds, `${path}/OtherIds`),
  });
}

function xmlFacts(xml: string): Ts119602ContextFacts {
  const root = parseXml(xml).document?.documentElement;
  if (!root) return { nextUpdatePresent: false, nextUpdateNull: false, entities: [] };
  const info = nodes(root, "./*[local-name()='ListAndSchemeInformation']")[0];
  const nextUpdate = info && nodes(info, "./*[local-name()='NextUpdate']")[0];
  const operatorAddress = info && nodes(info, "./*[local-name()='SchemeOperatorAddress']")[0];
  const entities = nodes(root, "./*[local-name()='TrustedEntitiesList']/*[local-name()='TrustedEntity']");
  return {
    nextUpdatePresent: Boolean(nextUpdate),
    nextUpdateNull: Boolean(nextUpdate && !text(nextUpdate, "./*[local-name()='dateTime']") && !(nextUpdate.textContent?.trim())),
    historyPeriod: integer(info && text(info, "./*[local-name()='HistoricalInformationPeriod']")),
    schemeOperator: info ? {
      path: `${xmlNodePath(info)}/SchemeOperator`,
      names: texts(info, "./*[local-name()='SchemeOperatorName']/*[local-name()='Name']"),
      registrationIdentifiers: [],
      associatedBodies: [],
      ...xmlAddress(operatorAddress, "SchemeOperatorPostalAddress", "SchemeOperatorElectronicAddress"),
    } : undefined,
    entities: entities.map(xmlEntity),
  };
}

function xmlEntity(node: Node): Ts119602ContextEntity {
  const path = xmlNodePath(node);
  const information = nodes(node, "./*[local-name()='TrustedEntityInformation']")[0];
  const names = information ? texts(information, "./*[local-name()='TEName']/*[local-name()='Name']") : [];
  const address = information && nodes(information, "./*[local-name()='TEAddress']")[0];
  return {
    path,
    names,
    registrationIdentifiers: information
      ? texts(information, "./*[local-name()='TETradeName']/*[local-name()='Name']").filter(isRegistrationIdentifier)
      : [],
    associatedBodies: information ? texts(information, ".//*[local-name()='AssociatedBodyName']//*[local-name()='Name']") : [],
    ...xmlAddress(address, "TEPostalAddress", "TEElectronicAddress"),
    services: nodes(node, "./*[local-name()='TrustedEntityServices']/*[local-name()='TrustedEntityService']")
      .map((service) => xmlService(service, names)),
  };
}

function xmlService(node: Node, entityNames: string[]): Ts119602ContextService {
  const path = xmlNodePath(node);
  const information = nodes(node, "./*[local-name()='ServiceInformation']")[0];
  const names = information ? texts(information, "./*[local-name()='ServiceName']/*[local-name()='Name']") : [];
  const typeIdentifier = information && text(information, "./*[local-name()='ServiceTypeIdentifier']");
  const identity = information && nodes(information, "./*[local-name()='ServiceDigitalIdentity']")[0];
  return {
    path,
    key: serviceKey(entityNames, names, typeIdentifier),
    names,
    typeIdentifier,
    status: information && text(information, "./*[local-name()='ServiceStatus']"),
    statusStartingTime: information && text(information, "./*[local-name()='StatusStartingTime']"),
    identity: xmlIdentity(identity, `${path}/ServiceInformation/ServiceDigitalIdentity`),
    history: nodes(node, "./*[local-name()='ServiceHistory']/*[local-name()='ServiceHistoryInstance']").map((entry) => ({
      status: text(entry, "./*[local-name()='ServiceStatus']"),
      statusStartingTime: text(entry, "./*[local-name()='StatusStartingTime']"),
      identity: xmlIdentity(nodes(entry, "./*[local-name()='ServiceDigitalIdentity']")[0], `${xmlNodePath(entry)}/ServiceDigitalIdentity`),
    })),
    supplyPoints: information ? texts(information, "./*[local-name()='ServiceSupplyPoints']/*[local-name()='ServiceSupplyPoint']") : [],
  };
}

function xmlIdentity(node: Node | undefined, path: string): Ts119602IdentityMaterial {
  const observation: Ts119602IdentityObservation = {
    path,
    present: Boolean(node),
    certificates: xmlIdentityValues(node, "X509Certificate"),
    subjectNames: xmlIdentityValues(node, "X509SubjectName"),
    publicKeys: xmlIdentityValues(node, "PublicKeyValue"),
    skis: xmlIdentityValues(node, "X509SKI"),
    otherIds: xmlIdentityValues(node, "OtherId"),
  };
  return inspectTs119602Identity(observation);
}

function xmlIdentityValues(node: Node | undefined, localName: string): Array<{ path: string; value: unknown }> {
  if (!node) return [];
  return nodes(node, `.//*[local-name()='${localName}']`).map((entry) => ({ path: xmlNodePath(entry), value: entry.textContent?.trim() }));
}

function jsonAddress(value: unknown, postalName: string, electronicName: string): Ts119602ContextAddress {
  const address = record(value);
  return {
    postalAddresses: asArray(address[postalName]).map(record).flatMap((entry) => {
      const streetAddress = string(entry.StreetAddress);
      const country = string(entry.Country);
      return streetAddress && country ? [{ streetAddress, country }] : [];
    }),
    electronicAddresses: uriStrings(address[electronicName]),
  };
}

function xmlAddress(node: Node | undefined, postalName: string, electronicName: string): Ts119602ContextAddress {
  if (!node) return { postalAddresses: [], electronicAddresses: [] };
  return {
    postalAddresses: nodes(node, `./*[local-name()='${postalName}']//*[local-name()='PostalAddress']`).flatMap((entry) => {
      const streetAddress = text(entry, "./*[local-name()='StreetAddress']");
      const country = text(entry, "./*[local-name()='Country']");
      return streetAddress && country ? [{ streetAddress, country }] : [];
    }),
    electronicAddresses: texts(node, `./*[local-name()='${electronicName}']//*[local-name()='URI']`),
  };
}

function identityValues(value: unknown, path: string, preserveObject = false): Array<{ path: string; value: unknown }> {
  return asArray(value).map((entry, index) => ({
    path: `${path}/${index}`,
    value: preserveObject && typeof entry === "object" && entry !== null ? entry : stringValue(entry) ?? entry,
  }));
}

function multilingualStrings(value: unknown): string[] {
  return asArray(value).flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    const candidate = record(entry);
    return [candidate.value, candidate.uriValue, candidate.val].filter((item): item is string => typeof item === "string" && item.length > 0);
  });
}

function uriStrings(value: unknown): string[] {
  return asArray(value).flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    const candidate = record(entry);
    return [candidate.uriValue, candidate.value, candidate.val].filter((item): item is string => typeof item === "string" && item.length > 0);
  });
}

function valuesForKey(value: unknown, key: string): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => valuesForKey(entry, key));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([entryKey, entryValue]) =>
    entryKey === key ? multilingualStrings(entryValue) : valuesForKey(entryValue, key));
}

function serviceKey(entityNames: string[], serviceNames: string[], typeIdentifier?: string): string {
  return [entityNames[0] ?? "", typeIdentifier ?? "", serviceNames[0] ?? ""].join("\u0000");
}

function isRegistrationIdentifier(value: string): boolean {
  return /^(?:VAT|NTR|PAS|IDC|PNO|TIN)[A-Z]{2}-.+$/u.test(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const candidate = record(value);
  return [candidate.val, candidate.value, candidate.uriValue].find((entry): entry is string => typeof entry === "string");
}

function string(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function integer(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/u.test(value)) return Number(value);
  return undefined;
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function xmlNodePath(node: Node): string {
  const segments: string[] = [];
  let current: Node | null = node;
  while (current?.nodeType === 1) {
    const element = current as Element;
    let position = 1;
    let sibling = element.previousSibling;
    while (sibling) {
      if (sibling.nodeType === 1 && (sibling as Element).localName === element.localName) position += 1;
      sibling = sibling.previousSibling;
    }
    segments.unshift(`${element.localName}[${position}]`);
    current = element.parentNode;
  }
  return `/${segments.join("/")}`;
}
