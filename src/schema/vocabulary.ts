// Closed vocabularies of the docs contract. The site and the publisher read
// these lists; the docs.yml schema accepts only their values.

/** Product kinds. The first kind of a product is its primary kind. */
export const KINDS = [
  "cli",
  "mcp-server",
  "app",
  "devcontainer-feature",
  "devcontainer-image",
] as const;
export type Kind = (typeof KINDS)[number];

export const STATUSES = ["stable", "preview", "planned"] as const;
export type Status = (typeof STATUSES)[number];

/**
 * Catalog categories, in catalog order. The site groups the catalog by
 * category in this order.
 */
export const CATEGORIES = [
  "Git & Review",
  "Release & Versioning",
  "Templates & Scaffolding",
  "Dev Containers",
  "Agent Tooling",
  "Agent Infrastructure",
  "Code Intelligence",
  "Knowledge & Planning",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** The category of a feature entry that does not name one. */
export const FEATURE_ENTRY_CATEGORY: Category = "Dev Containers";

/** Operating systems of an install method. The site makes platform tabs from them. */
export const OPERATING_SYSTEMS = ["macos", "linux", "windows"] as const;
export type OperatingSystem = (typeof OPERATING_SYSTEMS)[number];

/** Install methods of a `cli` or `app` kind block. */
export const INSTALL_METHODS = [
  "homebrew",
  "apt",
  "rpm",
  "aur",
  "nix",
  "cargo",
  "npm",
  "npx",
  "pipx",
  "go",
  "winget",
  "scoop",
  "docker",
  "archive",
  "script",
  "other",
] as const;
export type InstallMethod = (typeof INSTALL_METHODS)[number];

/** Methods whose repository setup the site owns: `command` is only the install line. */
export const SITE_SETUP_METHODS = ["apt", "rpm"] as const satisfies readonly InstallMethod[];

/** Methods that need no `os`. */
export const OS_FREE_METHODS = ["docker"] as const satisfies readonly InstallMethod[];

/**
 * Install methods of an `mcp-server` kind block: one per MCP client, plus
 * `plugin` for plugin marketplaces. The site makes client tabs from them.
 */
export const MCP_INSTALL_METHODS = [
  "claude-code",
  "claude-desktop",
  "codex",
  "cursor",
  "opencode",
  "pi",
  "antigravity",
  "vscode",
  "json",
  "plugin",
  "other",
] as const;
export type McpInstallMethod = (typeof MCP_INSTALL_METHODS)[number];

/** Methods that need a `label`, because the method alone does not name the target. */
export const LABELLED_METHODS = ["other", "plugin"] as const;

