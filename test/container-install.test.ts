// relationships:
//   implements: site
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { containerImageOptions } from "../src/lib/container-install";

describe("container image install options", () => {
  for (const ref of ["ghcr.io/example-org/example:2", `ghcr.io/example-org/example@sha256:${"a".repeat(64)}`]) {
    it(`preserves ${ref} in each configuration`, () => {
      const [devcontainer, compose, kubernetes] = containerImageOptions(ref);
      expect(JSON.parse(`{${devcontainer.code}}`)).toEqual({ image: ref });
      expect(parse(compose.code)).toEqual({
        services: { app: { image: ref } },
      });
      expect(parse(kubernetes.code)).toEqual({
        apiVersion: "v1",
        kind: "Pod",
        metadata: { name: "app" },
        spec: { containers: [{ name: "app", image: ref }] },
      });
      expect(compose.command).toBe("docker compose up -d");
      expect(kubernetes.command).toBe("kubectl apply -f pod.yaml");
    });
  }
});
