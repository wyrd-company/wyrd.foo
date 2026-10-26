/* Site-wide constants and navigation: the site name and description, the header nav items and the releases pages. */

export const SITE_NAME = "Wyrd Tools";
export const SITE_DESCRIPTION = "Single-purpose tools for developers and the agents that work alongside them.";

export type NavItem = "catalog" | "docs" | "releases";

/** Every product's latest release (docs/technical-designs/site.yml, releases). */
export const RELEASES_HREF = "/releases";

/** One product's releases page: its full changelog. */
export const productReleasesHref = (key: string) => `/tools/${key}/releases`;

/** The header nav. Releases goes to /releases on every page. */
export function nav(): { id: NavItem; label: string; href: string }[] {
  return [
    { id: "catalog", label: "Catalog", href: "/#catalog" },
    { id: "docs", label: "Docs", href: "/docs/" },
    { id: "releases", label: "Releases", href: RELEASES_HREF },
  ];
}
