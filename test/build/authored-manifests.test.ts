// relationships: { implements: publishing, references: site }
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { parse as html } from "node-html-parser";
import { parse, stringify } from "yaml";
import { applyRepo, computeRepo } from "../../publisher/index.ts";
import { betaFiles } from "../publisher/fixtures.ts";

it("publishes tool-authored manifests through real Astro pages and asset bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "authored-manifests-"));
  const repo = new URL("../../", import.meta.url).pathname;
  const out = join(repo, "dist-fixtures/authored-manifests");
  try {
    const files = betaFiles();
    const docs = parse(files["docs/user/docs.yml"] as string);
    const product = docs.products["sample-image"];
    docs.products = {};
    docs.assets = [];
    const yaml =
      '# Keep tool settings and comments\r\nservices:\r\n  worker:\r\n    image: alpine:3\r\n    command: [sleep, infinity]\r\n    environment: { MODE: "<sample> & demo" }\r\n';
    const kube = '# Keep authored resources\r\napiVersion: v1\r\nkind: ConfigMap\r\nmetadata: { name: worker-settings }\r\ndata: { MODE: "<sample> & demo" }\r\n---\r\napiVersion: v1\r\nkind: Pod\r\nmetadata: { name: worker }\r\nspec:\r\n  containers:\r\n    - name: worker\r\n      image: busybox:1\r\n      command: [sleep, "3600"]\r\n';
    for (const [key, methods] of Object.entries({
      both: ["compose", "kubernetes"],
      compose: ["compose"],
      kubernetes: ["kubernetes"],
      neither: [],
    })) {
      const entry = structuredClone(product);
      entry.kinds[0].tags = [{ tag: "2" }];
      for (const method of methods) {
        entry.kinds[0][method] = `install/${method}.yaml`;
        docs.assets.push(`${key}/install/${method}.yaml`);
        files[`docs/user/${key}/install/${method}.yaml`] = method === "compose" ? yaml : kube;
      }
      docs.products[key] = entry;
      files[`docs/user/${key}/assets/demo.svg`] =
        files["docs/user/assets/demo.svg"];
      docs.assets.push(`${key}/assets/demo.svg`);
    }
    for (const path of Object.keys(files))
      if (path.endsWith(".md") && path.startsWith("docs/user/"))
        delete files[path];
    files["docs/user/docs.yml"] = stringify(docs);
    const encoded = new Map(
      Object.entries(files).map(([path, value]) => [
        path,
        typeof value === "string" ? new TextEncoder().encode(value) : value,
      ]),
    );
    const result = await computeRepo({
      ownerRepo: "sample-org/sample",
      strict: false,
      files: {
        async list(prefix) {
          return [...encoded.keys()].filter((path) => path.startsWith(prefix));
        },
        async read(path) {
          return encoded.get(path);
        },
      },
      tags: {
        async read() {
          return undefined;
        },
      },
    });
    assert.equal(result.failed, false, JSON.stringify(result.findings));
    assert.equal(applyRepo(root, result).failed, false);
    const build = spawnSync(
      join(repo, "node_modules/.bin/astro"),
      ["build", "--outDir", out],
      {
        cwd: repo,
        env: { ...process.env, WYRD_CONTENT_DIR: root },
        encoding: "utf8",
      },
    );
    assert.equal(build.status, 0, build.stdout + build.stderr);
    for (const key of Object.keys(docs.products)) {
      const page = html(
        readFileSync(join(out, "tools", key, "index.html"), "utf8"),
      );
      for (const method of ["compose", "kubernetes"]) {
        const panel = page.querySelector(`#install-image-${method}`);
        const declared = docs.products[key].kinds[0][method] !== undefined;
        assert.equal(panel !== null, declared, `${key}: ${method}`);
        if (!declared) continue;
        assert.equal(panel!.querySelector("pre")!.textContent, method === "compose" ? yaml : kube);
        const command =
          method === "compose"
            ? "docker compose -f 'install/compose.yaml' up -d"
            : "kubectl apply -f 'install/kubernetes.yaml'";
        assert.equal(panel!.querySelectorAll("pre")[1].textContent, command);
        assert.deepEqual(
          readFileSync(join(out, "assets", key, "install", `${method}.yaml`)),
          Buffer.from(method === "compose" ? yaml : kube),
        );
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});
