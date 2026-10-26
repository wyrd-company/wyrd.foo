import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { parse } from "yaml";
import {
  applyFeature,
  cloneSite,
  DEFAULT_RELEASE_WAIT,
  publish,
  ReleaseLookupError,
  runLocal,
  validateRepo,
  type GitHubRelease,
  type PublishOptions,
  type ReleaseLookupReason,
  type ReleaseWait,
  type RepoResult,
} from "../../publisher/index.ts";
import { fakeReleases, OWNER, Workspace } from "./fixture-repo.ts";
import { ALPHA_CLI_RELEASE, ALPHA_TAGS, alphaFiles, BETA_TAGS, betaFiles } from "./fixtures.ts";
import { SITE_TOKEN, siteRepo, type SiteRepo } from "./site-server.ts";

// Publish mode against a local bare repo standing in for wyrd.foo, served
// over smart HTTP. Nothing here reaches GitHub.

const BOT = { name: "sample-publisher[bot]", email: "1+sample-publisher[bot]@users.noreply.github.com" };
const ALPHA = `${OWNER}/alpha`;
const BETA = `${OWNER}/beta`;
const ALPHA_APP_RELEASE = { date: new Date("2026-02-04T00:00:00Z"), url: "https://github.com/sample-org/alpha/releases/tag/alpha-app@0.3.0" };
const alphaReleases = () =>
  fakeReleases({ [`${ALPHA}@alpha-cli@1.2.0`]: ALPHA_CLI_RELEASE, [`${ALPHA}@alpha-app@0.3.0`]: ALPHA_APP_RELEASE });
const betaReleases = () => fakeReleases({ [`${BETA}@sample-image@2.0.0`]: { date: new Date("2026-03-06T00:00:00Z"), url: "https://example.invalid/r" } });
const OTHER_TOOL = "owner: sample-org/other\nname: other\n";

/** For a test that passes a recording wait: a wait that sleeps for real fails it by this bound, not by a hang. */
const NO_REAL_SLEEP = { timeout: 30_000 };

/** The default wait with a sleep that records each wait and returns at once, and a log that records each line. */
function recordingWait(): { wait: ReleaseWait; sleeps: number[]; lines: string[] } {
  const sleeps: number[] = [];
  const lines: string[] = [];
  return { sleeps, lines, wait: { ...DEFAULT_RELEASE_WAIT, sleep: async (ms) => void sleeps.push(ms), log: (line) => void lines.push(line) } };
}

/** GitHub Releases where each tag answers with its list of outcomes in turn; the last one repeats. */
function scriptedReleases(table: Record<string, (GitHubRelease | ReleaseLookupReason)[]>) {
  const calls: string[] = [];
  return {
    calls,
    async release(ownerRepo: string, tag: string): Promise<GitHubRelease> {
      const key = `${ownerRepo}@${tag}`;
      const outcomes = table[key] ?? ["not-found"];
      const entry = outcomes[Math.min(calls.filter((call) => call === key).length, outcomes.length - 1)];
      calls.push(key);
      if (typeof entry === "string") throw new ReleaseLookupError(entry, tag, "from the fixture");
      return entry;
    },
  };
}

describe("publish mode", () => {
  let ws: Workspace;
  let site: SiteRepo;

  beforeEach(async () => {
    ws = new Workspace();
    site = await siteRepo({ "content/other/tool.yaml": OTHER_TOOL });
  });
  afterEach(async () => {
    await site.close();
    ws.remove();
  });

  const alpha = () => ws.repo("alpha", alphaFiles(), { tags: ALPHA_TAGS });
  const options = (source: string, extra: Partial<PublishOptions> = {}): PublishOptions => ({
    source,
    ref: "wyrd-foo-v2",
    ownerRepo: ALPHA,
    releases: alphaReleases(),
    site: { url: site.url, branch: "main", token: SITE_TOKEN },
    author: BOT,
    ...extra,
  });

  it("pushes content/<key>/ of every product as one commit by the App bot, and keeps other repos' folders", async () => {
    const seed = site.rev();
    const report = await publish(options(alpha()));
    assert.equal(report.outcome, "published", JSON.stringify(report.findings));
    assert.equal(report.attempts, 1);
    assert.equal(site.rev(), report.commit);
    assert.equal(site.rev("main~1"), seed);
    assert.deepEqual(report.products, ["alpha-app", "alpha-cli"]);
    const paths = site.paths();
    for (const path of ["content/alpha-cli/tool.yaml", "content/alpha-cli/docs/getting-started.md", "content/alpha-app/tool.yaml", "content/other/tool.yaml"]) {
      assert.ok(paths.includes(path), `${path} in ${paths.join(", ")}`);
    }
    assert.equal(site.show("content/other/tool.yaml"), OTHER_TOOL.trimEnd());
    const [subject, author, email, committer] = site.log("%s|%an|%ae|%cn")[0].split("|");
    assert.equal(subject, `docs: publish alpha (${ALPHA}@${report.oid!.slice(0, 7)})`);
    assert.deepEqual([author, email, committer], [BOT.name, BOT.email, BOT.name]);
    const tool = parse(site.show("content/alpha-cli/tool.yaml"));
    assert.equal(tool.owner, ALPHA);
    assert.equal(tool.release.url, ALPHA_CLI_RELEASE.url);
    assert.ok(site.authorizations.includes(`Basic ${Buffer.from(`x-access-token:${SITE_TOKEN}`).toString("base64")}`));
  });

  it("publishes the commit a tag names", async () => {
    const dir = alpha();
    const branch = await publish(options(dir, { dryRun: true }));
    const tagged = await publish(options(dir, { ref: "alpha-cli@1.2.0", dryRun: true }));
    assert.equal(tagged.outcome, "dry-run");
    assert.equal(tagged.oid, branch.oid);
  });

  it("fails a ref the checkout does not have, and pushes nothing", async () => {
    const report = await publish(options(alpha(), { ref: "alpha-cli@9.9.9" }));
    assert.equal(report.outcome, "failed");
    assert.match(report.findings[0].message, /has no commit alpha-cli@9\.9\.9/);
    assert.equal(site.pushes, 0);
  });

  it("pushes nothing when the site already holds the result", async () => {
    const dir = alpha();
    await publish(options(dir));
    const tip = site.rev();
    const again = await publish(options(dir));
    assert.equal(again.outcome, "unchanged");
    assert.equal(again.commit, undefined);
    assert.equal(site.rev(), tip);
    assert.equal(site.pushes, 1);
  });

  it("retries a push refused because another publish pushed first, on the new tip", async () => {
    let competing = "";
    site.beforePush = () => (competing = site.commit({ "content/other/extra.md": "x\n" }, "competing publish"));
    const report = await publish(options(alpha()));
    assert.equal(report.outcome, "published", JSON.stringify(report.findings));
    assert.equal(report.attempts, 2);
    assert.equal(site.pushes, 2);
    assert.equal(site.rev("main~1"), competing, "our commit sits on the competing one");
    assert.equal(site.rev(), report.commit);
    const paths = site.paths();
    assert.ok(paths.includes("content/other/extra.md") && paths.includes("content/alpha-cli/tool.yaml"));
    assert.ok(report.findings.some((finding) => finding.severity === "warning" && /main moved to .*, retrying/.test(finding.message)));
  });

  it("retries when main moved before the push started, which the pusher refuses itself as not a fast-forward", async () => {
    let competing = "";
    site.beforePushDiscovery = () => (competing = site.commit({ "content/other/extra.md": "x\n" }, "competing publish"));
    const report = await publish(options(alpha()));
    assert.equal(report.outcome, "published", JSON.stringify(report.findings));
    assert.equal(report.attempts, 2);
    assert.equal(site.pushes, 1, "the first attempt sent no pack");
    assert.equal(site.rev("main~1"), competing);
    assert.ok(report.findings.some((finding) => /push rejected: not-fast-forward; main moved/.test(finding.message)));
  });

  it("gives up after the attempt limit when main keeps moving", async () => {
    const race = (count: number) => {
      site.commit({ [`content/other/race-${count}.md`]: "x\n" }, `race ${count}`);
      site.beforePush = race;
    };
    site.beforePush = race;
    const report = await publish(options(alpha(), { attempts: 3 }));
    assert.equal(report.outcome, "failed");
    assert.equal(report.attempts, 3);
    assert.equal(report.commit, undefined);
    assert.ok(report.findings.some((finding) => finding.severity === "error" && /push rejected 3 times/.test(finding.message)));
    assert.ok(!site.paths().includes("content/alpha-cli/tool.yaml"));
  });

  it("makes 5 attempts by default", async () => {
    const race = (count: number) => {
      site.commit({ [`content/other/race-${count}.md`]: "x\n" }, `race ${count}`);
      site.beforePush = race;
    };
    site.beforePush = race;
    const report = await publish(options(alpha()));
    assert.equal(report.outcome, "failed");
    assert.equal(report.attempts, 5);
    assert.equal(site.pushes, 5);
  });

  it("does not retry a refused push when main did not move", async () => {
    const hook = join(site.bare, "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\necho refused by the test hook >&2\nexit 1\n");
    chmodSync(hook, 0o755);
    const tip = site.rev();
    const report = await publish(options(alpha()));
    assert.equal(report.outcome, "failed");
    assert.equal(report.attempts, 1);
    assert.equal(site.rev(), tip);
    assert.ok(report.findings.some((finding) => finding.severity === "error" && /main did not move, so it is not retried/.test(finding.message)));
  });

  it("fails, naming the tag, when a product's primary tag has no GitHub Release, and pushes nothing", NO_REAL_SLEEP, async () => {
    const tip = site.rev();
    const releases = fakeReleases({ [`${ALPHA}@alpha-cli@1.2.0`]: ALPHA_CLI_RELEASE });
    const report = await publish(options(alpha(), { releases, releaseWait: recordingWait().wait }));
    assert.equal(report.outcome, "failed");
    const errors = report.findings.filter((finding) => finding.severity === "error");
    assert.equal(errors.length, 1, JSON.stringify(report.findings));
    assert.equal(errors[0].key, "alpha-app");
    assert.equal(errors[0].requirement, "GitHub Release");
    assert.match(errors[0].message, /GitHub Release for tag alpha-app@0\.3\.0: not-found: from the fixture; still not found after waiting 600s/);
    assert.deepEqual(site.authorizations, [], "a failed repo does not reach the site");
    assert.equal(site.rev(), tip);
  });

  it("refuses a key another repo owns, and pushes nothing", async () => {
    site.commit({ "content/alpha-cli/tool.yaml": "owner: sample-org/other\n" }, "other owns alpha-cli");
    const report = await publish(options(alpha()));
    assert.equal(report.outcome, "failed");
    assert.ok(report.findings.some((finding) => /key alpha-cli is owned by sample-org\/other/.test(finding.message)));
    assert.equal(site.pushes, 0);
  });

  it("deletes the folders it owns that are no longer in its map", async () => {
    site.commit({ "content/alpha-old/tool.yaml": `owner: ${ALPHA}\n` }, "an old product of alpha");
    const report = await publish(options(alpha()));
    assert.equal(report.outcome, "published");
    assert.deepEqual(report.deleted, ["alpha-old"]);
    assert.ok(!site.paths().some((path) => path.startsWith("content/alpha-old/")));
    assert.ok(report.changed.includes("content/alpha-old/tool.yaml"));
  });

  it("a dry run commits into its clone and pushes nothing", async () => {
    const tip = site.rev();
    const report = await publish(options(alpha(), { dryRun: true }));
    assert.equal(report.outcome, "dry-run");
    assert.ok(report.commit !== undefined && report.changed.includes("content/alpha-cli/tool.yaml"));
    assert.equal(site.pushes, 0);
    assert.equal(site.rev(), tip);
  });

  it("features a product from a manual run, carries it on a tag push, and replaces it on the next manual run", async () => {
    const dir = ws.repo("beta", betaFiles(), { tags: BETA_TAGS });
    const beta = (extra: Partial<PublishOptions>) => options(dir, { ownerRepo: BETA, releases: betaReleases(), ...extra });
    const first = new Date("2026-04-01T00:00:00Z");
    assert.equal((await publish(beta({ feature: { days: 7, reason: "New image" }, now: first }))).outcome, "published");
    const featured = { from: "2026-04-01T00:00:00.000Z", until: "2026-04-08T00:00:00.000Z", reason: "New image", version: "2.0.0" };
    assert.deepEqual(parse(site.show("content/sample-image/tool.yaml")).featured, featured);
    assert.equal(parse(site.show("content/sample-feature/tool.yaml")).featured, undefined);

    site.commit({ "content/other/note.md": "x\n" }, "an unrelated change");
    assert.equal((await publish(beta({}))).outcome, "unchanged", "a tag push keeps the feature");
    assert.deepEqual(parse(site.show("content/sample-image/tool.yaml")).featured, featured);

    await publish(beta({ feature: { days: 1 }, now: new Date("2026-05-01T00:00:00Z") }));
    assert.deepEqual(parse(site.show("content/sample-image/tool.yaml")).featured, {
      from: "2026-05-01T00:00:00.000Z",
      until: "2026-05-02T00:00:00.000Z",
      reason: "New release",
      version: "2.0.0",
    });
  });

  it("fails a feature request that names no product it can feature, and pushes nothing", async () => {
    const report = await publish(options(alpha(), { feature: { days: 7 } }));
    assert.equal(report.outcome, "failed");
    assert.match(report.findings.at(-1)!.message, /2 products that can be featured \(alpha-cli, alpha-app\); name one in feature-product/);
    assert.equal(site.pushes, 0);
  });
});

describe("feature requests", () => {
  const result = (): RepoResult => ({
    ownerRepo: BETA,
    failed: false,
    findings: [],
    products: [
      { key: "one", feature: false, tool: { version: "1.0.0" }, files: new Map() },
      { key: "two", feature: false, tool: { version: "2.0.0" }, files: new Map() },
      { key: "feat", feature: true, tool: { version: "3.0.0" }, files: new Map() },
    ],
  });
  const now = new Date("2026-04-01T00:00:00Z");
  const message = (request: Parameters<typeof applyFeature>[1]) => {
    const out = applyFeature(result(), request, now);
    assert.equal(out.failed, true);
    assert.deepEqual(out.products, []);
    return out.findings.at(-1)!.message;
  };

  it("features the named product only", () => {
    const out = applyFeature(result(), { product: "two", days: 2, reason: "  A reason  " }, now);
    assert.equal(out.failed, false);
    assert.deepEqual(out.products[1].tool.featured, { from: "2026-04-01T00:00:00.000Z", until: "2026-04-03T00:00:00.000Z", reason: "A reason", version: "2.0.0" });
    assert.equal(out.products[0].tool.featured, undefined);
  });

  it("features the one full product when none is named; feature entries do not count", () => {
    const single = result();
    single.products.splice(1, 1);
    assert.equal(applyFeature(single, { days: 1 }, now).products[0].tool.featured !== undefined, true);
  });

  it("refuses a feature entry, an unknown key, and a length under one day", () => {
    assert.match(message({ product: "feat", days: 1 }), /feat is a feature entry; a feature entry is never featured/);
    assert.match(message({ product: "nope", days: 1 }), /feature-product nope is not a product of this repo/);
    assert.match(message({ product: "one", days: 0 }), /feature-days must be a whole number of days, 1 or more; it is 0/);
    assert.match(message({ product: "one", days: 1.5 }), /it is 1\.5/);
  });

  it("refuses a reason the site cannot show on one line", () => {
    assert.match(message({ product: "one", days: 1, reason: "two\nlines" }), /reason/);
  });

  it("leaves a failed result as it is", () => {
    const failed = { ...result(), failed: true };
    assert.equal(applyFeature(failed, { product: "one", days: 1 }, now), failed);
  });
});

describe("site transport", () => {
  it("refuses a redirect, so the token never reaches another origin", async () => {
    const seen: (string | undefined)[] = [];
    const other = createServer((request, response) => {
      seen.push(request.headers.authorization);
      response.writeHead(401, { "WWW-Authenticate": 'Basic realm="other"' }).end();
    });
    await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
    const otherUrl = `http://127.0.0.1:${(other.address() as AddressInfo).port}`;
    const redirector = createServer((request, response) => response.writeHead(302, { Location: `${otherUrl}${request.url}` }).end());
    await new Promise<void>((resolve) => redirector.listen(0, "127.0.0.1", resolve));
    const dir = mkdtempSync(join(tmpdir(), "publish-redirect-"));
    try {
      const url = `http://127.0.0.1:${(redirector.address() as AddressInfo).port}/site.git`;
      await assert.rejects(cloneSite({ url, branch: "main", token: SITE_TOKEN }, dir));
      assert.deepEqual(seen, [], "the redirect target got no request");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await new Promise((resolve) => other.close(resolve));
      await new Promise((resolve) => redirector.close(resolve));
    }
  });
});

describe("publish mode: waiting for a GitHub Release", () => {
  let ws: Workspace;
  let site: SiteRepo;

  beforeEach(async () => {
    ws = new Workspace();
    site = await siteRepo({ "content/other/tool.yaml": OTHER_TOOL });
  });
  afterEach(async () => {
    await site.close();
    ws.remove();
  });

  const run = (releases: PublishOptions["releases"], releaseWait: ReleaseWait) =>
    publish({
      source: ws.repo("alpha", alphaFiles(), { tags: ALPHA_TAGS }),
      ref: "wyrd-foo-v2",
      ownerRepo: ALPHA,
      releases,
      releaseWait,
      site: { url: site.url, branch: "main", token: SITE_TOKEN },
      author: BOT,
    });

  it("asks again with backoff until the Release is there, says so on each wait, then publishes", NO_REAL_SLEEP, async () => {
    const releases = scriptedReleases({
      [`${ALPHA}@alpha-cli@1.2.0`]: [ALPHA_CLI_RELEASE],
      [`${ALPHA}@alpha-app@0.3.0`]: ["not-found", "not-found", ALPHA_APP_RELEASE],
    });
    const { wait, sleeps, lines } = recordingWait();
    const report = await run(releases, wait);
    assert.equal(report.outcome, "published", JSON.stringify(report.findings));
    assert.deepEqual(sleeps, [15_000, 30_000]);
    assert.deepEqual(lines, [
      `GitHub Release for tag alpha-app@0.3.0 of ${ALPHA} is not found yet; waiting 15s before asking again (15s of at most 600s)`,
      `GitHub Release for tag alpha-app@0.3.0 of ${ALPHA} is not found yet; waiting 30s before asking again (45s of at most 600s)`,
    ]);
    assert.equal(parse(site.show("content/alpha-app/tool.yaml")).release.url, ALPHA_APP_RELEASE.url);
  });

  it("stops at the bound, about 10 minutes in all, then fails naming the tag and the wait", NO_REAL_SLEEP, async () => {
    const releases = scriptedReleases({ [`${ALPHA}@alpha-cli@1.2.0`]: [ALPHA_CLI_RELEASE] });
    const { wait, sleeps, lines } = recordingWait();
    const report = await run(releases, wait);
    assert.equal(report.outcome, "failed");
    assert.deepEqual(sleeps, [15_000, 30_000, 60_000, 120_000, 120_000, 120_000, 120_000, 15_000]);
    assert.equal(sleeps.reduce((sum, ms) => sum + ms, 0), 600_000);
    assert.equal(lines.length, sleeps.length);
    assert.match(lines.at(-1)!, /waiting 15s before asking again \(600s of at most 600s\)$/);
    const error = report.findings.find((finding) => finding.severity === "error");
    assert.match(error!.message, /^GitHub Release for tag alpha-app@0\.3\.0: not-found: from the fixture; still not found after waiting 600s$/);
    assert.equal(site.pushes, 0);
  });

  it("keeps one bound for the whole run, over every missing tag", NO_REAL_SLEEP, async () => {
    const releases = scriptedReleases({});
    const { wait, sleeps } = recordingWait();
    const report = await run(releases, wait);
    assert.equal(report.outcome, "failed");
    assert.equal(sleeps.reduce((sum, ms) => sum + ms, 0), 600_000);
    const errors = report.findings.filter((finding) => finding.requirement === "GitHub Release").map((finding) => finding.message);
    assert.deepEqual(errors, [
      "GitHub Release for tag alpha-cli@1.2.0: not-found: from the fixture; still not found after waiting 600s",
      "GitHub Release for tag alpha-app@0.3.0: not-found: from the fixture; still not found after waiting 600s",
    ]);
  });

  for (const reason of ["denied", "unreachable", "malformed"] as const) {
    it(`does not wait when the lookup is ${reason}`, NO_REAL_SLEEP, async () => {
      const releases = scriptedReleases({ [`${ALPHA}@alpha-cli@1.2.0`]: [ALPHA_CLI_RELEASE], [`${ALPHA}@alpha-app@0.3.0`]: [reason, ALPHA_APP_RELEASE] });
      const { wait, sleeps } = recordingWait();
      const report = await run(releases, wait);
      assert.equal(report.outcome, "failed");
      assert.deepEqual(sleeps, []);
      assert.match(report.findings.find((finding) => finding.severity === "error")!.message, new RegExp(`alpha-app@0\\.3\\.0: ${reason}: from the fixture$`));
    });
  }

  it("fails at once with a bound of 0", NO_REAL_SLEEP, async () => {
    const releases = scriptedReleases({ [`${ALPHA}@alpha-cli@1.2.0`]: [ALPHA_CLI_RELEASE] });
    const { wait, sleeps } = recordingWait();
    const report = await run(releases, { ...wait, totalMs: 0 });
    assert.equal(report.outcome, "failed");
    assert.deepEqual(sleeps, []);
    assert.match(report.findings.find((finding) => finding.severity === "error")!.message, /alpha-app@0\.3\.0: not-found: from the fixture$/);
  });

  // Local mode and validate take no wait: a wait there would sleep for real,
  // so the timeout fails the test.
  it("local mode and validate ask once and do not wait", { timeout: 10_000 }, async () => {
    const dir = ws.repo("alpha", alphaFiles(), { tags: ALPHA_TAGS });
    const local = scriptedReleases({ [`${ALPHA}@alpha-cli@1.2.0`]: [ALPHA_CLI_RELEASE] });
    const [report] = await runLocal({ config: { branch: "wyrd-foo-v2", repos: [{ name: "alpha" }] }, toolsDir: ws.toolsDir, contentDir: ws.contentDir, releases: local });
    assert.equal(report.outcome, "published");
    assert.deepEqual(local.calls.filter((call) => call.endsWith("alpha-app@0.3.0")), [`${ALPHA}@alpha-app@0.3.0`]);

    const validate = scriptedReleases({ [`${ALPHA}@alpha-cli@1.2.0`]: [ALPHA_CLI_RELEASE] });
    const validated = await validateRepo({ dir, ref: "wyrd-foo-v2", releases: validate });
    assert.equal(validated.outcome, "passed");
    assert.deepEqual(validate.calls.filter((call) => call.endsWith("alpha-app@0.3.0")), [`${ALPHA}@alpha-app@0.3.0`]);
  });
});
