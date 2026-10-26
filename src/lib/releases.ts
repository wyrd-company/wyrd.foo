/*
 * What /releases lists: every product with a release and a latest changelog
 * entry, newest release first. A feature entry is listed once it has both.
 */
import { releasesNewestFirst, type HomeEntry, type RecentRelease } from "./home.ts";

/** `withEntry` holds the keys of the products whose changelog has an entry. */
export function releaseListings(entries: readonly HomeEntry[], withEntry: ReadonlySet<string>): RecentRelease[] {
  return releasesNewestFirst(entries, (entry) => withEntry.has(entry.key));
}
