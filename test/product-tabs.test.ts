import { describe, expect, it } from "vitest";
import { nextTabIndex } from "../src/lib/product-tabs";

describe("nextTabIndex", () => {
  it("moves right and down to the next tab, wrapping at the end", () => {
    expect(nextTabIndex(0, 3, "ArrowRight")).toBe(1);
    expect(nextTabIndex(2, 3, "ArrowRight")).toBe(0);
    expect(nextTabIndex(1, 3, "ArrowDown")).toBe(2);
  });
  it("moves left and up to the previous tab, wrapping at the start", () => {
    expect(nextTabIndex(0, 3, "ArrowLeft")).toBe(2);
    expect(nextTabIndex(2, 3, "ArrowUp")).toBe(1);
  });
  it("moves to the first and last tab with Home and End", () => {
    expect(nextTabIndex(1, 3, "Home")).toBe(0);
    expect(nextTabIndex(1, 3, "End")).toBe(2);
  });
  it("ignores other keys", () => {
    expect(nextTabIndex(1, 3, "Enter")).toBeUndefined();
  });
});
