/**
 * ASC CDL interchange files, read and written as text. New code (CG5).
 *
 * Reads the three ASC CDL XML forms: a single `ColorCorrection` (`.cc`), a
 * `ColorCorrectionCollection` (`.ccc`) and a `ColorDecisionList` of
 * `ColorDecision`s (`.cdl`). Only the parts that carry values are read: each
 * correction's `id`, its first `Description` and its `SOPNode`
 * (`Slope`, `Offset`, `Power`) and `SatNode` (`Saturation`; `SATNode` is also
 * accepted); other elements are skipped. A missing `SOPNode` or `SatNode`
 * reads as neutral; a node that is present must be complete.
 *
 * Values round-trip exactly: each number is written as the shortest decimal
 * that reads back as the same float64 (`String(number)` digits, never an
 * exponent), so re-exporting an export is byte-identical.
 *
 * The XML reader is deliberately small (no DTDs, processing instructions
 * other than the declaration, or CDATA) and DOM-free, so it runs in the
 * browser and in Node.
 */
import { ColorScienceError } from "./errors.ts";
import type { Cdl } from "./cdl.ts";
import type { Rgb } from "./matrix.ts";

export type CdlFileKind = "cc" | "ccc" | "cdl";
export type CdlCorrection = {
  id?: string;
  description?: string;
  cdl: Cdl;
};
export type CdlDocument = {
  kind: CdlFileKind;
  corrections: CdlCorrection[];
};

type XmlElement = {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
};

const fail = (message: string): never => {
  throw new ColorScienceError(`ASC CDL: ${message}`);
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (match, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x"
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff)
        fail(`invalid character reference ${match}`);
      return String.fromCodePoint(code);
    }
    const value = ENTITIES[name];
    if (value === undefined) fail(`unknown entity ${match}`);
    return value!;
  });
}
const encode = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Local name: namespace prefixes are ignored. */
const local = (name: string) => name.slice(name.indexOf(":") + 1);

function parseXml(text: string): XmlElement {
  const source = text.replace(/^﻿/, "");
  const root: XmlElement = { name: "", attributes: {}, children: [], text: "" };
  const stack: XmlElement[] = [root];
  const token =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[|<!|<\/?[^<>]*>|[^<]+/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = token.exec(source))) {
    consumed = token.lastIndex;
    const part = match[0];
    if (part.startsWith("<!--")) continue;
    if (part.startsWith("<?")) {
      if (stack.length > 1 || root.children.length || !/^<\?xml\s/.test(part))
        fail("only an XML declaration may come before the root element");
      continue;
    }
    if (part.startsWith("<!"))
      fail("DTDs and CDATA sections are not supported");
    const top = stack.at(-1)!;
    if (!part.startsWith("<")) {
      top.text += decode(part);
      continue;
    }
    if (part.startsWith("</")) {
      const name = part.slice(2, -1).trim();
      if (stack.length < 2 || name !== top.name)
        fail(`unexpected closing tag </${name}>`);
      stack.pop();
      continue;
    }
    const body =
      /^<([A-Za-z_][\w.:-]*)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>$/.exec(
        part,
      );
    if (!body) fail(`malformed tag ${part.slice(0, 60)}`);
    const attributes: Record<string, string> = {};
    for (const attribute of body![2]!.matchAll(
      /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
    ))
      attributes[local(attribute[1]!)] = decode(
        attribute[2] ?? attribute[3] ?? "",
      );
    const element: XmlElement = {
      name: body![1]!,
      attributes,
      children: [],
      text: "",
    };
    if (stack.length === 1 && root.children.length)
      fail("more than one root element");
    top.children.push(element);
    if (!body![3]) stack.push(element);
  }
  if (consumed !== source.length) fail("unreadable XML");
  if (stack.length > 1) fail(`<${stack.at(-1)!.name}> is not closed`);
  if (root.text.trim()) fail("text outside the root element");
  if (root.children.length !== 1) fail("no root element");
  return root.children[0]!;
}

const children = (element: XmlElement, name: string) =>
  element.children.filter((child) => local(child.name) === name);
const child = (element: XmlElement, ...names: string[]) =>
  element.children.find((c) => names.includes(local(c.name)));

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
function numbers(element: XmlElement, count: number, where: string): number[] {
  const parts = element.text.trim().split(/\s+/).filter(Boolean);
  const values = parts.map(Number);
  if (
    parts.length !== count ||
    !parts.every((part) => NUMBER.test(part)) ||
    !values.every(Number.isFinite)
  )
    fail(
      `${where} ${local(element.name)} needs ${count} finite number${count > 1 ? "s" : ""}, found "${element.text.trim()}"`,
    );
  return values;
}

function readCorrection(element: XmlElement, where: string): CdlCorrection {
  const sop = child(element, "SOPNode");
  const sat = child(element, "SatNode", "SATNode");
  const triple = (name: string, neutral: number): Rgb => {
    if (!sop) return [neutral, neutral, neutral];
    const node = child(sop, name);
    if (!node) fail(`${where} SOPNode has no ${name}`);
    return numbers(node!, 3, where) as unknown as Rgb;
  };
  let saturation = 1;
  if (sat) {
    const node = child(sat, "Saturation");
    if (!node) fail(`${where} SatNode has no Saturation`);
    saturation = numbers(node!, 1, where)[0]!;
  }
  const description =
    child(element, "Description") ??
    (sop ? child(sop, "Description") : undefined);
  const id = element.attributes.id;
  return {
    ...(id === undefined ? {} : { id }),
    ...(description ? { description: description.text.trim() } : {}),
    cdl: {
      slope: triple("Slope", 1),
      offset: triple("Offset", 0),
      power: triple("Power", 1),
      saturation,
    },
  };
}

/** Read a `.cc`, `.ccc` or `.cdl` file (the root element decides which). */
export function parseCdlXml(text: string): CdlDocument {
  const root = parseXml(text);
  const name = local(root.name);
  if (
    child(root, "ColorCorrectionRef") ||
    root.children.some((c) => child(c, "ColorCorrectionRef"))
  )
    fail("ColorCorrectionRef (a reference to another file) is not supported");
  if (name === "ColorCorrection")
    return {
      kind: "cc",
      corrections: [readCorrection(root, "ColorCorrection")],
    };
  const list =
    name === "ColorCorrectionCollection"
      ? children(root, "ColorCorrection")
      : name === "ColorDecisionList"
        ? children(root, "ColorDecision").flatMap((decision) => {
            const corrections = children(decision, "ColorCorrection");
            if (corrections.length !== 1)
              fail("each ColorDecision needs exactly one ColorCorrection");
            return corrections;
          })
        : fail(
            `the root element must be ColorCorrection, ColorCorrectionCollection or ColorDecisionList, not ${name}`,
          );
  if (!list.length) fail(`${name} has no ColorCorrection`);
  return {
    kind: name === "ColorCorrectionCollection" ? "ccc" : "cdl",
    corrections: list.map((element, index) =>
      readCorrection(element, `ColorCorrection ${index + 1}`),
    ),
  };
}

/** The shortest exact decimal of a float64, without an exponent. */
export function cdlNumber(value: number): string {
  if (!Number.isFinite(value)) fail(`${value} is not a finite number`);
  if (Object.is(value, -0) || value === 0) return "0";
  const text = String(value);
  const match = /^(-?)(\d)(?:\.(\d+))?e([-+]\d+)$/.exec(text);
  if (!match) return text;
  const [, sign, lead, rest = "", power] = match;
  const digits = lead! + rest;
  const exponent = Number(power);
  if (exponent < 0) return `${sign}0.${"0".repeat(-exponent - 1)}${digits}`;
  return `${sign}${digits.padEnd(exponent + 1, "0")}`;
}

function writeCorrection(correction: CdlCorrection, indent: string): string[] {
  const { cdl } = correction;
  const list = (values: readonly number[]) => values.map(cdlNumber).join(" ");
  const id =
    correction.id === undefined ? "" : ` id="${encode(correction.id)}"`;
  return [
    `${indent}<ColorCorrection${id}>`,
    `${indent}  <SOPNode>`,
    ...(correction.description === undefined
      ? []
      : [
          `${indent}    <Description>${encode(correction.description)}</Description>`,
        ]),
    `${indent}    <Slope>${list(cdl.slope)}</Slope>`,
    `${indent}    <Offset>${list(cdl.offset)}</Offset>`,
    `${indent}    <Power>${list(cdl.power)}</Power>`,
    `${indent}  </SOPNode>`,
    `${indent}  <SatNode>`,
    `${indent}    <Saturation>${cdlNumber(cdl.saturation)}</Saturation>`,
    `${indent}  </SatNode>`,
    `${indent}</ColorCorrection>`,
  ];
}

/** Deterministic ASC CDL XML (v1.01 namespace) for `document.kind`. */
export function writeCdlXml(document: CdlDocument): string {
  const { kind, corrections } = document;
  if (!corrections.length) fail("nothing to write: no corrections");
  if (kind === "cc" && corrections.length !== 1)
    fail(".cc holds exactly one ColorCorrection; use .ccc or .cdl for more");
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
  if (kind === "cc") {
    const [first, ...rest] = writeCorrection(corrections[0]!, "");
    lines.push(
      first!.replace(
        "<ColorCorrection",
        '<ColorCorrection xmlns="urn:ASC:CDL:v1.01"',
      ),
      ...rest,
    );
  } else if (kind === "ccc")
    lines.push(
      '<ColorCorrectionCollection xmlns="urn:ASC:CDL:v1.01">',
      ...corrections.flatMap((c) => writeCorrection(c, "  ")),
      "</ColorCorrectionCollection>",
    );
  else
    lines.push(
      '<ColorDecisionList xmlns="urn:ASC:CDL:v1.01">',
      ...corrections.flatMap((c) => [
        "  <ColorDecision>",
        ...writeCorrection(c, "    "),
        "  </ColorDecision>",
      ]),
      "</ColorDecisionList>",
    );
  return lines.join("\n") + "\n";
}

/** The file kind for a path's extension, or undefined. */
export function cdlFileKind(path: string): CdlFileKind | undefined {
  const match = /\.(cc|ccc|cdl)$/i.exec(path);
  return match ? (match[1]!.toLowerCase() as CdlFileKind) : undefined;
}
