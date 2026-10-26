import { describe, expect, it } from "vitest";
import { tourPosition, tourStep } from "../src/lib/media-tour";

describe("tourStep", () => {
  it("moves to the next and previous item", () => {
    expect(tourStep(1, 1, 3)).toBe(2);
    expect(tourStep(1, -1, 3)).toBe(0);
  });

  it("stops at both ends", () => {
    expect(tourStep(2, 1, 3)).toBeNull();
    expect(tourStep(0, -1, 3)).toBeNull();
  });

  it("has nowhere to go in a tour of one", () => {
    expect(tourStep(0, 1, 1)).toBeNull();
    expect(tourStep(0, -1, 1)).toBeNull();
  });
});

describe("tourPosition", () => {
  it("counts from one", () => {
    expect(tourPosition(0, 8)).toBe("1 of 8");
    expect(tourPosition(2, 8)).toBe("3 of 8");
    expect(tourPosition(7, 8)).toBe("8 of 8");
  });
});
