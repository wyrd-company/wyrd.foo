import { describe, expect, it } from "vitest";
import SiteLayout from "../src/layouts/SiteLayout.astro";
import { render } from "./render";

describe("SiteLayout", () => {
  it("has one header, the content in <main>, and the footer", async () => {
    const root = await render(SiteLayout, { title: "Example" });
    expect(root.querySelectorAll("body > header.site-header")).toHaveLength(1);
    expect(root.querySelectorAll("body > main")).toHaveLength(1);
    expect(root.querySelectorAll("body > footer.site-footer")).toHaveLength(1);
    expect(root.querySelectorAll("dialog.wsearch")).toHaveLength(1);
    expect(root.querySelector(".site-header .wordmark .monogram")?.text).toBe("W");
  });

  it("marks the nav item of the page as current", async () => {
    const root = await render(SiteLayout, { title: "Example", nav: "docs" });
    const current = root.querySelectorAll('.site-nav a[aria-current="page"]');
    expect(current.map((a) => a.text.trim())).toEqual(["Docs"]);
  });

  it("marks no nav item as current when the page names none", async () => {
    const root = await render(SiteLayout, { title: "Example" });
    expect(root.querySelectorAll('.site-nav a[aria-current="page"]')).toHaveLength(0);
  });

  it("links Releases to /releases on a page with no product and on a page of a product", async () => {
    for (const props of [{ title: "Example" }, { title: "Example", product: { key: "example", name: "Example" } }]) {
      const root = await render(SiteLayout, props);
      const releases = root.querySelectorAll(".site-nav a").find((a) => a.text.trim() === "Releases");
      expect(releases?.getAttribute("href")).toBe("/releases");
    }
  });

  it("ranks the page's product first in search", async () => {
    const root = await render(SiteLayout, { title: "Example", product: { key: "example", name: "Example" } });
    const dialog = root.querySelector("dialog.wsearch")!;
    expect(dialog.getAttribute("data-product")).toBe("example");
    expect(dialog.getAttribute("data-product-name")).toBe("Example");
  });

  it("lets a page replace the site header", async () => {
    const { experimental_AstroContainer: AstroContainer } = await import("astro/container");
    const container = await AstroContainer.create({ astroConfig: { site: "https://wyrd.foo" } });
    const html = await container.renderToString(SiteLayout, {
      props: { title: "Example" },
      slots: { header: '<header class="own-header">own</header>' },
    });
    expect(html).toContain('<header class="own-header">own</header>');
    expect(html).not.toContain("site-header");
  });
});
