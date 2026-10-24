/* Site-wide navigation: the header nav items. */

export type NavItem = "catalog" | "docs" | "releases";

/**
 * The header nav. On a product page and its docs pages (`product` is the
 * product key), Releases goes to the product page's Releases section; on
 * every other page, to the home page's Recent releases list.
 */
export function nav(product?: string): { id: NavItem; label: string; href: string }[] {
  return [
    { id: "catalog", label: "Catalog", href: "/#catalog" },
    { id: "docs", label: "Docs", href: "/docs/" },
    { id: "releases", label: "Releases", href: product ? `/tools/${product}#releases` : "/#releases" },
  ];
}
