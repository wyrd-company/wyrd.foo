// relationships: { implements: site }
import { describe, expect, it } from "vitest";
import { issueReportUrl } from "../src/lib/issue-report";
import SiteLayout from "../src/layouts/SiteLayout.astro";
import { render } from "./render";

describe("page issue drafts", () => {
  it("opens a site issue with the page title and URL, preserving reserved characters", () => {
    const url = new URL(issueReportUrl("https://example.org/docs/sample", "Setup & use #1?"));
    expect(url.origin + url.pathname).toBe("https://github.com/wyrd-company/wyrd.foo/issues/new");
    expect(url.searchParams.get("title")).toBe("Page problem: Setup & use #1?");
    expect(url.searchParams.get("body")).toContain("Page: https://example.org/docs/sample");
    expect(url.searchParams.get("body")).toContain("Title: Setup & use #1?");
    expect(url.searchParams.get("body")).toContain("expected to happen");
  });

  it("uses the owning repo with product versions and an encoded source-file link", () => {
    const url = new URL(issueReportUrl("https://example.org/tools/sample", "Sample", {
      owner: "example-org/samples", name: "Sample", key: "sample", version: "1.2.3", docsVersion: "0.2.0",
      sourcePath: "docs/user/sample/guides/setup & use.md",
    }));
    expect(url.pathname).toBe("/example-org/samples/issues/new");
    const body = url.searchParams.get("body")!;
    expect(body).toContain("Product: Sample (sample)\nVersion: 1.2.3\nDocs version: 0.2.0");
    expect(body).toContain("Source: https://github.com/example-org/samples/blob/HEAD/docs/user/sample/guides/setup%20%26%20use.md");
  });

  it("keeps the site report available beside a product report without query or fragment context", async () => {
    const root = await render(SiteLayout, {
      title: "Sample",
      reportProduct: { owner: "example-org/samples", name: "Sample", key: "sample", version: "1.0.0" },
    }, "/tools/sample?private=value#install");
    const links = root.querySelectorAll('.site-footer a[href*="/issues/new"]');
    expect(links.map((a) => a.text)).toEqual(["Report a problem with Sample", "Report a site problem"]);
    for (const link of links) {
      const body = new URL(link.getAttribute("href")!).searchParams.get("body")!;
      expect(body).toContain("Page: https://wyrd.foo/tools/sample\n");
      expect(body).not.toContain("private");
      expect(body).not.toContain("#install");
    }
  });
});
