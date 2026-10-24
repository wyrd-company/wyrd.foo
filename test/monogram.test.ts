import { describe, expect, it } from "vitest";
import Monogram from "../src/components/Monogram.astro";
import { monogramLetter } from "../src/lib/head";
import { render } from "./render";

describe("Monogram component", () => {
  for (const [size, px] of [["row", 28], ["card", 44], ["hero", 72]] as const) {
    it(`renders the first letter on a ${px}px tile for a ${size}`, async () => {
      const tile = (await render(Monogram, { name: "trowel", size })).querySelector(".monogram")!;
      expect(tile.text).toBe("T");
      expect(tile.getAttribute("data-size")).toBe(size);
      expect(tile.getAttribute("style")).toBe(`--monogram-size: ${px}px`);
    });
  }
});

describe("monogramLetter", () => {
  it("takes the first letter or digit of the name, upper case", () => {
    expect(monogramLetter("toha")).toBe("T");
    expect(monogramLetter("@scope/pkg")).toBe("S");
    expect(monogramLetter("3d-tool")).toBe("3");
    expect(monogramLetter("ørsted")).toBe("Ø");
  });
});
