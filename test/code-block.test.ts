import { describe, expect, it } from "vitest";
import CodeBlock from "../src/components/product/CodeBlock.astro";
import ProductHero from "../src/components/product/ProductHero.astro";
import DocsInstall from "../src/components/docs/DocsInstall.astro";
import { CONTENT_ROOT } from "../src/lib/content-root";
import { docsProducts } from "../src/lib/docs-products";
import { APT_SETUP, RPM_SETUP, heroInstall, installCommand } from "../src/lib/install-blocks";
import type { KindBlock, ToolFile } from "../src/schema/index.ts";
import { parse } from "node-html-parser";
import { render } from "./render";

type CliKind = Extract<KindBlock, { kind: "cli" }>;
type Entry = CliKind["install"][number];

const apt: Entry = { method: "apt", os: ["linux"], default: true, command: "sudo apt install example" };
const rpm: Entry = { method: "rpm", os: ["linux"], default: true, command: "sudo dnf install example" };
const brew: Entry = { method: "homebrew", os: ["macos"], default: true, command: "brew install example" };

const APT_HINT = "Set up the repo.wyrd.foo APT repository (once)";
const RPM_HINT = "Set up the repo.wyrd.foo RPM repository (once)";

// node-html-parser keeps the inside of a <pre> as raw text, so parse it again to read the code.
const pres = (root: { querySelectorAll(s: string): { innerHTML: string }[] }) =>
  root.querySelectorAll("pre").map((pre) => parse(pre.innerHTML).textContent);

describe("CodeBlock with a repository setup", () => {
  const setup = { hint: APT_HINT, code: [...APT_SETUP, "sudo apt update"].join("\n") };

  it("shows the hint in a closed disclosure, the setup lines inside it, and the install line after it", async () => {
    const root = await render(CodeBlock, { code: "sudo apt install example", setup, label: "APT install command" });
    const details = root.querySelector("details[data-code-setup]")!;
    expect(details).not.toBeNull();
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector("summary")?.textContent.trim()).toBe(APT_HINT);
    expect(pres(details)).toEqual([setup.code]);
    expect(pres(root)).toEqual([setup.code, "sudo apt install example"]);
    // The install line is outside the disclosure, so it shows while the setup is closed.
    expect(details.querySelectorAll("pre")).toHaveLength(1);
  });

  it("has one Copy button, and its block holds the full command in order", async () => {
    const root = await render(CodeBlock, { code: "sudo apt install example", setup });
    expect(root.querySelectorAll("[data-copy]")).toHaveLength(1);
    expect(pres(root).join("\n")).toBe(installCommand(apt));
  });

  it("renders the rpm setup with its hint", async () => {
    const rpmSetup = { hint: RPM_HINT, code: RPM_SETUP.join("\n") };
    const root = await render(CodeBlock, { code: "sudo dnf install example", setup: rpmSetup });
    expect(root.querySelector("summary")?.textContent.trim()).toBe(RPM_HINT);
    expect(pres(root).join("\n")).toBe(installCommand(rpm));
  });

  it("is unchanged without a setup: one pre, no disclosure", async () => {
    const root = await render(CodeBlock, { code: "brew install example", prompt: true });
    expect(root.querySelector("details")).toBeNull();
    expect(root.querySelector("summary")).toBeNull();
    expect(pres(root)).toEqual(["brew install example"]);
    expect(root.querySelector(".code-block-prompt")).not.toBeNull();
  });

  it("encodes authored Copy text independently of HTML newline handling", async () => {
    const authored = '# Keep <tags> & Unicode: café\r\nservices: {}\r\n';
    const root = await render(CodeBlock, { code: authored, copyText: authored });
    expect(decodeURIComponent(root.querySelector("[data-copy-source]")!.getAttribute("data-copy-source")!)).toBe(authored);
    const ordinary = await render(CodeBlock, { code: "echo sample" });
    expect(ordinary.querySelector("[data-copy-source]")).toBeNull();
  });
});

describe("ProductHero install", () => {
  const hero = async (entry: Entry) =>
    render(ProductHero, {
      name: "example",
      description: "d",
      category: "c",
      owner: "o/r",
      install: heroInstall({ kind: "cli", install: [entry] }),
    });

  it("collapses the setup of an apt default and shows the install line", async () => {
    const root = await hero(apt);
    expect(root.querySelector(".hero-install details[data-code-setup]")?.hasAttribute("open")).toBe(false);
    expect(root.querySelector(".hero-install summary")?.textContent.trim()).toBe(APT_HINT);
    expect(pres(root.querySelector(".hero-install")!).join("\n")).toBe(installCommand(apt));
  });

  it("collapses the setup of an rpm default", async () => {
    const root = await hero(rpm);
    expect(root.querySelector(".hero-install summary")?.textContent.trim()).toBe(RPM_HINT);
  });

  it("leaves another method as it was", async () => {
    const root = await hero(brew);
    expect(root.querySelector(".hero-install details")).toBeNull();
    expect(pres(root.querySelector(".hero-install")!)).toEqual(["brew install example"]);
  });
});

describe("DocsInstall", () => {
  const product = (install: Entry[]) => {
    const data = {
      name: "gadget",
      version: "0.2.0",
      "docs-version": "0.2.3",
      "release-unit": "gadget",
      owner: "example-org/things",
      "docs-path": "docs/user",
      tagline: "A thing.",
      blurb: "A thing.",
      status: "stable",
      category: "Agent Tooling",
      highlights: ["Does a thing."],
      media: [{ src: "demo.gif", caption: "A thing." }],
      kinds: [{ kind: "cli", install }],
    } as unknown as ToolFile;
    const [docs] = docsProducts(
      [{ id: "gadget", data }],
      [{ id: "gadget/intro", filePath: `${CONTENT_ROOT}/gadget/docs/intro.md`, data: { title: "intro", product: "gadget", install: true } }],
      [],
    );
    return docs;
  };

  it("collapses the setup of an apt default, and Copy takes the full block", async () => {
    const root = await render(DocsInstall, { product: product([apt]) });
    expect(root.querySelector(".docs-install details[data-code-setup]")?.hasAttribute("open")).toBe(false);
    expect(root.querySelector(".docs-install summary")?.textContent.trim()).toBe(APT_HINT);
    expect(pres(root).join("\n")).toBe(installCommand(apt));
    expect(root.querySelector("[data-copy-text]")?.getAttribute("data-copy-text")).toBe(installCommand(apt));
  });

  it("collapses the setup of an rpm default", async () => {
    const root = await render(DocsInstall, { product: product([rpm]) });
    expect(root.querySelector(".docs-install summary")?.textContent.trim()).toBe(RPM_HINT);
    expect(root.querySelector("[data-copy-text]")?.getAttribute("data-copy-text")).toBe(installCommand(rpm));
  });

  it("leaves another method as it was", async () => {
    const root = await render(DocsInstall, { product: product([brew]) });
    expect(root.querySelector(".docs-install details")).toBeNull();
    expect(pres(root)).toEqual(["brew install example"]);
    expect(root.querySelector("[data-copy-text]")?.getAttribute("data-copy-text")).toBe("brew install example");
  });
});
