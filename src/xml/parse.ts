import { DOMParser } from "@xmldom/xmldom";

export interface XmlParseResult {
  document?: Document;
  errors: string[];
}

export function parseXml(text: string): XmlParseResult {
  const errors: string[] = [];
  const document = new DOMParser({
    onError: (level: "warning" | "error" | "fatalError", message: string) => {
      const prefix = level === "fatalError" ? "fatal" : level;
      errors.push(prefix + ": " + message);
    },
  } as ConstructorParameters<typeof DOMParser>[0]).parseFromString(text, "application/xml") as unknown as Document;

  const parserError = document.getElementsByTagName("parsererror")[0];
  if (parserError?.textContent) {
    errors.push(parserError.textContent.trim());
  }

  return { document, errors };
}
