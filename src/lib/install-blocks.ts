import { manifestOptions } from "./container-install";
import type { ContainerManifests } from "../schema/container-manifests";
/*
 * What the product page's install blocks show for each kind
 * (docs/technical-designs/site.yml, install-blocks): platform tabs and
 * method pills for CLIs and apps, client tabs for MCP servers, devcontainer.json snippets for features and
 * images, and the default command the hero shows.
 */
import type { InstallMethod, Kind, KindBlock, McpInstallMethod, OperatingSystem } from "../schema/index.ts";

type InstallKind = Extract<KindBlock, { kind: "cli" | "app" }>;
type McpKind = Extract<KindBlock, { kind: "mcp-server" }>;
export type InstallEntry = InstallKind["install"][number];
export type McpInstallEntry = McpKind["install"][number];

/** The tab of each kind's block in the Install section of a product with more than one kind. */
export const KIND_INSTALL_TABS: Record<Kind, string> = {
  cli: "Install",
  app: "Install",
  "mcp-server": "MCP server",
  "devcontainer-feature": "Dev container",
  "devcontainer-image": "Dev container image",
};

export const METHOD_LABELS: Record<InstallMethod, string> = {
  homebrew: "Homebrew",
  apt: "APT",
  rpm: "RPM",
  aur: "AUR",
  nix: "Nix",
  cargo: "Cargo",
  npm: "npm",
  npx: "npx",
  pipx: "pipx",
  go: "Go",
  winget: "WinGet",
  scoop: "Scoop",
  docker: "Docker",
  archive: "Archive",
  script: "Script",
  other: "Other",
};

export const MCP_METHOD_LABELS: Record<McpInstallMethod, string> = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  vscode: "VS Code",
  json: "JSON",
  plugin: "Plugin",
  other: "Other",
};

export type Platform = OperatingSystem | "docker";

export const PLATFORM_LABELS: Record<Platform, string> = {
  macos: "macOS",
  linux: "Linux",
  windows: "Windows",
  docker: "Docker",
};

const PLATFORM_ORDER: Platform[] = ["macos", "linux", "windows", "docker"];

/**
 * The site's repository setup for `method: apt`
 * (docs/technical-designs/publishing.yml, install: the site owns the
 * repo.wyrd.foo setup; `command` is only the install line).
 */
export const APT_SETUP = [
  "sudo install -d -m 0755 /etc/apt/keyrings",
  "curl -fsSL https://repo.wyrd.foo/pubkey.gpg |",
  "  sudo tee /etc/apt/keyrings/wyrd-company.gpg >/dev/null",
  'echo "deb [signed-by=/etc/apt/keyrings/wyrd-company.gpg] \\',
  'https://repo.wyrd.foo/apt stable main" |',
  "  sudo tee /etc/apt/sources.list.d/wyrd-company.list >/dev/null",
] as const;

/** The site's repository setup for `method: rpm`. */
export const RPM_SETUP = [
  "sudo curl -fsSL https://repo.wyrd.foo/wyrd.repo \\",
  "  -o /etc/yum.repos.d/wyrd.repo",
] as const;

/** The site's repository setup of an install entry, and the one-line hint that opens it. */
export interface RepoSetup {
  hint: string;
  code: string;
}

/** The repository setup the site writes above the install line: for apt and rpm only. */
export function repoSetup(entry: { method: string }): RepoSetup | undefined {
  if (entry.method === "apt") {
    return { hint: "Set up the repo.wyrd.foo APT repository (once)", code: [...APT_SETUP, "sudo apt update"].join("\n") };
  }
  if (entry.method === "rpm") return { hint: "Set up the repo.wyrd.foo RPM repository (once)", code: RPM_SETUP.join("\n") };
  return undefined;
}

/** The full command of an install entry: for apt and rpm, the site's setup, then the install line. */
export function installCommand(entry: InstallEntry): string {
  const command = entry.command.trimEnd();
  const setup = repoSetup(entry);
  return setup ? `${setup.code}\n${command}` : command;
}

/** The entry marked `default`, else the first. */
export function defaultInstall<E extends { default?: boolean }>(entries: readonly E[]): E {
  return entries.find((entry) => entry.default) ?? entries[0];
}

/** A "$" prompt shows before a one-line shell command, never before a snippet or several lines. */
const shellPrompt = (shell: boolean, command: string) => shell && !command.includes("\n");

/** MCP methods whose command runs in a shell. */
const SHELL_MCP_METHODS: readonly McpInstallMethod[] = ["claude-code", "vscode"];

export interface MethodOption {
  manifest?: ContainerManifests;
  /** The pill text. */
  pill: string;
  /** The entry's label, shown beside the pills; none for `other`, whose pill is the label. */
  qualifier?: string;
  /** The install line; the setup, when there is one, comes above it. */
  command: string;
  setup?: RepoSetup;
  prompt: boolean;
  selected: boolean;
}

export interface PlatformTab {
  platform: Platform;
  label: string;
  methods: MethodOption[];
  selected: boolean;
}

const platformsOf = (entry: InstallEntry): Platform[] => (entry.method === "docker" ? ["docker"] : (entry.os ?? []));

/**
 * Platform tabs for a CLI or app: macOS, Linux and Windows from `os`, and
 * Docker for docker entries. A method shows under each of its systems. The
 * default entry's first platform is selected, with the default entry in it;
 * every other tab selects its first method.
 */
export function platformTabs(entries: readonly InstallEntry[]): PlatformTab[] {
  const chosen = defaultInstall(entries);
  const chosenPlatform = platformsOf(chosen)[0];
  return PLATFORM_ORDER.flatMap((platform) => {
    const here = entries.filter((entry) => platformsOf(entry).includes(platform));
    if (here.length === 0) return [];
    const counts = new Map<string, number>();
    for (const entry of here) counts.set(entry.method, (counts.get(entry.method) ?? 0) + 1);
    const selected = platform === chosenPlatform;
    const methods = here.flatMap((entry, index) => {
      const name = entry.method === "other" ? (entry.label ?? METHOD_LABELS.other) : METHOD_LABELS[entry.method];
      const repeated = entry.method !== "other" && counts.get(entry.method)! > 1 && entry.label !== undefined;
      const base = {
        pill: repeated ? `${name} · ${entry.label}` : name,
        qualifier: entry.method === "other" ? undefined : entry.label,
        command: entry.command.trimEnd(),
        setup: repoSetup(entry),
        prompt: shellPrompt(true, installCommand(entry)),
        selected: selected ? entry === chosen : index === 0,
      };
      if (entry.method !== "docker") return [base];
      const variants = manifestOptions(entry, () => "").map((option) => ({
        pill: repeated ? `${option.label} · ${entry.label}` : option.label,
        qualifier: entry.label, command: "", prompt: false, selected: false,
        manifest: { [option.id]: option.path },
      }));
      return [{ ...base, pill: repeated ? `Docker run · ${entry.label}` : "Docker run" }, ...variants];
    });
    return [{ platform, label: PLATFORM_LABELS[platform], methods, selected }];
  });
}

export interface ClientTab {
  label: string;
  command: string;
  prompt: boolean;
  /** A plugin marketplace, not an MCP client. */
  marketplace: boolean;
  selected: boolean;
}

const mcpLabel = (entry: McpInstallEntry) =>
  entry.method === "plugin" || entry.method === "other"
    ? (entry.label ?? MCP_METHOD_LABELS[entry.method])
    : MCP_METHOD_LABELS[entry.method];

/** One tab per MCP install entry, in install order; the default entry is selected. */
export function mcpClientTabs(entries: readonly McpInstallEntry[]): ClientTab[] {
  const chosen = defaultInstall(entries);
  return entries.map((entry) => ({
    label: mcpLabel(entry),
    command: entry.command.trimEnd(),
    prompt: shellPrompt(SHELL_MCP_METHODS.includes(entry.method), entry.command.trimEnd()),
    marketplace: entry.method === "plugin",
    selected: entry === chosen,
  }));
}

/** The devcontainer.json lines that add a feature. */
export function devcontainerFeatureSnippet(ref: string): string {
  return `"features": {\n  ${JSON.stringify(ref)}: {}\n}`;
}

/** The devcontainer.json line that uses an image. */
export function devcontainerImageSnippet(ref: string): string {
  return `"image": ${JSON.stringify(ref)}`;
}

export interface HeroInstall {
  label: string;
  /** The install line; the setup, when there is one, comes above it. */
  command: string;
  setup?: RepoSetup;
  prompt: boolean;
}

const systems = (entry: InstallEntry) => (entry.os ?? []).map((os) => PLATFORM_LABELS[os]).join(", ");

function installLabel(entry: InstallEntry): string {
  if (entry.method === "docker") return "Run with Docker";
  const where = entry.os ? ` (${systems(entry)})` : "";
  if (entry.method === "other") return `Install: ${entry.label}${where}`;
  return `Install with ${METHOD_LABELS[entry.method]}${where}`;
}

function mcpInstallLabel(entry: McpInstallEntry): string {
  if (entry.method === "plugin") return `Install from ${entry.label}`;
  if (entry.method === "json") return "Add with JSON configuration";
  return `Add with ${mcpLabel(entry)}`;
}

/** What Copy takes from an install block: the setup above the install line (when there is one), then the line. */
export function copyText(install: Pick<HeroInstall, "setup" | "command">): string {
  return install.setup ? `${install.setup.code}\n${install.command}` : install.command;
}

/** The command the hero shows for a kind: its default install, or its devcontainer.json snippet. */
export function heroInstall(block: KindBlock): HeroInstall {
  switch (block.kind) {
    case "cli":
    case "app": {
      const entry = defaultInstall(block.install);
      return {
        label: installLabel(entry),
        command: entry.command.trimEnd(),
        setup: repoSetup(entry),
        prompt: shellPrompt(true, installCommand(entry)),
      };
    }
    case "mcp-server": {
      const entry = defaultInstall(block.install);
      const command = entry.command.trimEnd();
      return { label: mcpInstallLabel(entry), command, prompt: shellPrompt(SHELL_MCP_METHODS.includes(entry.method), command) };
    }
    case "devcontainer-feature":
      return { label: "Add to devcontainer.json", command: devcontainerFeatureSnippet(block.ref), prompt: false };
    case "devcontainer-image":
      return { label: "Use in devcontainer.json", command: devcontainerImageSnippet(block.ref), prompt: false };
  }
}
