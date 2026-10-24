import { describe, expect, it } from "vitest";
import ProductMark from "../src/components/ProductMark.astro";
import { productAssetUrl } from "../src/lib/product-assets";
import { render } from "./render";

describe("ProductMark", () => {
  it("shows the monogram when the product has no logo", async () => {
    const root = await render(ProductMark, { name: "gadget" });
    expect(root.querySelector(".monogram")?.text).toBe("G");
    expect(root.querySelectorAll("img")).toHaveLength(0);
  });

  it("shows the logo, decorative, at the size of the place it shows", async () => {
    const root = await render(ProductMark, { name: "gadget", logo: "/assets/gadget/logo.svg", size: "card" });
    const img = root.querySelector("img.product-mark-img")!;
    expect(img.getAttribute("src")).toBe("/assets/gadget/logo.svg");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("width")).toBe("44");
    expect(root.querySelector(".monogram")).toBeNull();
  });

  it("adds the dark-theme logo beside the light one", async () => {
    const root = await render(ProductMark, { name: "gadget", logo: "/l.svg", logoDark: "/d.svg" });
    expect(root.querySelector("img.is-light")?.getAttribute("src")).toBe("/l.svg");
    expect(root.querySelector("img.is-dark")?.getAttribute("src")).toBe("/d.svg");
  });
});

describe("productAssetUrl", () => {
  it("serves a docs/user path under /assets/<key>/, each segment encoded", () => {
    expect(productAssetUrl("gadget", "img/my logo.svg")).toBe("/assets/gadget/img/my%20logo.svg");
  });
});
