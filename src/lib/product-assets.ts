/** The URL of a product asset: a path relative to docs/user/, served from content/<key>/docs/. */
export function productAssetUrl(key: string, path: string): string {
  return `/assets/${key}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
