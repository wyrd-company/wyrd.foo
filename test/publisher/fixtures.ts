import {
  appKind,
  changelog,
  cliKind,
  intentional,
  page,
  product,
  SQUARE_SVG,
  yaml,
  type Files,
  type TagSpec,
} from "./fixture-repo.ts";

// The fixture repos of the publisher tests. Names are generic samples.

/** Two products in one map, one with two kinds, each with its own docs folder and docs unit. */
export function alphaFiles(options: { withApp?: boolean } = {}): Files {
  const withApp = options.withApp ?? true;
  const products: Record<string, unknown> = {
    "alpha-cli": product("alpha-cli", [cliKind], {
      logo: "assets/logo.svg",
      nav: [{ section: "Start", groups: [{ group: "Basics", pages: ["getting-started", "deep"] }] }],
    }),
  };
  if (withApp) {
    products["alpha-app"] = product(
      "alpha-app",
      [appKind, { kind: "devcontainer-feature", ref: "ghcr.io/sample-org/alpha/alpha-app:0" }],
      { version: "0.3.0" },
    );
  }
  const units: Parameters<typeof intentional>[0] = {
    "alpha-cli": { path: "cli", template: "{id}@{version}" },
    "alpha-cli-docs": { path: "docs/user/alpha-cli", template: "{id}@{version}" },
    "alpha-app": { path: "app", template: "{id}@{version}" },
    "alpha-app-docs": { path: "docs/user/alpha-app", template: "{id}@{version}" },
  };
  return {
    "docs/user/docs.yml": yaml({
      schemaVersion: 1,
      assets: ["assets/demo.svg", "assets/logo.svg", "assets/diagram.svg", "assets/unused.svg"],
      products,
    }),
    "docs/user/assets/demo.svg": SQUARE_SVG,
    "docs/user/assets/logo.svg": SQUARE_SVG,
    "docs/user/assets/diagram.svg": SQUARE_SVG,
    "docs/user/assets/unused.svg": SQUARE_SVG,
    "docs/user/alpha-cli/getting-started.md": page("alpha-cli", "Getting started", "![A screen](../assets/demo.svg)\n"),
    "docs/user/alpha-cli/guides/deep.md": page("alpha-cli", "Deep", '<img src="../../assets/diagram.svg" alt="A diagram">\n'),
    "docs/user/alpha-cli/CHANGELOG.md": changelog(["1.0.0", "Write the first sample page."]),
    ...(withApp ? { "docs/user/alpha-app/getting-started.md": page("alpha-app", "Getting started") } : {}),
    ".intentional/config.yml": intentional(units),
    "cli/CHANGELOG.md": changelog(["1.2.0", "Add the sample command."], ["1.1.0", "An older change."]),
    "app/CHANGELOG.md": changelog(["0.3.0", "Add the sample service."]),
  };
}

export const ALPHA_TAGS: TagSpec[] = [
  { name: "alpha-cli@1.2.0", message: "release record", date: "2026-01-02T03:04:05Z" },
  { name: "alpha-app@0.3.0", message: "release record", date: "2026-02-03T04:05:06Z" },
];

export const ALPHA_CLI_RELEASE = {
  date: new Date("2026-01-05T00:00:00Z"),
  url: "https://github.com/sample-org/alpha/releases/tag/alpha-cli@1.2.0",
  notes: "Release notes from the GitHub Release.",
};

/** A feature entry and a dev container image. */
export function betaFiles(): Files {
  return {
    "docs/user/docs.yml": yaml({
      schemaVersion: 1,
      assets: ["assets/demo.svg", "assets/feature.svg"],
      products: {
        "sample-feature": {
          kinds: [{ kind: "devcontainer-feature" }],
          source: "src/features/sample-feature",
          logo: "assets/feature.svg",
        },
        "sample-image": product("sample-image", [{ kind: "devcontainer-image", ref: "ghcr.io/sample-org/beta/sample-image" }], {
          version: "2.0.0",
          category: "Dev Containers",
        }),
      },
    }),
    "docs/user/assets/demo.svg": SQUARE_SVG,
    "docs/user/assets/feature.svg": SQUARE_SVG,
    "docs/user/overview.md": page("sample-image", "Overview"),
    "docs/user/CHANGELOG.md": changelog(["1.0.0", "Write the image overview."]),
    "src/features/sample-feature/devcontainer-feature.json": JSON.stringify({
      id: "sample-feature",
      version: "1.4.2",
      name: "Sample feature",
      description: "Installs a sample.",
      options: { color: { type: "string" }, size: { type: "string" } },
    }),
    "src/features/sample-feature/README.md":
      "# Sample feature\n\n## Options\n\n| Option | Type | Description |\n| --- | --- | --- |\n| `color` | string | A color. |\n| `shape` | string | A shape. |\n\n## Example\n\nText.\n",
    "src/features/sample-feature/CHANGELOG.md": changelog(["1.4.2", "Add a sample option."]),
    "src/images/sample-image/manifest.json": JSON.stringify({
      version: "2.0.0",
      variants: ["first", "second"],
      architectures: ["linux/amd64"],
    }),
    "src/images/sample-image/CHANGELOG.md": changelog(["2.0.0", "Build the sample image."]),
    ".intentional/config.yml": intentional({
      "sample-feature": { path: "src/features/sample-feature", template: "{id}@{version}" },
      "sample-image": {
        path: "src/images/sample-image",
        template: "{id}@{version}",
        projections: [{ adapter: "json", file: "manifest.json", mode: "committed", pointer: "/version" }],
      },
      "sample-image-docs": { path: "docs/user", template: "{id}@{version}" },
    }),
  };
}

export const BETA_TAGS: TagSpec[] = [
  { name: "sample-feature@1.4.2", message: "release record", date: "2026-03-04T05:06:07Z" },
  { name: "sample-image@2.0.0", message: "release record", date: "2026-03-05T00:00:00Z" },
];

/** A repo without intentional. */
export function gammaFiles(): Files {
  return {
    "docs/user/docs.yml": yaml({
      schemaVersion: 1,
      assets: ["assets/demo.svg"],
      products: { "gamma-tool": product("gamma-tool", [cliKind]) },
    }),
    "docs/user/assets/demo.svg": SQUARE_SVG,
    "docs/user/getting-started.md": page("gamma-tool", "Getting started"),
  };
}

/** A repo whose docs.yml fails the schema. */
export function brokenFiles(): Files {
  return {
    "docs/user/docs.yml": yaml({ schemaVersion: 2, products: { "broken-tool": product("broken-tool", [cliKind]) } }),
  };
}
