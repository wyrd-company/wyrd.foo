/*
 * relationships:
 *   implements: site
 * Image install methods use the published reference, without product-specific
 * ports, volumes or command overrides. Product docs own those settings.
 */
import { devcontainerImageSnippet } from "./install-blocks";

export function containerImageOptions(ref: string) {
  // JSON strings are also YAML quoted scalars, including refs with a tag or digest.
  const image = JSON.stringify(ref);
  return [
    {
      id: "devcontainer",
      label: "Dev container",
      instruction: "Use in devcontainer.json",
      code: devcontainerImageSnippet(ref),
    },
    {
      id: "compose",
      label: "Docker Compose",
      instruction: "Save as compose.yaml; add any settings required by the product docs",
      code: `services:\n  app:\n    image: ${image}`,
      command: "docker compose up -d",
    },
    {
      id: "kubernetes",
      label: "Kubernetes",
      instruction: "Save as pod.yaml; add any settings required by the product docs",
      code: `apiVersion: v1\nkind: Pod\nmetadata:\n  name: app\nspec:\n  containers:\n    - name: app\n      image: ${image}`,
      command: "kubectl apply -f pod.yaml",
    },
  ];
}
