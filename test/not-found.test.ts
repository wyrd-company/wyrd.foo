import { describe, expect, it } from "vitest";
import NotFound from "../src/pages/404.astro";
import { render } from "./render";

const notFound = () => render(NotFound, {}, "/404");

describe("404 page", () => {
  it("says the page was not found, in the site's shell", async () => {
    const root = await notFound();
    expect(root.querySelector("title")?.text).toBe("Page not found — Wyrd Tools");
    expect(root.querySelectorAll("h1").map((h) => h.text.trim())).toEqual(["Page not found"]);
    expect(root.querySelectorAll("body > header.site-header")).toHaveLength(1);
    expect(root.querySelectorAll("body > footer.site-footer")).toHaveLength(1);
  });

  it("links home and to the catalog, and opens search", async () => {
    const main = (await notFound()).querySelector("main")!;
    const hrefs = main.querySelectorAll("a").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/#catalog");
    const search = main.querySelectorAll("button[data-wsearch-open]");
    expect(search).toHaveLength(1);
    expect(search[0].getAttribute("type")).toBe("button");
  });

  it("tells crawlers not to index it and names no canonical URL", async () => {
    const root = await notFound();
    expect(root.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
    expect(root.querySelector('link[rel="canonical"]')).toBeNull();
    expect(root.querySelector('meta[property="og:url"]')).toBeNull();
  });

  it("is not a search page", async () => {
    expect((await notFound()).querySelectorAll("[data-pagefind-body]")).toHaveLength(0);
  });
});
