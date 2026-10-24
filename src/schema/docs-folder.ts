// A product's docs folder: the folder its asset fields (`logo`, `logo-dark`,
// `favicon`, `social-image`, `media[].src`) are relative to, and the folder
// the publisher mirrors to `content/<key>/docs/`. A repo with one docs unit
// keeps its docs at `docs/user/`; a repo with a docs unit per product gives
// each product the folder `docs/user/<key>/`.

/**
 * The product's docs folder, relative to `docs/user/`: `<key>/` when
 * `docs/user/<key>/` holds a file, else `""` (`docs/user/` itself). `paths`
 * are the files under `docs/user/`, relative to it.
 */
export function productDocsFolder(key: string, paths: Iterable<string>): string {
  const folder = `${key}/`;
  for (const path of paths) if (path.startsWith(folder)) return folder;
  return "";
}
