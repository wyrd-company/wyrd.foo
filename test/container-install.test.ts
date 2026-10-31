// relationships: { implements: site }
import { describe, expect, it } from "vitest";
import { containerImageOptions } from "../src/lib/container-install";

describe("authored image install options", () => {
  const ref = "ghcr.io/example-org/example@sha256:" + "a".repeat(64);
  for (const methods of [
    [],
    ["compose"],
    ["kubernetes"],
    ["compose", "kubernetes"],
  ] as const) {
    it(`shows only declared manifests: ${methods.join(", ")}`, () => {
      const paths = Object.fromEntries(
        methods.map((method) => [method, `install/${method}.yaml`]),
      );
      const reads: string[] = [];
      const options = containerImageOptions(
        { kind: "devcontainer-image", ref, ...paths },
        (path) => {
          reads.push(path);
          return "# authored\nsetting: preserved\n";
        },
      );
      expect(options.map((option) => option.id)).toEqual([
        "devcontainer",
        ...methods,
      ]);
      expect(JSON.parse(`{${options[0].code}}`)).toEqual({ image: ref });
      expect(reads).toEqual(Object.values(paths));
      for (const option of options.slice(1))
        expect(option.code).toBe("# authored\nsetting: preserved\n");
    });
  }
  it("quotes authored filenames for shell commands", () => {
    const [, option] = containerImageOptions(
      {
        kind: "devcontainer-image",
        ref,
        compose: "install/a '$(echo sample).yaml",
      },
      () => "services: {}\n",
    );
    expect(option.command).toBe(
      `docker compose -f 'install/a '"'"'$(echo sample).yaml' up -d`,
    );
  });
});
