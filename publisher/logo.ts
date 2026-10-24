// A logo is a square SVG: its viewBox (else its width and height) has equal
// sides.

/** Why the SVG is not square, or undefined when it is. */
export function squareProblem(svg: Uint8Array): string | undefined {
  const text = new TextDecoder().decode(svg);
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (tag === undefined) return "has no <svg> element";
  const viewBox = attribute(tag, "viewBox");
  if (viewBox !== undefined) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some(Number.isNaN)) return `has a viewBox that is not four numbers: ${viewBox}`;
    const [, , width, height] = parts;
    return width === height ? undefined : `is not square: its viewBox is ${width}x${height}`;
  }
  const width = length(attribute(tag, "width"));
  const height = length(attribute(tag, "height"));
  if (width === undefined || height === undefined) return "has no viewBox, and no numeric width and height";
  return width === height ? undefined : `is not square: it is ${width}x${height}`;
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag)?.slice(1).find((value) => value !== undefined);
}

function length(value: string | undefined): number | undefined {
  const match = value === undefined ? null : /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/.exec(value);
  return match === null ? undefined : Number(match[1]);
}
