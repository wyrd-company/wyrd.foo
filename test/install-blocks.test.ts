import { describe, expect, it } from "vitest";
import {
  APT_SETUP,
  RPM_SETUP,
  defaultInstall,
  devcontainerFeatureSnippet,
  devcontainerImageSnippet,
  heroInstall,
  installCommand,
  mcpClientTabs,
  platformTabs,
} from "../src/lib/install-blocks";
import type { KindBlock } from "../src/schema/index";

type CliKind = Extract<KindBlock, { kind: "cli" }>;
type Entry = CliKind["install"][number];

const brew: Entry = { method: "homebrew", os: ["macos", "linux"], command: "brew install example" };
const apt: Entry = { method: "apt", os: ["linux"], label: "Debian, Ubuntu", command: "sudo apt install example" };
const rpm: Entry = { method: "rpm", os: ["linux"], command: "sudo dnf install example" };
const cargo: Entry = { method: "cargo", os: ["macos", "linux", "windows"], command: "cargo install example" };
const cargoGit: Entry = { method: "cargo", os: ["linux"], label: "From Git", command: "cargo install --git x example" };
const docker: Entry = { method: "docker", command: "docker run --rm example" };
const other: Entry = { method: "other", os: ["windows"], label: "Portable zip", command: "unzip example.zip" };

describe("installCommand", () => {
  it("writes the repo.wyrd.foo setup above an apt install line", () => {
    expect(installCommand(apt)).toBe([...APT_SETUP, "sudo apt update", "sudo apt install example"].join("\n"));
    expect(APT_SETUP.join("\n")).toContain("https://repo.wyrd.foo/pubkey.gpg");
    expect(APT_SETUP.join("\n")).toContain("https://repo.wyrd.foo/apt stable main");
  });

  it("writes the repo.wyrd.foo setup above an rpm install line", () => {
    expect(installCommand(rpm)).toBe([...RPM_SETUP, "sudo dnf install example"].join("\n"));
    expect(RPM_SETUP.join("\n")).toContain("https://repo.wyrd.foo/wyrd.repo");
  });

  it("writes any other method's command as it is", () => {
    expect(installCommand(brew)).toBe("brew install example");
    expect(installCommand({ ...brew, command: "line one\nline two\n" })).toBe("line one\nline two");
  });
});

describe("defaultInstall", () => {
  it("is the entry marked default", () => {
    expect(defaultInstall([brew, { ...cargo, default: true }])).toEqual({ ...cargo, default: true });
  });
  it("is the first entry when none is marked", () => {
    expect(defaultInstall([cargo, brew])).toBe(cargo);
  });
});

describe("platformTabs", () => {
  it("makes macOS, Linux, Windows and Docker tabs in that order from os and docker entries", () => {
    const tabs = platformTabs([docker, cargo, brew]);
    expect(tabs.map((t) => t.label)).toEqual(["macOS", "Linux", "Windows", "Docker"]);
    expect(tabs.find((t) => t.platform === "windows")!.methods.map((m) => m.pill)).toEqual(["Cargo"]);
    expect(tabs.find((t) => t.platform === "docker")!.methods.map((m) => m.pill)).toEqual(["Docker"]);
  });

  it("lists a method under each of its systems, in install order", () => {
    const tabs = platformTabs([brew, apt, rpm, cargo]);
    expect(tabs.find((t) => t.platform === "linux")!.methods.map((m) => m.pill)).toEqual(["Homebrew", "APT", "RPM", "Cargo"]);
    expect(tabs.find((t) => t.platform === "macos")!.methods.map((m) => m.pill)).toEqual(["Homebrew", "Cargo"]);
  });

  it("leaves out a system no entry names", () => {
    expect(platformTabs([apt]).map((t) => t.platform)).toEqual(["linux"]);
  });

  it("names an other entry by its label and keeps a qualifier label beside the pill", () => {
    const windows = platformTabs([other])[0];
    expect(windows.methods[0]).toMatchObject({ pill: "Portable zip", qualifier: undefined });
    const linux = platformTabs([apt])[0];
    expect(linux.methods[0]).toMatchObject({ pill: "APT", qualifier: "Debian, Ubuntu" });
  });

  it("adds the label to a pill when one system lists the same method twice", () => {
    const linux = platformTabs([cargo, cargoGit]).find((t) => t.platform === "linux")!;
    expect(linux.methods.map((m) => m.pill)).toEqual(["Cargo", "Cargo · From Git"]);
    const macos = platformTabs([cargo, cargoGit]).find((t) => t.platform === "macos")!;
    expect(macos.methods.map((m) => m.pill)).toEqual(["Cargo"]);
  });

  it("selects the default entry's first system and the default method in it", () => {
    const tabs = platformTabs([brew, { ...apt, default: true }, cargo]);
    expect(tabs.filter((t) => t.selected).map((t) => t.platform)).toEqual(["linux"]);
    const linux = tabs.find((t) => t.platform === "linux")!;
    expect(linux.methods.filter((m) => m.selected).map((m) => m.pill)).toEqual(["APT"]);
    // Other tabs select their first method.
    expect(tabs.find((t) => t.platform === "macos")!.methods.filter((m) => m.selected).map((m) => m.pill)).toEqual(["Homebrew"]);
  });

  it("selects the Docker tab when the default entry is a docker entry", () => {
    const tabs = platformTabs([brew, { ...docker, default: true }]);
    expect(tabs.filter((t) => t.selected).map((t) => t.platform)).toEqual(["docker"]);
  });

  it("shows a prompt before a one-line command only", () => {
    const linux = platformTabs([brew, apt]).find((t) => t.platform === "linux")!;
    expect(linux.methods.map((m) => m.prompt)).toEqual([true, false]);
  });

  it("carries the full command, with the site's setup for apt", () => {
    const linux = platformTabs([apt])[0];
    expect(linux.methods[0].command).toBe(installCommand(apt));
  });
});

describe("mcpClientTabs", () => {
  type Mcp = Extract<KindBlock, { kind: "mcp-server" }>["install"][number];
  const entries: Mcp[] = [
    { method: "json", command: "{}" },
    { method: "claude-code", default: true, command: "claude mcp add x" },
    { method: "plugin", label: "Claude Code marketplace", command: "/plugin install x" },
    { method: "plugin", label: "Codex marketplace", command: "codex plugin install x" },
    { method: "other", label: "Zed", command: "zed add x" },
  ];

  it("makes one tab per entry, in install order, named by the client or the label", () => {
    expect(mcpClientTabs(entries).map((t) => t.label)).toEqual([
      "JSON",
      "Claude Code",
      "Claude Code marketplace",
      "Codex marketplace",
      "Zed",
    ]);
  });

  it("selects the default entry", () => {
    expect(mcpClientTabs(entries).filter((t) => t.selected).map((t) => t.label)).toEqual(["Claude Code"]);
  });

  it("shows a prompt only before a one-line shell command", () => {
    expect(mcpClientTabs(entries).map((t) => t.prompt)).toEqual([false, true, false, false, false]);
  });

  it("marks plugin marketplace tabs", () => {
    expect(mcpClientTabs(entries).filter((t) => t.marketplace).map((t) => t.label)).toEqual([
      "Claude Code marketplace",
      "Codex marketplace",
    ]);
  });
});

describe("devcontainer.json snippets", () => {
  it("adds a feature by its reference", () => {
    expect(devcontainerFeatureSnippet("ghcr.io/example-org/features/x:1")).toBe(
      '"features": {\n  "ghcr.io/example-org/features/x:1": {}\n}',
    );
  });
  it("uses an image by its reference", () => {
    expect(devcontainerImageSnippet("ghcr.io/example-org/x:0")).toBe('"image": "ghcr.io/example-org/x:0"');
  });
});

describe("heroInstall", () => {
  it("is the default command of a cli or app kind, with how and where it installs", () => {
    expect(heroInstall({ kind: "cli", install: [brew, cargo] })).toEqual({
      label: "Install with Homebrew (macOS, Linux)",
      command: "brew install example",
      prompt: true,
    });
    expect(heroInstall({ kind: "app", install: [{ ...docker, default: true }] })).toEqual({
      label: "Run with Docker",
      command: "docker run --rm example",
      prompt: true,
    });
    expect(heroInstall({ kind: "cli", install: [other] }).label).toBe("Install: Portable zip (Windows)");
  });

  it("is the default client command of an mcp-server kind", () => {
    expect(
      heroInstall({
        kind: "mcp-server",
        install: [{ method: "plugin", label: "Codex marketplace", command: "codex plugin install x" }],
        tools: [{ name: "t", description: "d", effect: "Read-only" }],
      }),
    ).toEqual({ label: "Install from Codex marketplace", command: "codex plugin install x", prompt: false });
  });

  it("is the devcontainer.json snippet of a feature or image kind", () => {
    expect(heroInstall({ kind: "devcontainer-feature", ref: "r:1" })).toEqual({
      label: "Add to devcontainer.json",
      command: devcontainerFeatureSnippet("r:1"),
      prompt: false,
    });
    expect(heroInstall({ kind: "devcontainer-image", ref: "r:0" })).toEqual({
      label: "Use in devcontainer.json",
      command: devcontainerImageSnippet("r:0"),
      prompt: false,
    });
  });
});
