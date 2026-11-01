import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { docsFileSchema, formatIssue, pageSchema, parseWith, type ContractIssue } from "../../src/schema/index.ts";
import { readRawDocs, type Raw } from "./load-tree.ts";

// Each case starts from a valid fixture's docs.yml, breaks one schema rule, and
// expects the issue on the named field.

function issuesAfter(name: string, edit: (raw: Raw) => void): ContractIssue[] {
  const raw = readRawDocs(name);
  edit(raw);
  const result = parseWith(docsFileSchema, raw, `${name}/docs.yml`);
  return result.ok ? [] : result.issues;
}

function assertIssue(issues: ContractIssue[], field: string, message: RegExp) {
  const text = issues.map(formatIssue).join(" | ");
  assert.equal(issues.length, 1, `one issue, got: ${text}`);
  assert.equal(issues[0].field, field, text);
  assert.match(issues[0].message, message, text);
}

const widgetInstall = (raw: Raw) => raw.products.widget.kinds[0].install as Raw[];

describe("docs.yml schema", () => {
  for (const method of [
    "claude-code",
    "claude-desktop",
    "codex",
    "cursor",
    "opencode",
    "pi",
    "antigravity",
  ]) {
    it(`accepts the ${method} MCP client method`, () => {
      assert.deepEqual(
        issuesAfter("mcp-server", (raw) => {
          raw.products["sprocket-mcp"].kinds[0].install[0].method = method;
        }),
        [],
      );
    });
  }

  it("rejects a schemaVersion other than 1", () => {
    assertIssue(issuesAfter("cli", (raw) => (raw.schemaVersion = 2)), "schemaVersion", /expected 1/);
  });

  it("rejects an unknown field, for example language", () => {
    assertIssue(issuesAfter("cli", (raw) => (raw.products.widget.language = "Go")), "products.widget.language", /not an allowed field/);
  });

  it("allows relationships at the top level only", () => {
    assert.deepEqual(issuesAfter("cli", () => {}), []);
    assertIssue(
      issuesAfter("cli", (raw) => (raw.products.widget.relationships = {})),
      "products.widget.relationships",
      /not an allowed field/,
    );
  });

  it("defaults assets to an empty list", () => {
    const raw = readRawDocs("devcontainer-feature");
    delete raw.assets;
    delete (raw.products as Raw)["other-feature"].logo;
    const result = parseWith(docsFileSchema, raw, "docs.yml");
    assert.ok(result.ok);
    assert.deepEqual(result.data.assets, []);
  });

  it("rejects an empty products map and an invalid product key", () => {
    assertIssue(issuesAfter("cli", (raw) => (raw.products = {})), "products", /at least one product/);
    const issues = issuesAfter("cli", (raw) => {
      raw.products.Widget = raw.products.widget;
      delete raw.products.widget;
    });
    assertIssue(issues, "products.Widget", /not a valid key: must be lower-case/);
  });

  it("rejects a category outside the closed list", () => {
    for (const drift of ["Developer Tools", "Development", "Code Quality"]) {
      assertIssue(issuesAfter("cli", (raw) => (raw.products.widget.category = drift)), "products.widget.category", /Invalid option/);
    }
  });

  it("rejects a version that is not SemVer", () => {
    assertIssue(issuesAfter("cli", (raw) => (raw.products.widget.version = "1.4")), "products.widget.version", /SemVer/);
    assertIssue(issuesAfter("cli", (raw) => (raw.products.widget["docs-version"] = "v1.4.2")), "products.widget.docs-version", /SemVer/);
  });

  it("rejects an asset path that leaves docs/user/", () => {
    assertIssue(issuesAfter("cli", (raw) => (raw.assets[0] = "../secret.png")), "assets[0]", /inside docs\/user\//);
    assertIssue(issuesAfter("cli", (raw) => (raw.assets[0] = "/abs.png")), "assets[0]", /inside docs\/user\//);
  });

  describe("highlights and media", () => {
    it("are required on a full product", () => {
      assertIssue(issuesAfter("cli", (raw) => delete raw.products.widget.highlights), "products.widget.highlights", /expected array/);
      assertIssue(issuesAfter("cli", (raw) => delete raw.products.widget.media), "products.widget.media", /expected array/);
      assertIssue(issuesAfter("cli", (raw) => (raw.products.widget.media = [])), "products.widget.media", /at least 1|>=1/);
    });

    it("are at most six one-line highlights", () => {
      assertIssue(
        issuesAfter("cli", (raw) => (raw.products.widget.highlights = ["1", "2", "3", "4", "5", "6", "7"])),
        "products.widget.highlights",
        /<=6|at most 6/,
      );
      assertIssue(issuesAfter("cli", (raw) => (raw.products.widget.highlights = ["two\nlines"])), "products.widget.highlights[0]", /one line/);
    });

    it("are not part of a feature entry", () => {
      assertIssue(
        issuesAfter("devcontainer-feature", (raw) => (raw.products["sample-feature"].highlights = ["One."])),
        "products.sample-feature.highlights",
        /not an allowed field/,
      );
    });
  });

  describe("kinds", () => {
    it("rejects an unknown kind, for example a template", () => {
      const issues = issuesAfter("cli", (raw) => (raw.products.widget.kinds[0].kind = "devcontainer-template"));
      assertIssue(issues, "products.widget.kinds[0].kind", /is not a known kind/);
    });

    it("rejects a kind listed twice", () => {
      assertIssue(
        issuesAfter("cli", (raw) => raw.products.widget.kinds.push(structuredClone(raw.products.widget.kinds[0]))),
        "products.widget.kinds[1].kind",
        /more than once/,
      );
    });

    it("requires ref on a full product's devcontainer-feature kind", () => {
      assertIssue(issuesAfter("app", (raw) => delete raw.products.gadget.kinds[1].ref), "products.gadget.kinds[1].ref", /expected string/);
    });

    it("requires ref on a devcontainer-image kind", () => {
      assertIssue(
        issuesAfter("devcontainer-image", (raw) => delete raw.products["sample-image"].kinds[0].ref),
        "products.sample-image.kinds[0].ref",
        /expected string/,
      );
    });

    it("requires tools on an mcp-server kind", () => {
      assertIssue(
        issuesAfter("mcp-server", (raw) => delete raw.products["sprocket-mcp"].kinds[0].tools),
        "products.sprocket-mcp.kinds[0].tools",
        /expected array/,
      );
    });

    it("gives a feature entry exactly one devcontainer-feature kind", () => {
      const issues = issuesAfter("devcontainer-feature", (raw) => raw.products["sample-feature"].kinds.push({ kind: "cli", install: [] }));
      assertIssue(issues, "products.sample-feature.kinds", /<=1/);
    });
  });

  describe("install", () => {
    it("requires os, except for docker", () => {
      assertIssue(issuesAfter("cli", (raw) => delete widgetInstall(raw)[0].os), "products.widget.kinds[0].install[0].os", /required for method homebrew/);
    });

    it("rejects a system listed twice", () => {
      assertIssue(
        issuesAfter("cli", (raw) => (widgetInstall(raw)[0].os = ["linux", "linux"])),
        "products.widget.kinds[0].install[0].os",
        /more than once/,
      );
    });

    it("takes only the install line for apt and rpm", () => {
      const setup = "curl -fsSL https://example.com/key | sudo gpg --dearmor -o /etc/apt/keyrings/example.gpg";
      assertIssue(
        issuesAfter("cli", (raw) => (widgetInstall(raw)[1].command = `${setup}\nsudo apt install widget`)),
        "products.widget.kinds[0].install[1].command",
        /only the install line for method apt/,
      );
      assertIssue(
        issuesAfter("cli", (raw) => (widgetInstall(raw)[2].command = "sudo dnf config-manager --add-repo x && sudo dnf install widget")),
        "products.widget.kinds[0].install[2].command",
        /only the install line for method rpm/,
      );
    });

    it("requires a label for method other and for plugin", () => {
      assertIssue(issuesAfter("cli", (raw) => delete widgetInstall(raw)[6].label), "products.widget.kinds[0].install[6].label", /required for method other/);
      assertIssue(
        issuesAfter("mcp-server", (raw) => delete raw.products["sprocket-mcp"].kinds[0].install[2].label),
        "products.sprocket-mcp.kinds[0].install[2].label",
        /required for method plugin/,
      );
    });

    it("allows default on at most one entry", () => {
      assertIssue(issuesAfter("cli", (raw) => (widgetInstall(raw)[0].default = true)), "products.widget.kinds[0].install[3].default", /more than one entry/);
    });

    it("rejects a method outside the enum", () => {
      assertIssue(issuesAfter("cli", (raw) => (widgetInstall(raw)[0].method = "brew")), "products.widget.kinds[0].install[0].method", /Invalid option/);
    });

    it("uses client methods, not OS methods, on an mcp-server kind", () => {
      assertIssue(
        issuesAfter("mcp-server", (raw) => (raw.products["sprocket-mcp"].kinds[0].install[0].method = "npm")),
        "products.sprocket-mcp.kinds[0].install[0].method",
        /Invalid option/,
      );
    });
  });
});

describe("page schema", () => {
  const valid = { title: "Getting started", product: "widget" };
  const issues = (input: unknown) => {
    const result = parseWith(pageSchema, input, "getting-started.md");
    return result.ok ? [] : result.issues;
  };

  it("accepts title and product, and defaults install to false", () => {
    const result = parseWith(pageSchema, valid, "getting-started.md");
    assert.ok(result.ok);
    assert.equal(result.data.install, false);
  });

  it("requires product", () => {
    assertIssue(issues({ title: "Getting started" }), "product", /expected string/);
  });

  it("rejects the docs flag", () => {
    assertIssue(issues({ ...valid, docs: true }), "docs", /not an allowed field/);
  });
});
