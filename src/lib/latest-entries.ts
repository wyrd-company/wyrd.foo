/*
 * The latest release entry of each product's code changelog,
 * `<root>/<key>/CHANGELOG.md`: its first `## <version>` section
 * (src/lib/changelog.ts). The product page's Releases section and /releases
 * show it. The entry's body renders through the site's Markdown pipeline as
 * the changelog itself does, with its headings nested and their ids prefixed
 * `changelog--<key>--` (src/lib/embedded-headings.ts).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Loader, LoaderContext } from "astro/loaders";
import { latestEntry } from "./changelog.ts";
import { PREFIX_SEPARATOR, withEmbeddedUnit } from "./embedded-headings.ts";

const CHANGELOG = "CHANGELOG.md";

/** The heading id prefix of a product's latest entry. */
export const latestEntryUnit = (key: string) => `changelog${PREFIX_SEPARATOR}${key}`;

/** One entry per product with a changelog that has an entry; its id is the product key and its data the version text. */
export function latestEntries(base: string): Loader {
  const root = resolve(base);
  const isChangelog = (path: string) => {
    const parts = relative(root, resolve(path)).split(sep);
    return parts.length === 2 && parts[0] !== ".." && parts[1] === CHANGELOG;
  };

  async function sync(context: LoaderContext) {
    context.store.clear();
    const keys = existsSync(root)
      ? readdirSync(root, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name)
          .sort()
      : [];
    for (const key of keys) {
      const file = join(root, key, CHANGELOG);
      if (!existsSync(file)) continue;
      const entry = latestEntry(readFileSync(file, "utf8"));
      if (!entry) continue;
      // Rendered as the changelog file, so the heading step and relative links read it as that file.
      const rendered = await context.renderMarkdown(withEmbeddedUnit(entry.body, latestEntryUnit(key)), {
        fileURL: pathToFileURL(file),
      });
      const data = await context.parseData({ id: key, data: { version: entry.version } });
      context.store.set({
        id: key,
        data,
        body: entry.body,
        rendered,
        filePath: relative(process.cwd(), file),
        digest: context.generateDigest({ ...entry }),
      });
    }
  }

  return {
    name: "latest-entries",
    load: async (context) => {
      await sync(context);
      const watcher = context.watcher;
      if (!watcher) return;
      watcher.add(root);
      const onChange = (path: string) => {
        if (isChangelog(path)) void sync(context);
      };
      watcher.on("add", onChange);
      watcher.on("change", onChange);
      watcher.on("unlink", onChange);
    },
  };
}
