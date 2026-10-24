/*
 * The harness fails closed, stops its server, and names the install step:
 * each case runs the real harness config (harness/playwright.config.ts) in a
 * run of its own, and reads the exit code, the output and the server's port.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import { freePort } from "./config";
import { INSTALL_STEP } from "./global-setup";

const CLI = createRequire(import.meta.url).resolve("@playwright/test/cli");
const CONFIG = join(import.meta.dirname, "harness", "playwright.config.ts");

interface Run {
  child: ChildProcess;
  port: number;
  /** The home fixture server's port, when the run has one. */
  homePort?: number;
  output: () => string;
  exit: Promise<number | null>;
}

function startRun(
  spec: string,
  extra: Record<string, string> = {},
  fixedPort?: number,
): Promise<Run> {
  return (fixedPort ? Promise.resolve(fixedPort) : freePort()).then((port) => {
    const env = Object.fromEntries(
      // Not the outer run's own variables: the inner run is a run of its own.
      Object.entries(process.env).filter(([k]) => !/^(PW_|PLAYWRIGHT_(?!BROWSERS_PATH))/.test(k)),
    );
    const child = spawn(process.execPath, [CLI, "test", "-c", CONFIG], {
      env: { ...env, ...extra, INNER_PORT: String(port), INNER_SPEC: spec },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "";
    child.stdout!.on("data", (d) => (text += d));
    child.stderr!.on("data", (d) => (text += d));
    const exit = new Promise<number | null>((resolve) =>
      child.once("close", (code) => resolve(code)),
    );
    const homePort = extra.INNER_HOME_PORT ? Number(extra.INNER_HOME_PORT) : undefined;
    return { child, port, homePort, output: () => text, exit };
  });
}

const listening = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });

const serverStopped = (port: number) => expect.poll(() => listening(port)).toBe(false);

test("the control: a run with a server and a browser passes, and stops its server", async () => {
  const run = await startRun("visit");
  expect(await run.exit, run.output()).toBe(0);
  expect(run.output()).toContain("1 passed");
  await serverStopped(run.port);
});

test("a run with the home fixture server passes, and stops both servers", async () => {
  const homePort = await freePort();
  const run = await startRun("noop", { INNER_HOME_PORT: String(homePort) });
  expect(await run.exit, run.output()).toBe(0);
  expect(run.output()).toContain("1 passed");
  await serverStopped(run.port);
  await serverStopped(homePort);
});

test("a home fixture server that does not start fails the run", async () => {
  const run = await startRun("noop", {
    INNER_HOME_PORT: String(await freePort()),
    INNER_HOME_COMMAND: `${process.execPath} -e ""`,
  });
  expect(await run.exit).not.toBe(0);
  expect(run.output()).toMatch(/webServer exited early/);
  expect(run.output(), "the test itself did not run").not.toContain("1 passed");
  await serverStopped(run.port);
});

test("a run with the docs fixture server passes, and stops both servers", async () => {
  const docsPort = await freePort();
  const run = await startRun("noop", { INNER_DOCS_PORT: String(docsPort) });
  expect(await run.exit, run.output()).toBe(0);
  expect(run.output()).toContain("1 passed");
  await serverStopped(run.port);
  await serverStopped(docsPort);
});

test("a docs fixture server that does not start fails the run", async () => {
  const run = await startRun("noop", {
    INNER_DOCS_PORT: String(await freePort()),
    INNER_DOCS_COMMAND: `${process.execPath} -e ""`,
  });
  expect(await run.exit).not.toBe(0);
  expect(run.output()).toMatch(/webServer exited early/);
  expect(run.output(), "the test itself did not run").not.toContain("1 passed");
  await serverStopped(run.port);
});

test("a run with the product page fixture server passes, and stops both servers", async () => {
  const productsPort = await freePort();
  const run = await startRun("noop", { INNER_PRODUCTS_PORT: String(productsPort) });
  expect(await run.exit, run.output()).toBe(0);
  expect(run.output()).toContain("1 passed");
  await serverStopped(run.port);
  await serverStopped(productsPort);
});

test("a product page fixture server that does not start fails the run", async () => {
  const run = await startRun("noop", {
    INNER_PRODUCTS_PORT: String(await freePort()),
    INNER_PRODUCTS_COMMAND: `${process.execPath} -e ""`,
  });
  expect(await run.exit).not.toBe(0);
  expect(run.output()).toMatch(/webServer exited early/);
  expect(run.output(), "the test itself did not run").not.toContain("1 passed");
  await serverStopped(run.port);
});

test("a server that does not start fails the run", async () => {
  const run = await startRun("noop", { INNER_COMMAND: `${process.execPath} -e ""` });
  expect(await run.exit).not.toBe(0);
  expect(run.output()).toMatch(/webServer exited early/);
  expect(run.output(), "the test itself did not run").not.toContain("1 passed");
});

test("a server already on the port fails the run", async () => {
  const port = await freePort();
  const squatter = createServer((socket) => socket.end("HTTP/1.1 200 OK\r\n\r\n"));
  await new Promise<void>((resolve) => squatter.listen(port, "127.0.0.1", resolve));
  try {
    const run = await startRun("noop", {}, port);
    expect(await run.exit, run.output()).not.toBe(0);
    expect(run.output()).toMatch(/already used/);
    expect(run.output(), "the test itself did not run").not.toContain("1 passed");
  } finally {
    squatter.close();
  }
});

test("a missing browser fails the run and names the install step", async () => {
  const empty = mkdtempSync(join(tmpdir(), "no-browsers-"));
  try {
    const run = await startRun("noop", { PLAYWRIGHT_BROWSERS_PATH: empty });
    expect(await run.exit).not.toBe(0);
    expect(run.output()).toContain(INSTALL_STEP);
    expect(run.output(), "the test itself did not run").not.toContain("1 passed");
    await serverStopped(run.port);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("a failing test fails the run, and the server stops", async () => {
  const run = await startRun("fail");
  expect(await run.exit).not.toBe(0);
  expect(run.output()).toContain("1 failed");
  await serverStopped(run.port);
});

test("a committed test.only fails the run", async () => {
  const run = await startRun("only");
  expect(await run.exit).not.toBe(0);
  expect(run.output()).toMatch(/forbidOnly/);
  await serverStopped(run.port);
});

test("an interrupted run stops its server", async () => {
  const run = await startRun("hang");
  await expect.poll(() => listening(run.port)).toBe(true);
  run.child.kill("SIGINT");
  await run.exit;
  await serverStopped(run.port);
});
