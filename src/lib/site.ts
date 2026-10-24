/* Site-wide navigation: the header nav items. */

export type NavItem = "catalog" | "docs" | "releases";

export const NAV: { id: NavItem; label: string; href: string }[] = [
  { id: "catalog", label: "Catalog", href: "/#catalog" },
  { id: "docs", label: "Docs", href: "/docs/" },
  { id: "releases", label: "Releases", href: "/#releases" },
];
