/* relationships: { implements: site, references: publishing } */
import type { ContainerManifests } from "../schema/container-manifests";
import type { KindBlock } from "../schema/index";

/** Read published tool-authored YAML; never derive runtime settings from the image ref. */
export function containerImageOptions(
  block: Extract<KindBlock, { kind: "devcontainer-image" }>,
  read: (path: string) => string,
) {
  const options: {
    id: string;
    label: string;
    instruction: string;
    code: string;
    command?: string;
  }[] = [
    {
      id: "devcontainer",
      label: "Dev container",
      instruction: "Use in devcontainer.json",
      code: `"image": ${JSON.stringify(block.ref)}`,
    },
  ];
  return [...options, ...manifestOptions(block, read)];
}

/** Shared app, CLI and dev container manifest rendering contract. */
export function manifestOptions(block: ContainerManifests, read: (path: string) => string) {
  const options: { id: string; label: string; instruction: string; code: string; command: string; path: string }[] = [];
  for (const method of ["compose", "kubernetes"] as const) {
    const path = block[method];
    if (path === undefined) continue;
    // Quote the authored path as one shell argument, including spaces and metacharacters.
    const argument = "'" + path.replaceAll("'", "'\"'\"'") + "'";
    options.push({
      id: method,
      path,
      label: method === "compose" ? "Docker Compose" : "Kubernetes",
      instruction: `Save as ${path}`,
      code: read(path),
      command:
        method === "compose"
          ? `docker compose -f ${argument} up -d`
          : `kubectl apply -f ${argument}`,
    });
  }
  return options;
}
