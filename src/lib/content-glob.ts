import { resolve } from "node:path";
import { glob, type Loader } from "astro/loaders";

/**
 * Astro's glob loader for one content root, which clears the collection when
 * the root changes. The content store outlives a run (`.astro/` in dev, the
 * cache folder in a build) and the glob loader keeps an unchanged entry's
 * cached file path; content/, the dev content folder and test copies hold the
 * same products, so without the clear a run would read the file paths of the
 * root that synced last.
 */
export function contentGlob(options: Parameters<typeof glob>[0] & { base: string }): Loader {
  const loader = glob(options);
  const root = resolve(options.base);
  return {
    ...loader,
    load: async (context) => {
      if (context.meta.get("content-root") !== root) {
        context.store.clear();
        context.meta.set("content-root", root);
      }
      return loader.load(context);
    },
  };
}
