import { execFileSync, spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// A local bare repo standing in for wyrd.foo, served over git's smart HTTP
// protocol by `git http-backend`, so the publish path pushes over the same
// transport it uses against GitHub. Tests can run a step just before a push
// reaches the repo (to land a competing commit) and can see each request's
// Authorization header. It answers 401 to a request without the test token,
// as GitHub does.

export const SITE_TOKEN = "site-token-for-tests";
const BASIC = `Basic ${Buffer.from(`x-access-token:${SITE_TOKEN}`).toString("base64")}`;

export interface SiteRepo {
  /** The URL to clone and push. */
  url: string;
  /** The bare repo on disk. */
  bare: string;
  /** Runs before the next push reaches the repo; it is cleared after it runs. */
  beforePush: ((count: number) => void) | undefined;
  /** Runs before the next push asks for the repo's refs, so the pusher sees the moved branch; it is cleared after it runs. */
  beforePushDiscovery: (() => void) | undefined;
  /** Every receive-pack (push) request so far. */
  pushes: number;
  /** The Authorization header of each request, in order. */
  authorizations: (string | undefined)[];
  /** Commit `files` on main with a plain git clone, as another publisher would. */
  commit(files: Record<string, string>, message: string): string;
  /** `git rev-parse` in the bare repo. */
  rev(ref?: string): string;
  /** `git show <ref>:<path>`. */
  show(path: string, ref?: string): string;
  /** Every path in the tree of `ref`. */
  paths(ref?: string): string[];
  /** `git log --format=<format>` of main. */
  log(format: string): string[];
  close(): Promise<void>;
}

/** Make a bare repo with `files` committed on main, and serve it. */
export async function siteRepo(files: Record<string, string>): Promise<SiteRepo> {
  const root = mkdtempSync(join(tmpdir(), "publish-site-"));
  const bare = join(root, "site.git");
  git(root, "init", "-q", "--bare", "-b", "main", bare);
  git(bare, "config", "http.receivepack", "true");
  const work = join(root, "seed");
  git(root, "clone", "-q", bare, work);
  writeAll(work, { "README.md": "# site\n", ...files });
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "seed");
  git(work, "push", "-q", "origin", "HEAD:main");

  const site: SiteRepo = {
    url: "",
    bare,
    beforePush: undefined,
    beforePushDiscovery: undefined,
    pushes: 0,
    authorizations: [],
    commit(changes, message) {
      git(work, "pull", "-q", "--ff-only", "origin", "main");
      writeAll(work, changes);
      git(work, "add", "-A");
      git(work, "commit", "-q", "-m", message);
      git(work, "push", "-q", "origin", "HEAD:main");
      return git(work, "rev-parse", "HEAD");
    },
    rev: (ref = "main") => git(bare, "rev-parse", ref),
    show: (path, ref = "main") => git(bare, "show", `${ref}:${path}`),
    paths: (ref = "main") => git(bare, "ls-tree", "-r", "--name-only", ref).split("\n").filter(Boolean),
    log: (format) => git(bare, "log", `--format=${format}`, "main").split("\n"),
    close: () => new Promise((resolve) => {
      server.close(() => {
        rmSync(root, { recursive: true, force: true });
        resolve();
      });
      server.closeAllConnections();
    }),
  };

  const server: Server = createServer((request, response) => {
    site.authorizations.push(request.headers.authorization);
    if (request.headers.authorization !== BASIC) {
      response.writeHead(401, { "WWW-Authenticate": 'Basic realm="site"' }).end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname.endsWith("/info/refs") && url.searchParams.get("service") === "git-receive-pack") {
      const hook = site.beforePushDiscovery;
      site.beforePushDiscovery = undefined;
      hook?.();
    }
    if (request.method === "POST" && url.pathname.endsWith("/git-receive-pack")) {
      site.pushes += 1;
      const hook = site.beforePush;
      site.beforePush = undefined;
      hook?.(site.pushes);
    }
    backend(root, request, response, url);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  site.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/site.git`;
  return site;
}

/** Run one request through `git http-backend` (CGI). */
function backend(root: string, request: IncomingMessage, response: ServerResponse, url: URL) {
  const child = spawn("git", ["http-backend"], {
    env: {
      PATH: process.env.PATH ?? "",
      GIT_PROJECT_ROOT: root,
      GIT_HTTP_EXPORT_ALL: "1",
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1),
      REQUEST_METHOD: request.method ?? "GET",
      CONTENT_TYPE: request.headers["content-type"] ?? "",
      REMOTE_USER: "publisher",
      REMOTE_ADDR: "127.0.0.1",
    },
  });
  request.pipe(child.stdin);
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.on("close", () => {
    const output = Buffer.concat(chunks);
    const split = output.indexOf("\r\n\r\n");
    const head = output.subarray(0, split).toString("utf8").split("\r\n");
    let status = 200;
    for (const line of head) {
      const [name, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (name.toLowerCase() === "status") status = Number.parseInt(value, 10);
      else response.setHeader(name, value);
    }
    response.statusCode = status;
    response.end(output.subarray(split + 4));
  });
}

function writeAll(dir: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}

function git(cwd: string, ...args: string[]): string {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) if (!name.startsWith("GIT_") && value !== undefined) env[name] = value;
  Object.assign(env, {
    GIT_AUTHOR_NAME: "Other Publisher",
    GIT_AUTHOR_EMAIL: "other@example.invalid",
    GIT_COMMITTER_NAME: "Other Publisher",
    GIT_COMMITTER_EMAIL: "other@example.invalid",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  });
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
