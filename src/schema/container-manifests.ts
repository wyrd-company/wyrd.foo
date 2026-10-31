// relationships: { implements: publishing, references: site }
import type { KindBlock } from "./docs-file.ts";

export interface ContainerManifests { compose?: string; kubernetes?: string }

/** Authored manifest declarations with their diagnostic path inside kinds. */
export function manifestRefs(kinds: readonly KindBlock[]) {
  return kinds.flatMap((block, index) => {
    const sources: { source: ContainerManifests; field: (string | number)[] }[] =
      block.kind === "devcontainer-image" ? [{ source: block, field: [index] }] :
      block.kind === "app" || block.kind === "cli" ? block.install.flatMap((entry, i) =>
        entry.method === "docker" ? [{ source: entry, field: [index, "install", i] }] : []) : [];
    return sources.flatMap(({ source, field }) =>
      (["compose", "kubernetes"] as const).flatMap((method) =>
        source[method] === undefined ? [] : [{ path: source[method], field: [...field, method] }]));
  });
}
