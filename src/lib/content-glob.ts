import { resolve } from "node:path";
import { glob, type Loader } from "astro/loaders";

/**
 * Astro's glob loader for one content root, which clears the collection when
 * the root changes. The content store outlives a run (`.astro/` in dev, the
 * cache folder in a build) and the glob loader keeps an unchanged entry's
 * cached file path; content/, the dev content folder and test copies hold the
 * same products, so without the clear a run would read the file paths of the
 * root that synced last. A `fingerprint` clears it the same way, for entries
 * whose rendered HTML depends on other files (a docs page's links).
 */
export function contentGlob(
  options: Parameters<typeof glob>[0] & {
    base: string;
    /** A digest of what the entries render from besides their own files; a change clears the collection. */
    fingerprint?: () => string;
  },
): Loader {
  const { fingerprint, ...globOptions } = options;
  const loader = glob(globOptions);
  const root = resolve(options.base);
  return {
    ...loader,
    load: async (context) => {
      const digest = fingerprint?.() ?? "";
      if (context.meta.get("content-root") !== root || context.meta.get("fingerprint") !== digest) {
        context.store.clear();
        context.meta.set("content-root", root);
        context.meta.set("fingerprint", digest);
      }
      return loader.load(context);
    },
  };
}
