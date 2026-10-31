// ---
// relationships:
//   implements: site
// ---

/** Context from the published product, never inferred from a route name. */
export interface IssueReportProduct {
  owner: string;
  name: string;
  key: string;
  version: string;
  docsVersion?: string;
  sourcePath?: string;
}

/** A GitHub draft; the visitor reviews and submits it on GitHub. */
export function issueReportUrl(page: string, title: string, product?: IssueReportProduct): string {
  const owner = product?.owner ?? "wyrd-company/wyrd.foo";
  const body = [
    "## Problem",
    "",
    "Describe the problem and what you expected to happen.",
    "",
    "## Page details",
    "",
    `Page: ${page}`,
    `Title: ${title}`,
  ];
  if (product) {
    body.push(`Product: ${product.name} (${product.key})`, `Version: ${product.version}`);
    if (product.docsVersion) body.push(`Docs version: ${product.docsVersion}`);
    if (product.sourcePath) {
      const path = product.sourcePath.split("/").map(encodeURIComponent).join("/");
      body.push(`Source: https://github.com/${owner}/blob/HEAD/${path}`);
    }
  }
  const url = new URL(`https://github.com/${owner}/issues/new`);
  url.searchParams.set("title", `Page problem: ${title}`);
  url.searchParams.set("body", body.join("\n"));
  return url.href;
}
