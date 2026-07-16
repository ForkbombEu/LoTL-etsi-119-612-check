import xpath from "xpath";

export function firstNode(context: Node, expression: string): Node | undefined {
  const nodes = xpath.select(expression, context) as Node[];
  return nodes[0];
}

export function nodes(context: Node, expression: string): Node[] {
  return xpath.select(expression, context) as Node[];
}

export function text(context: Node, expression: string): string | undefined {
  const node = firstNode(context, expression);
  const value = node?.textContent?.trim();
  return value || undefined;
}

export function texts(context: Node, expression: string): string[] {
  return nodes(context, expression)
    .map((node) => node.textContent?.trim())
    .filter((value): value is string => Boolean(value));
}

export function has(context: Node, expression: string): boolean {
  return nodes(context, expression).length > 0;
}

export const L = (name: string): string => `*[local-name()='${name}']`;
export const D = (name: string): string => `.//*[local-name()='${name}']`;
