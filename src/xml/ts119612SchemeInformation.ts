import type { ArtifactKind, CheckResult } from "../types.js";
import {
  validateTs119602CountryCode,
  validateTs119602MultilingualValues,
  validateTs119602Uri,
  validateTs119602UtcDateTime,
} from "../standards/ts119602Syntax.js";
import { nodes } from "./xpath.js";

const EU_GENERIC = "http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUgeneric";
const EU_LOTL = "http://uri.etsi.org/TrstSvc/TrustedList/TSLType/EUlistofthelists";
const EU_STATUS = "http://uri.etsi.org/TrstSvc/TrustedList/StatusDetn/EUappropriate";
const EU_RULES = "http://uri.etsi.org/TrstSvc/TrustedList/schemerules/EUcommon";
const RULES_PREFIX = "http://uri.etsi.org/TrstSvc/TrustedList/schemerules/";
const TYPE_PREFIX = "http://uri.etsi.org/TrstSvc/TrustedList/TSLType/";
const STATUS_PREFIX = "http://uri.etsi.org/TrstSvc/TrustedList/StatusDetn/";
const EXPIRED = "http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/expired";
const XML_LANG = "http://www.w3.org/XML/1998/namespace";

const CHILD_ORDER = [
  "TSLVersionIdentifier", "TSLSequenceNumber", "TSLType", "SchemeOperatorName",
  "SchemeOperatorAddress", "SchemeName", "SchemeInformationURI",
  "StatusDeterminationApproach", "SchemeTypeCommunityRules", "SchemeTerritory",
  "PolicyOrLegalNotice", "HistoricalInformationPeriod", "PointersToOtherTSL",
  "ListIssueDateTime", "NextUpdate", "DistributionPoints", "SchemeExtensions",
] as const;

type SchemeContext = "eu_member" | "eu_lotl" | "non_eu_registered" | "custom";
type Artifact = Extract<ArtifactKind, "ts119612_xml_tsl" | "ts119612_xml_lotl">;

export function assessTs119612SchemeInformation(document: Document, artifactKind: Artifact): CheckResult[] {
  const root = document.documentElement;
  const schemes = namedChildren(root, "SchemeInformation");
  const checks = [result(
    "structure.scheme_information.root_cardinality",
    "structure",
    schemes.length === 1,
    "Exactly one SchemeInformation element is a direct child of TrustServiceStatusList.",
    "TrustServiceStatusList shall contain exactly one direct SchemeInformation child.",
    { observedCount: schemes.length, expectedCount: 1 },
    "critical",
  )];
  const scheme = schemes[0];
  if (!scheme) return checks;

  const direct = children(scheme);
  const values = readValues(scheme);
  const context = classifyContext(values.type, values.territory);
  checks.push(
    cardinalityCheck(direct, context, scheme.namespaceURI),
    orderCheck(direct),
    result("ts119612.scheme.version", "profile", values.version === "6",
      "TSLVersionIdentifier is the exact integer value 6.",
      "TSLVersionIdentifier shall be represented as the exact integer value 6.", values.version),
    result("ts119612.scheme.sequence.local", "profile", Boolean(values.sequence && /^[1-9]\d*$/.test(values.sequence)),
      "TSLSequenceNumber is a positive integer.",
      "TSLSequenceNumber shall be a positive integer; progression requires a supplied prior list.",
      { value: values.sequence ?? null, progressionChecked: false }),
    typeCheck(values.type, values.territory, artifactKind, context),
    multilingualCheck("ts119612.scheme.operator_name", child(scheme, "SchemeOperatorName"), "Name", false,
      "Scheme operator name", "Formal legal-name equivalence requires authoritative registration evidence."),
    addressCheck(child(scheme, "SchemeOperatorAddress")),
    schemeNameCheck(child(scheme, "SchemeName"), values.territory),
    multilingualCheck("ts119612.scheme.information_uri", child(scheme, "SchemeInformationURI"), "URI", true,
      "Scheme information URI", "Referenced scheme-information content was not fetched."),
    statusCheck(values.status, values.territory, context),
    rulesCheck(child(scheme, "SchemeTypeCommunityRules"), values.territory, context),
    territoryCheck(values.territory),
    policyCheck(child(scheme, "PolicyOrLegalNotice")),
    result("ts119612.scheme.history_period", "profile", values.historyPeriod === "65535",
      "HistoricalInformationPeriod is 65535, requiring history never to be removed.",
      "HistoricalInformationPeriod shall be the exact integer value 65535.", values.historyPeriod),
    issueCheck(values.issue),
    nextUpdateCheck(document, child(scheme, "NextUpdate"), values.issue),
    distributionCheck(child(scheme, "DistributionPoints")),
    extensionsCheck(child(scheme, "SchemeExtensions"), context),
  );
  return checks;
}

function cardinalityCheck(elements: Element[], context: SchemeContext, namespace: string | null): CheckResult {
  const counts = Object.fromEntries(CHILD_ORDER.map((name) => [
    name, elements.filter((element) => local(element) === name && element.namespaceURI === namespace).length,
  ]));
  const expected: Record<string, { min: number; max: number }> = Object.fromEntries(
    CHILD_ORDER.map((name) => [name, { min: 1, max: 1 }]),
  );
  expected.PointersToOtherTSL.min = context === "eu_member" || context === "eu_lotl" ? 1 : 0;
  expected.DistributionPoints.min = 0;
  expected.SchemeExtensions.min = 0;
  expected.SchemeExtensions.max = context === "eu_member" || context === "eu_lotl" ? 0 : 1;
  const unexpected = elements.filter((element) => (
    element.namespaceURI !== namespace
    || !(CHILD_ORDER as readonly string[]).includes(local(element))
  ));
  const violations: Array<{ name: string; observed: number; expected: { min: number; max: number } }> = [];
  Object.entries(expected).forEach(([name, range]) => {
    const observed = counts[name] ?? 0;
    if (observed < range.min || observed > range.max) violations.push({ name, observed, expected: range });
  });
  unexpected.forEach((element) => violations.push({
    name: element.namespaceURI === namespace
      ? local(element)
      : `{${element.namespaceURI ?? ""}}${local(element)}`,
    observed: 1,
    expected: { min: 0, max: 0 },
  }));
  return result(
    "structure.scheme_information.child_cardinality", "structure", violations.length === 0,
    "Direct SchemeInformation children satisfy normative cardinalities.",
    "Direct SchemeInformation child cardinality does not satisfy clause 5.3.",
    { context, counts, violations }, "critical",
  );
}

function orderCheck(elements: Element[]): CheckResult {
  const observed = elements.map(local);
  const positions = observed
    .filter((name) => (CHILD_ORDER as readonly string[]).includes(name))
    .map((name) => CHILD_ORDER.indexOf(name as typeof CHILD_ORDER[number]));
  const valid = positions.every((position, index) => index === 0 || position >= positions[index - 1]);
  return result(
    "structure.scheme_information.child_order", "structure", valid,
    "Direct SchemeInformation children follow the normative Annex C order.",
    "Direct SchemeInformation children are out of normative Annex C order.",
    { expectedOrder: CHILD_ORDER, observedOrder: observed }, "critical",
  );
}

function typeCheck(value: string | undefined, territory: string | undefined, artifact: Artifact, context: SchemeContext): CheckResult {
  const uri = validateTs119602Uri(value);
  if (uri.outcome !== "valid") return result(
    "ts119612.scheme.type", "profile", false, "",
    "TSLType shall be a non-empty absolute RFC 3986 URI.",
    { value: value ?? null, diagnostics: uri.diagnostics },
  );
  if (context === "custom") return check(
    "ts119612.scheme.type", "profile", "inconclusive", "warning",
    "TSLType is absolute, but local evidence cannot establish that the custom URI is defined or registered.",
    { value, territory: territory ?? null, registryChecked: false },
  );
  const expectsLotl = context === "eu_lotl" || value?.endsWith("listofthelists");
  const territoryConsistent = context === "eu_member"
    ? Boolean(territory && territory !== "EU" && territory.length === 2
      && validateTs119602CountryCode(territory).outcome === "valid")
    : context !== "eu_lotl" || territory === "EU";
  return result(
    "ts119612.scheme.type", "profile",
    (expectsLotl ? artifact === "ts119612_xml_lotl" : artifact === "ts119612_xml_tsl")
      && territoryConsistent,
    "TSLType is locally recognized and consistent with the selected list kind and territory.",
    "TSLType is inconsistent with the selected Trusted List/List of Trusted Lists kind or SchemeTerritory.",
    { value, territory: territory ?? null, artifactKind: artifact, context, territoryConsistent },
  );
}

function addressCheck(address: Element | undefined): CheckResult {
  if (!address) return result(
    "ts119612.scheme.operator_address", "profile", false, "",
    "SchemeOperatorAddress is missing from its direct normative position.",
  );
  const violations: string[] = [];
  const addressNames = children(address).map(local);
  if (addressNames.join(",") !== "PostalAddresses,ElectronicAddress") {
    violations.push("SchemeOperatorAddress shall contain exactly PostalAddresses followed by ElectronicAddress.");
  }
  const postalEntries = child(address, "PostalAddresses")
    ? namedChildren(child(address, "PostalAddresses") as Element, "PostalAddress")
    : [];
  if (postalEntries.length === 0) violations.push("PostalAddresses shall contain at least one PostalAddress.");
  const postalLanguages: Array<{ language: unknown; value: unknown }> = [];
  postalEntries.forEach((postal, index) => {
    const names = children(postal).map(local);
    const expected = ["StreetAddress", "Locality", "StateOrProvince", "PostalCode", "CountryName"];
    const positions = names.map((name) => expected.indexOf(name));
    if (
      positions.some((position) => position < 0)
      || positions.some((position, childIndex) => childIndex > 0 && position < positions[childIndex - 1])
    ) violations.push("PostalAddress " + (index + 1) + " has unexpected or out-of-order children.");
    ["StreetAddress", "Locality", "CountryName"].forEach((name) => {
      const items = namedChildren(postal, name);
      if (items.length !== 1 || !text(items[0])) {
        violations.push("PostalAddress " + (index + 1) + " shall contain exactly one non-empty " + name + ".");
      }
    });
    ["StateOrProvince", "PostalCode"].forEach((name) => {
      const items = namedChildren(postal, name);
      if (items.length > 1 || items.some((item) => !text(item))) {
        violations.push("PostalAddress " + (index + 1) + " may contain at most one non-empty " + name + ".");
      }
    });
    const country = text(child(postal, "CountryName"));
    const countryResult = validateTs119602CountryCode(country);
    if (countryResult.outcome !== "valid" || !country || country.length !== 2) {
      violations.push("PostalAddress " + (index + 1) + " CountryName shall use a clause 5.1.5(a) two-character code.");
    }
    postalLanguages.push({
      language: language(postal),
      value: children(postal).map(text).filter(Boolean).join(" "),
    });
  });
  const postalSyntax = validateTs119602MultilingualValues(postalLanguages);
  violations.push(...postalSyntax.diagnostics.map((item) => "Postal address: " + item.message));

  const electronicUris = child(address, "ElectronicAddress")
    ? namedChildren(child(address, "ElectronicAddress") as Element, "URI")
    : [];
  if (electronicUris.length < 2 || electronicUris.length > 3) {
    violations.push("ElectronicAddress shall contain email and website URIs, followed by at most one telephone URI.");
  }
  electronicUris.forEach((element, index) => {
    const uri = validateTs119602Uri(text(element));
    const scheme = uri.classification;
    if (uri.outcome !== "valid") {
      violations.push("ElectronicAddress URI " + (index + 1) + " is not an absolute RFC 3986 URI.");
    } else if (
      index === 0 && scheme !== "mailto"
      || index === 1 && scheme !== "http" && scheme !== "https"
      || index === 2 && scheme !== "tel"
      || index > 2
    ) {
      violations.push("ElectronicAddress URI " + (index + 1) + " does not use the required ordered URI scheme.");
    }
  });
  const electronicSyntax = validateTs119602MultilingualValues(electronicUris.map((element) => ({
    language: language(element),
    value: text(element),
  })));
  violations.push(...electronicSyntax.diagnostics.map((item) => "Electronic address: " + item.message));
  return result(
    "ts119612.scheme.operator_address", "profile", violations.length === 0,
    "SchemeOperatorAddress has ordered postal and electronic contact structures with valid local syntax.",
    "SchemeOperatorAddress does not satisfy locally decidable clause 5.3.5 structure and syntax.",
    {
      postalAddressCount: postalEntries.length,
      electronicUriCount: electronicUris.length,
      violations,
      operationalContactEvidenceChecked: false,
    },
  );
}

function schemeNameCheck(container: Element | undefined, territory: string | undefined): CheckResult {
  const syntax = multilingualSyntax(container, "Name", false);
  const values = container ? namedChildren(container, "Name").map(text) : [];
  const prefix = territory ? territory + ":" : undefined;
  const prefixesValid = Boolean(prefix)
    && values.every((value) => value?.startsWith(prefix as string) && value.length > (prefix as string).length);
  return result(
    "ts119612.scheme.name", "profile", syntax.valid && prefixesValid,
    "SchemeName has valid multilingual values using the SchemeTerritory prefix.",
    "Each SchemeName shall be non-empty, include English, and use the CC:name structure matching SchemeTerritory.",
    {
      territory: territory ?? null,
      values,
      diagnostics: syntax.diagnostics,
      formalNameAndUniquenessChecked: false,
    },
  );
}

function multilingualCheck(
  id: string,
  container: Element | undefined,
  itemName: string,
  uriValues: boolean,
  label: string,
  limitation: string,
): CheckResult {
  const syntax = multilingualSyntax(container, itemName, uriValues);
  return result(
    id, "profile", syntax.valid,
    label + " has valid non-empty English-capable multilingual values.",
    label + " shall contain non-empty " + itemName + " values with valid language tags"
      + (uriValues ? " and absolute URIs." : "."),
    { diagnostics: syntax.diagnostics, limitation },
  );
}

function multilingualSyntax(
  container: Element | undefined,
  itemName: string,
  uriValues: boolean,
): { valid: boolean; diagnostics: string[] } {
  if (!container) return { valid: false, diagnostics: ["The container is missing."] };
  const all = children(container);
  const items = namedChildren(container, itemName);
  const diagnostics: string[] = [];
  if (all.length !== items.length) diagnostics.push("Only direct " + itemName + " children are allowed.");
  const multilingual = validateTs119602MultilingualValues(items.map((item) => ({
    language: language(item),
    value: text(item),
  })));
  diagnostics.push(...multilingual.diagnostics.map((item) => item.message));
  items.forEach((item, index) => {
    if (children(item).length > 0) diagnostics.push(itemName + " " + (index + 1) + " shall have simple text content.");
    if (uriValues) {
      const uri = validateTs119602Uri(text(item));
      diagnostics.push(...uri.diagnostics.map((entry) => itemName + " " + (index + 1) + ": " + entry.message));
    }
  });
  return { valid: diagnostics.length === 0, diagnostics };
}

function statusCheck(value: string | undefined, territory: string | undefined, context: SchemeContext): CheckResult {
  const uri = validateTs119602Uri(value);
  if (uri.outcome !== "valid") return result(
    "ts119612.scheme.status_determination", "profile", false, "",
    "StatusDeterminationApproach shall be an absolute RFC 3986 URI.",
    { value: value ?? null, diagnostics: uri.diagnostics },
  );
  if (context === "eu_member" || context === "eu_lotl") return result(
    "ts119612.scheme.status_determination", "profile", value === EU_STATUS,
    "EU StatusDeterminationApproach uses the registered EUappropriate URI.",
    "EU StatusDeterminationApproach shall use the registered EUappropriate URI.", value,
  );
  const registered = territory ? STATUS_PREFIX + territory + "determination" : undefined;
  if (context === "non_eu_registered" && value === registered) return result(
    "ts119612.scheme.status_determination", "profile", true,
    "Non-EU StatusDeterminationApproach matches SchemeTerritory.", "", value,
  );
  return check(
    "ts119612.scheme.status_determination", "profile", "inconclusive", "warning",
    "StatusDeterminationApproach is absolute, but custom definition or registration was not established locally.",
    { value, expectedRegisteredValue: registered ?? null, registryChecked: false },
  );
}

function rulesCheck(container: Element | undefined, territory: string | undefined, context: SchemeContext): CheckResult {
  const syntax = multilingualSyntax(container, "URI", true);
  const values = container
    ? namedChildren(container, "URI").map(text).filter((value): value is string => Boolean(value))
    : [];
  const violations = [...syntax.diagnostics];
  if (context === "eu_member" || context === "eu_lotl") {
    if (!values.includes(EU_RULES)) violations.push("EU scheme rules shall include the EUcommon URI.");
    if (context === "eu_member" && territory) {
      const national = RULES_PREFIX + territory;
      const nationalIndex = values.findIndex((value) => value === national || value.startsWith(national + "/"));
      const commonIndex = values.indexOf(EU_RULES);
      if (nationalIndex < 0) violations.push("EU Member State scheme rules shall include " + national + " or a sub-URI.");
      if (commonIndex >= 0 && nationalIndex >= 0 && nationalIndex < commonIndex) {
        violations.push("EUcommon shall precede the country-specific policy subset.");
      }
    }
  }
  return result(
    "ts119612.scheme.community_rules", "profile", violations.length === 0,
    "SchemeTypeCommunityRules has valid ordered multilingual URI evidence.",
    "SchemeTypeCommunityRules does not satisfy local URI, language, or EU ordering rules.",
    {
      context,
      values,
      violations,
      referencedPolicyContentChecked: false,
      policySubsetRelationshipChecked: false,
    },
  );
}

function territoryCheck(value: string | undefined): CheckResult {
  const validation = validateTs119602CountryCode(value);
  if (validation.outcome === "inconclusive") return check(
    "ts119612.scheme.territory", "profile", "inconclusive", "warning",
    "SchemeTerritory is an uppercase grouping candidate whose recognition is not established locally.",
    { value: value ?? null, diagnostics: validation.diagnostics },
  );
  return result(
    "ts119612.scheme.territory", "profile", validation.outcome === "valid",
    "SchemeTerritory uses a locally recognized clause 5.1.5 code.",
    "SchemeTerritory does not use a valid clause 5.1.5 country or grouping code.",
    { value: value ?? null, classification: validation.classification, diagnostics: validation.diagnostics },
  );
}

function policyCheck(container: Element | undefined): CheckResult {
  if (!container) return result(
    "ts119612.scheme.policy_or_legal_notice", "profile", false, "",
    "PolicyOrLegalNotice is missing from its direct normative position.",
  );
  const direct = children(container);
  const names = new Set(direct.map(local));
  const validChoice = direct.length > 0
    && names.size === 1
    && (names.has("TSLPolicy") || names.has("TSLLegalNotice"));
  const itemName = names.has("TSLPolicy") && names.size === 1 ? "TSLPolicy" : "TSLLegalNotice";
  const syntax = multilingualSyntax(container, itemName, itemName === "TSLPolicy");
  return result(
    "ts119612.scheme.policy_or_legal_notice", "profile", validChoice && syntax.valid,
    "PolicyOrLegalNotice uses one multilingual policy-pointer or legal-notice alternative.",
    "PolicyOrLegalNotice shall use either TSLPolicy pointers or TSLLegalNotice strings without mixing.",
    {
      observedChildren: direct.map(local),
      diagnostics: syntax.diagnostics,
      referencedOrLegalContentAuthorityChecked: false,
    },
  );
}

function issueCheck(value: string | undefined): CheckResult {
  const validation = validateTs119602UtcDateTime(value);
  return result(
    "ts119612.scheme.issue_time", "profile", validation.outcome === "valid",
    "ListIssueDateTime uses the required UTC seconds lexical form.",
    "ListIssueDateTime shall use YYYY-MM-DDThh:mm:ssZ with a valid calendar value.",
    { value: value ?? null, diagnostics: validation.diagnostics, issuanceEventConsistencyChecked: false },
  );
}

function nextUpdateCheck(document: Document, container: Element | undefined, issueValue: string | undefined): CheckResult {
  if (!container) return result(
    "ts119612.scheme.next_update", "profile", false, "",
    "NextUpdate is missing from its direct normative position.",
  );
  const dateTimes = namedChildren(container, "dateTime");
  const unexpected = children(container).filter((element) => (
    local(element) !== "dateTime" || element.namespaceURI !== container.namespaceURI
  ));
  if (dateTimes.length > 1 || unexpected.length > 0) return result(
    "ts119612.scheme.next_update", "profile", false, "",
    "NextUpdate shall contain at most one dateTime child and no other elements.",
    { dateTimeCount: dateTimes.length, unexpectedChildren: unexpected.map(local) },
  );
  if (dateTimes.length === 0) {
    const statuses = nodes(
      document,
      ".//*[local-name()='ServiceInformation']/*[local-name()='ServiceStatus']",
    )
      .filter((node): node is Element => (
        node.nodeType === 1 && (node as Element).namespaceURI === document.documentElement.namespaceURI
      ))
      .map((node) => node.textContent?.trim()).filter((value): value is string => Boolean(value));
    const nonExpired = statuses.filter((status) => status !== EXPIRED);
    return result(
      "ts119612.scheme.next_update", "profile", nonExpired.length === 0,
      "NextUpdate is null for a closed TL and every observed current service status is expired.",
      "A null NextUpdate is permitted only for a final closed TL whose current service statuses are all expired.",
      { closed: true, observedServiceStatusCount: statuses.length, nonExpiredStatuses: nonExpired },
    );
  }
  const nextValue = text(dateTimes[0]);
  const issue = strictDate(issueValue);
  const next = strictDate(nextValue);
  const limit = issue ? addMonths(issue, 6) : undefined;
  const valid = Boolean(issue && next && next > issue && limit && next <= limit);
  return result(
    "ts119612.scheme.next_update", "profile", valid,
    "NextUpdate is after issuance and no later than six calendar months after ListIssueDateTime.",
    "NextUpdate shall use strict UTC syntax, follow ListIssueDateTime, and not exceed six calendar months.",
    {
      closed: false,
      issue: issueValue ?? null,
      nextUpdate: nextValue ?? null,
      sixCalendarMonthLimit: limit?.toISOString() ?? null,
    },
  );
}

function distributionCheck(container: Element | undefined): CheckResult {
  if (!container) return check(
    "ts119612.scheme.distribution_points", "structure", "not_applicable", "info",
    "DistributionPoints is optional and is not present.",
  );
  const direct = children(container);
  const uris = namedChildren(container, "URI");
  const diagnostics = uris.flatMap((element, index) => validateTs119602Uri(text(element)).diagnostics
    .map((item) => "URI " + (index + 1) + ": " + item.message));
  return result(
    "ts119612.scheme.distribution_points", "profile",
    direct.length > 0 && direct.length === uris.length && diagnostics.length === 0,
    "DistributionPoints is a non-empty sequence of absolute URIs.",
    "DistributionPoints shall contain only a non-empty sequence of absolute RFC 3986 URIs.",
    { values: uris.map(text), diagnostics, dereferencingAndBinaryEqualityChecked: false },
  );
}

function extensionsCheck(container: Element | undefined, context: SchemeContext): CheckResult {
  const eu = context === "eu_member" || context === "eu_lotl";
  if (!container) return result(
    "ts119612.scheme.extensions", "profile", true,
    eu ? "SchemeExtensions is correctly absent in the EU context." : "Optional SchemeExtensions is absent.",
    "", { context, extensionCount: 0 },
  );
  const direct = children(container);
  const extensions = namedChildren(container, "Extension");
  const invalidCriticality: number[] = [];
  const unknownCritical: number[] = [];
  extensions.forEach((extension, index) => {
    const critical = extension.getAttribute("Critical") ?? "";
    if (!["true", "false", "1", "0"].includes(critical)) invalidCriticality.push(index + 1);
    if (critical === "true" || critical === "1") unknownCritical.push(index + 1);
  });
  const valid = !eu
    && direct.length > 0
    && direct.length === extensions.length
    && invalidCriticality.length === 0
    && unknownCritical.length === 0;
  return result(
    "ts119612.scheme.extensions", "profile", valid,
    "SchemeExtensions contains only locally acceptable non-critical extensions.",
    eu
      ? "SchemeExtensions shall not be present in the EU context."
      : "Each Extension shall have boolean Critical; every unrecognized critical extension causes rejection.",
    {
      context,
      extensionCount: extensions.length,
      invalidCriticality,
      unknownCritical,
      recognizedExtensionCount: 0,
    },
  );
}

function readValues(scheme: Element): {
  version?: string;
  sequence?: string;
  type?: string;
  territory?: string;
  status?: string;
  historyPeriod?: string;
  issue?: string;
} {
  return {
    version: text(child(scheme, "TSLVersionIdentifier")),
    sequence: text(child(scheme, "TSLSequenceNumber")),
    type: text(child(scheme, "TSLType")),
    territory: text(child(scheme, "SchemeTerritory")),
    status: text(child(scheme, "StatusDeterminationApproach")),
    historyPeriod: text(child(scheme, "HistoricalInformationPeriod")),
    issue: text(child(scheme, "ListIssueDateTime")),
  };
}

function classifyContext(type: string | undefined, territory: string | undefined): SchemeContext {
  if (type === EU_GENERIC) return "eu_member";
  if (type === EU_LOTL) return "eu_lotl";
  if (
    territory
    && (type === TYPE_PREFIX + territory + "list" || type === TYPE_PREFIX + territory + "listofthelists")
  ) return "non_eu_registered";
  return "custom";
}

function strictDate(value: string | undefined): Date | undefined {
  return validateTs119602UtcDateTime(value).outcome === "valid" ? new Date(value as string) : undefined;
}

function addMonths(value: Date, months: number): Date {
  const monthIndex = value.getUTCMonth() + months;
  const year = value.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year,
    month,
    Math.min(value.getUTCDate(), lastDay),
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
  ));
}

function children(parent: Node, name?: string, namespace?: string): Element[] {
  return Array.from(parent.childNodes)
    .filter((node): node is Element => node.nodeType === 1)
    .filter((element) => !name || local(element) === name)
    .filter((element) => !namespace || element.namespaceURI === namespace);
}

function namedChildren(parent: Element, name: string): Element[] {
  return children(parent, name, parent.namespaceURI ?? undefined);
}

function child(parent: Node, name: string): Element | undefined {
  return parent.nodeType === 1 ? namedChildren(parent as Element, name)[0] : children(parent, name)[0];
}

function local(element: Element): string {
  return element.localName || element.nodeName.split(":").at(-1) as string;
}

function text(element: Element | undefined): string | undefined {
  const value = element?.textContent?.trim();
  return value || undefined;
}

function language(element: Element): string | null {
  return element.getAttributeNS(XML_LANG, "lang") ?? element.getAttribute("xml:lang");
}

function result(
  id: string,
  category: CheckResult["category"],
  valid: boolean,
  passMessage: string,
  failMessage: string,
  evidence?: unknown,
  failureSeverity: Extract<CheckResult["severity"], "critical" | "error"> = "error",
): CheckResult {
  return check(id, category, valid ? "pass" : "fail", valid ? "info" : failureSeverity, valid ? passMessage : failMessage, evidence);
}

function check(
  id: string,
  category: CheckResult["category"],
  status: CheckResult["status"],
  severity: CheckResult["severity"],
  message: string,
  evidence?: unknown,
): CheckResult {
  return { id, category, status, severity, message, evidence };
}
