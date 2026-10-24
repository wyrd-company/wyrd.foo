import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { formatReports, readLocalConfig, runLocal } from "./local.ts";
import { gitHubReleases } from "./releases.ts";

// The publisher from the command line:
//
//   node publisher/cli.ts local [--content .content-v2] [--config publisher/local-repos.yml]
//                               [--tools-dir /workspaces/tools] [--offline]
//
// `local` reads each configured repo's wyrd-foo-v2 branch into the dev content
// folder; it exits 0 unless the run cannot start, and prints each repo's
// warnings and errors. GitHub Releases are read with GITHUB_TOKEN or GH_TOKEN
// when set; --offline reads local tags only.

const USAGE = "usage: cli.ts local [options]";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    content: { type: "string", default: process.env.WYRD_CONTENT_DIR ?? ".content-v2" },
    config: { type: "string", default: new URL("./local-repos.yml", import.meta.url).pathname },
    "tools-dir": { type: "string", default: process.env.WYRD_TOOLS_DIR ?? "/workspaces/tools" },
    offline: { type: "boolean", default: false },
  },
});

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
const releases = values.offline ? undefined : gitHubReleases({ token });
const [command, ...rest] = positionals;

if (command === "local" && rest.length === 0) {
  const contentDir = resolve(values.content);
  const reports = await runLocal({ config: readLocalConfig(values.config), toolsDir: values["tools-dir"], contentDir, releases });
  console.log(formatReports(reports));
  console.log(`content folder: ${contentDir}`);
} else {
  console.error(USAGE);
  process.exitCode = 2;
}
