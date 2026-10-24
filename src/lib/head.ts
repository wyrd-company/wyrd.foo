/*
 * What the shared head writes for a page: favicon and social image.
 *
 * A product page and its docs pages use the product's own favicon and social
 * image. When the product has no favicon the page uses its logo, then its
 * monogram; when it has no social image the page uses the site image
 * (REDESIGN.md, "Favicon and social image"). Pages with no product (home,
 * catalog) use the site's own favicon and image.
 */

/** Product fields the head reads. Asset values are URLs the page can serve. */
export interface HeadProduct {
  name: string;
  logo?: string;
  favicon?: string;
  socialImage?: string;
}

export interface Favicon {
  href: string;
  type: string;
}

export const SITE_FAVICON: Favicon = { href: "/favicon.svg", type: "image/svg+xml" };
export const SITE_SOCIAL_IMAGE = "/social.png";

/** Colours of the monogram favicon: the dark theme's "W" tile. */
const MONOGRAM_TILE = "#6aa5ff";
const MONOGRAM_TEXT = "#0b0b0c";

/** First letter or digit of a name, upper case. */
export function monogramLetter(name: string): string {
  const match = name.match(/[\p{L}\p{N}]/u);
  return (match ? match[0] : name.trim().charAt(0) || "?").toLocaleUpperCase("en");
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A square SVG of the monogram tile, for use as a favicon. */
export function monogramSvg(name: string): string {
  const letter = escapeXml(monogramLetter(name));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="4.57" fill="${MONOGRAM_TILE}"/>` +
    `<text x="16" y="16" dy=".35em" text-anchor="middle" fill="${MONOGRAM_TEXT}" ` +
    `font-family="Geist Mono, ui-monospace, monospace" font-size="19" font-weight="600">${letter}</text>` +
    `</svg>`
  );
}

export function monogramDataUri(name: string): string {
  return `data:image/svg+xml,${encodeURIComponent(monogramSvg(name))}`;
}

function iconType(href: string): string {
  const path = href.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  throw new Error(`favicon must be SVG or PNG: ${href}`);
}

export function resolveFavicon(product?: HeadProduct): Favicon {
  if (!product) return SITE_FAVICON;
  if (product.favicon) return { href: product.favicon, type: iconType(product.favicon) };
  if (product.logo) return { href: product.logo, type: "image/svg+xml" };
  return { href: monogramDataUri(product.name), type: "image/svg+xml" };
}

export function resolveSocialImage(product?: HeadProduct): string {
  return product?.socialImage ?? SITE_SOCIAL_IMAGE;
}
