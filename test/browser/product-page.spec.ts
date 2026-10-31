/*
 * The product pages in a browser, built from the fixture content in
 * test/fixtures/product-content (`pnpm build:product-fixture`): platform tabs,
 * method pills and kind tabs, the arrow keys, Copy, the Releases links, the
 * releases pages in each theme, the clamp on /releases, the theme's logo, and
 * no sideways scroll on a phone.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openPage, store } from "./support";

test.use({ viewport: { width: 1440, height: 900 } });

const PRODUCTS = ["widget", "gadget", "sprocket", "gizmo", "harbor", "lantern", "beacon"];

/** Open a product page of the fixture; a 200 page that is not that product's page is not it. */
async function openProduct(page: Page, baseURL: string | undefined, key: string) {
  await openPage(page, baseURL, `/tools/${key}/`);
  if ((await page.locator(`article.product[data-product="${key}"]`).count()) !== 1) {
    throw new Error(`/tools/${key}/ is not the product page of ${key}`);
  }
}

const visible = (page: Page, selector: string) => page.locator(`${selector}:not([hidden])`);

/*
 * What each kind of product shows, and what it does not: the sections of the
 * page, the install blocks in view, and the hero's docs button, from the
 * fixture products. A full product has "What it does" and its media; a
 * feature entry has neither and shows its README.
 */
const SECTIONS = [
  {
    key: "widget",
    why: "a CLI with docs pages",
    sections: ["highlights", "install", "docs", "releases"],
    blocks: ["platforms"],
    docs: true,
    media: true,
    tour: false,
  },
  {
    key: "gadget",
    why: "an app with a console tour and no docs pages",
    sections: ["highlights", "install", "releases"],
    blocks: ["platforms"],
    docs: false,
    media: true,
    tour: true,
  },
  {
    key: "sprocket",
    why: "an MCP server",
    sections: ["highlights", "install", "docs", "releases"],
    blocks: ["mcp-server"],
    docs: true,
    media: true,
    tour: false,
  },
  {
    key: "harbor",
    why: "a dev container image",
    sections: ["highlights", "install", "docs", "releases"],
    blocks: ["devcontainer-image"],
    docs: true,
    media: true,
    tour: false,
  },
  {
    key: "gizmo",
    why: "an app that is also a dev container feature, with a video in its tour: only the first kind's block is in view",
    sections: ["highlights", "install", "docs", "releases"],
    blocks: ["platforms"],
    docs: true,
    media: true,
    tour: true,
  },
  {
    key: "lantern",
    why: "a feature entry",
    sections: ["install", "readme", "releases"],
    blocks: ["devcontainer-feature"],
    docs: false,
    media: false,
    tour: false,
  },
  {
    key: "beacon",
    why: "a feature entry with no release data",
    sections: ["install", "readme", "releases"],
    blocks: ["devcontainer-feature"],
    docs: false,
    media: false,
    tour: false,
  },
];

test.describe("sections for each kind", () => {
  for (const expected of SECTIONS) {
    test(`${expected.key}: ${expected.why}`, async ({ page, baseURL }) => {
      await openProduct(page, baseURL, expected.key);
      const sections = await page.locator("article.product > section[id]").evaluateAll((els) => els.map((e) => e.id));
      expect(sections, "the page's sections, in order").toEqual(expected.sections);
      for (const id of expected.sections) await expect(page.locator(`#${id}`)).toBeVisible();

      const blocks = await page
        .locator("#install [data-install-block]:visible")
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.installBlock));
      expect(blocks, "the install blocks in view").toEqual(expected.blocks);

      await expect(page.locator(".hero-actions a.button-primary")).toHaveCount(expected.docs ? 1 : 0);
      await expect(page.locator(".media-main")).toHaveCount(expected.media ? 1 : 0);
      await expect(page.locator(".media-tour")).toHaveCount(expected.tour ? 1 : 0);
    });
  }

  test("a product with one kind has no kind tabs; one with two kinds has a tab for each", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "harbor");
    await expect(page.locator('#install [role="tablist"][aria-label="Kind"]')).toHaveCount(0);
    await openProduct(page, baseURL, "gizmo");
    await expect(page.locator('#install [role="tablist"][aria-label="Kind"] > [role="tab"]')).toHaveText(["Install", "Dev container"]);
    await expect(page.locator('[data-install-block="devcontainer-feature"]')).toBeHidden();
  });

  test("the tables show only on the kinds that have them", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "sprocket");
    await expect(page.locator("#install table")).toBeVisible();
    await expect(page.locator("#install tbody tr")).toHaveCount(3);
    await expect(page.locator("#install tbody tr").last()).toContainText("update_record");
    await openProduct(page, baseURL, "harbor");
    await expect(page.locator("#install table")).toBeVisible();
    await expect(page.locator("#install tbody tr")).toHaveCount(3);
    await expect(page.locator("#install tbody tr").first()).toContainText("debian-bookworm");
    for (const key of ["widget", "gadget", "gizmo", "lantern", "beacon"]) {
      await openProduct(page, baseURL, key);
      await expect(page.locator("#install table"), key).toHaveCount(0);
    }
  });

  test("a feature entry shows its README and the link to the install block says what it adds", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "lantern");
    await expect(page.locator("#readme h2")).toHaveText(["README"]);
    await expect(page.locator("#readme .product-prose :is(h3, h4)")).toHaveText(["Lantern", "Example usage", "Options", "Releases", "Notes"]);
    await expect(page.locator(".hero-more")).toContainText("Add to devcontainer.json");
    await expect(page.locator(".hero-install")).toHaveCount(0);
    await openProduct(page, baseURL, "widget");
    await expect(page.locator("#readme")).toHaveCount(0);
    await expect(page.locator(".hero-more")).toContainText("Other install methods");
  });
});

test.describe("install tabs", () => {
  test("image install tabs switch by mouse and keyboard and copy YAML and commands", async ({
    context,
    page,
    baseURL,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openProduct(page, baseURL, "harbor");
    const block = page.locator('[data-install-block="devcontainer-image"]');
    await expect(
      block.getByRole("tab", { name: "Dev container", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await block.getByRole("tab", { name: "Docker Compose" }).click();
    const compose = block.getByRole("tabpanel");
    await expect(compose).toHaveCount(1);
    await expect(compose.locator("pre").first()).toHaveText(
      "# Tool-authored service settings.\nservices:\n  workspace:\n    image: alpine:3\n    command: [sleep, infinity]\n    environment:\n      MODE: demo\n",
    );
    await compose
      .getByRole("button", { name: "Copy", exact: true })
      .first()
      .click();
    const authoredCompose = readFileSync(new URL("../fixtures/product-content/harbor/docs/install/compose.yaml", import.meta.url), "utf8");
    expect(authoredCompose).toContain("\r\n");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(authoredCompose);
    await compose.getByRole("button", { name: "Copy", exact: true }).last().click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("docker compose -f 'install/compose.yaml' up -d");
    await block.screenshot({ path: "/tmp/pr47-compose.png" });
    await block
      .getByRole("tab", { name: "Docker Compose" })
      .press("ArrowRight");
    const kubernetes = block.getByRole("tabpanel");
    await expect(kubernetes).toHaveAttribute("id", "install-image-kubernetes");
    await kubernetes
      .getByRole("button", { name: "Copy", exact: true })
      .first()
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      readFileSync(new URL("../fixtures/product-content/harbor/docs/install/workload.yaml", import.meta.url), "utf8"),
    );
    await kubernetes
      .getByRole("button", { name: "Copy", exact: true })
      .last()
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "kubectl apply -f 'install/workload.yaml'",
    );
    await block.screenshot({ path: "/tmp/pr47-kubernetes.png" });
    await block
      .getByRole("tab", { name: "Kubernetes", exact: true })
      .press("Home");
    await expect(block.getByRole("tabpanel")).toHaveAttribute(
      "id",
      "install-image-devcontainer",
    );
    await expect(block.locator("table")).toBeVisible();
  });

  test("a platform tab shows its methods, and a method pill shows its command", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "widget");
    await expect(page.locator("#install-cli-macos")).toBeVisible();
    await expect(page.locator("#install-cli-linux")).toBeHidden();

    await page.locator("#install-cli-linux-tab").click();
    await expect(page.locator("#install-cli-linux-tab")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#install-cli-macos-tab")).toHaveAttribute("aria-selected", "false");
    await expect(page.locator("#install-cli-macos")).toBeHidden();
    await expect(page.locator("#install-cli-linux")).toBeVisible();

    await page.locator("#install-cli-linux").getByRole("tab", { name: "APT" }).click();
    const apt = visible(page, "#install-cli-linux .install-method");
    await expect(apt).toHaveCount(1);
    await expect(apt.locator("pre").first()).toContainText("https://repo.wyrd.foo/apt stable main");
    await expect(apt.locator("pre").last()).toHaveText("sudo apt install widget");
  });

  test("the arrow keys move between tabs, and Home and End go to the ends", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "widget");
    const tabs = page.locator('#install [role="tablist"][aria-label="Platform"] > [role="tab"]');
    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#install-cli-linux")).toBeVisible();
    await page.keyboard.press("End");
    await expect(tabs.last()).toBeFocused();
    await expect(page.locator("#install-cli-docker")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.first()).toBeFocused();
    await expect(page.locator("#install-cli-macos")).toBeVisible();
  });

  test("a product with two kinds switches between its kind blocks", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await expect(page.locator("#install-kind-app")).toBeVisible();
    await expect(page.locator("#install-kind-devcontainer-feature")).toBeHidden();
    await page.locator("#install-kind-devcontainer-feature-tab").click();
    await expect(page.locator("#install-kind-app")).toBeHidden();
    await expect(page.locator("#install-kind-devcontainer-feature pre")).toHaveText(
      '"features": {\n  "ghcr.io/example-org/gizmo/gizmo:2": {}\n}',
    );
  });

  test("an MCP server's marketplace tab shows its command", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "sprocket");
    await page.locator('[data-install-block="mcp-server"]').getByRole("tab", { name: /Codex marketplace/ }).click();
    await expect(visible(page, '[data-install-block="mcp-server"] [role="tabpanel"]').locator("pre")).toHaveText(
      "codex plugin install example-org/sprocket",
    );
  });
});

test.describe("copy", () => {
  test("Copy puts the shown command on the clipboard, without the prompt", async ({ context, page, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openProduct(page, baseURL, "widget");
    await page.locator("#install-cli-linux-tab").click();
    await page.locator("#install-cli-linux").getByRole("tab", { name: "RPM" }).click();
    const block = visible(page, "#install-cli-linux .install-method");
    await block.locator("[data-copy]").click();
    await expect(block.locator("[data-copy]")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "sudo curl -fsSL https://repo.wyrd.foo/wyrd.repo \\\n  -o /etc/yum.repos.d/wyrd.repo\nsudo dnf install widget",
    );

    // The label is the signal that the clipboard write finished.
    const hero = page.locator(".hero-install [data-copy]");
    await hero.click();
    await expect(hero).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("brew install example-org/tap/widget");
  });
});

/*
 * The repo.wyrd.foo setup of an apt or rpm block is collapsed behind a one-line
 * hint, and Copy takes the whole block either way. widget's APT and RPM
 * methods are on its Linux tab; gizmo's default method is APT, so its hero and
 * its Linux tab show the block without script.
 */
const APT_HINT = "Set up the repo.wyrd.foo APT repository (once)";
const APT_SETUP_FIRST_LINE = "sudo install -d -m 0755 /etc/apt/keyrings";
const APT_BLOCK = [
  "sudo install -d -m 0755 /etc/apt/keyrings",
  "curl -fsSL https://repo.wyrd.foo/pubkey.gpg |",
  "  sudo tee /etc/apt/keyrings/wyrd-company.gpg >/dev/null",
  'echo "deb [signed-by=/etc/apt/keyrings/wyrd-company.gpg] \\',
  'https://repo.wyrd.foo/apt stable main" |',
  "  sudo tee /etc/apt/sources.list.d/wyrd-company.list >/dev/null",
  "sudo apt update",
];

async function openAptBlock(page: Page, baseURL: string | undefined) {
  await openProduct(page, baseURL, "widget");
  await page.locator("#install-cli-linux-tab").click();
  await page.locator("#install-cli-linux").getByRole("tab", { name: /APT/ }).click();
  const block = visible(page, "#install-cli-linux .install-method");
  return { block, details: block.locator("details[data-code-setup]"), summary: block.locator("summary"), setup: block.locator("details pre"), line: block.locator("pre").last() };
}

test.describe("repository setup", () => {
  test("is collapsed by default: the hint and the install line show, the setup lines do not", async ({ page, baseURL }) => {
    const { details, summary, setup, line } = await openAptBlock(page, baseURL);
    await expect(summary).toHaveText(APT_HINT);
    await expect(setup).toBeHidden();
    await expect(line).toHaveText("sudo apt install widget");
    await expect(line).toBeVisible();
    await expect(details).not.toHaveAttribute("open", /.*/);
  });

  test("expands and collapses with the mouse, the setup lines above the install line", async ({ page, baseURL }) => {
    const { summary, setup, line } = await openAptBlock(page, baseURL);
    await summary.click();
    await expect(setup).toBeVisible();
    await expect(setup).toContainText(APT_SETUP_FIRST_LINE);
    await expect(setup).toContainText("sudo apt update");
    const [setupBox, lineBox] = [await setup.boundingBox(), await line.boundingBox()];
    expect(setupBox!.y + setupBox!.height).toBeLessThanOrEqual(lineBox!.y + 1);
    await summary.click();
    await expect(setup).toBeHidden();
    await expect(line).toBeVisible();
  });

  test("expands and collapses with the keyboard", async ({ page, baseURL }) => {
    const { summary, setup } = await openAptBlock(page, baseURL);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(setup).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(setup).toBeHidden();
    await page.keyboard.press("Space");
    await expect(setup).toBeVisible();
    await page.keyboard.press("Space");
    await expect(setup).toBeHidden();
  });

  test("the RPM block has the same collapsed setup, named for RPM", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "widget");
    await page.locator("#install-cli-linux-tab").click();
    await page.locator("#install-cli-linux").getByRole("tab", { name: /RPM/ }).click();
    const block = visible(page, "#install-cli-linux .install-method");
    await expect(block.locator("summary")).toHaveText("Set up the repo.wyrd.foo RPM repository (once)");
    await expect(block.locator("details pre")).toBeHidden();
    await expect(block.locator("pre").last()).toHaveText("sudo dnf install widget");
  });

  test("Copy writes the full block, setup and install, while collapsed and while expanded", async ({ context, page, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const { block, summary, setup } = await openAptBlock(page, baseURL);
    const copy = block.locator("[data-copy]");
    const full = [...APT_BLOCK, "sudo apt install widget"].join("\n");
    await expect(setup).toBeHidden();
    await copy.click();
    await expect(copy).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(full);

    await expect(copy).toHaveText("Copy");
    await summary.click();
    await expect(setup).toBeVisible();
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await copy.click();
    await expect(copy).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(full);
  });

  test("the hero of a product whose default is APT collapses it too", async ({ context, page, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openProduct(page, baseURL, "gizmo");
    const hero = page.locator(".hero-install");
    await expect(hero.locator("summary")).toHaveText(APT_HINT);
    await expect(hero.locator("details pre")).toBeHidden();
    await hero.locator("[data-copy]").click();
    await expect(hero.locator("[data-copy]")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe([...APT_BLOCK, "sudo apt install gizmo"].join("\n"));
  });

  test("a method that is not apt or rpm has no disclosure", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "widget");
    await expect(page.locator(".hero-install details")).toHaveCount(0);
    await page.locator("#install-cli-linux-tab").click();
    await page.locator("#install-cli-linux").getByRole("tab", { name: /Cargo/ }).click();
    await expect(visible(page, "#install-cli-linux .install-method").locator("details")).toHaveCount(0);
  });
});

test.describe("repository setup without script", () => {
  test.use({ javaScriptEnabled: false });

  test("still expands, by mouse and by keyboard", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const hero = page.locator(".hero-install");
    await expect(hero.locator("details pre")).toBeHidden();
    await hero.locator("summary").click();
    await expect(hero.locator("details pre")).toBeVisible();
    await expect(hero.locator("details pre")).toContainText(APT_SETUP_FIRST_LINE);
    await hero.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(hero.locator("details pre")).toBeHidden();
  });
});

test.describe("search", () => {
  test("finds the product pages, the page's own product first", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await page.locator("[data-wsearch-open]").first().click();
    await page.locator(".wsearch-input").fill("sample board");
    const first = page.locator(".wsearch-item").first();
    await expect(first.locator("a.wsearch-link")).toHaveAttribute("href", /^\/tools\/gizmo\/?$/);
    await expect(first.locator(".wsearch-title")).toHaveText("gizmo");
    await expect(first.locator(".wsearch-where")).toHaveClass(/is-local/);
  });
});

/*
 * The video of gizmo's tour (a six second WebM, so WCAG 2.2.2 applies): it
 * plays on load unless the visitor prefers reduced motion, and a button
 * pauses and resumes it either way.
 */
const VIDEO = ".media-tour video";
const TOGGLE = ".media-tour [data-media-toggle]";

for (const [preference, playsOnLoad] of [
  ["no-preference", true],
  ["reduce", false],
] as const) {
  test.describe(`video with reducedMotion "${preference}"`, () => {
    test.use({ reducedMotion: preference });

    test(`${playsOnLoad ? "plays" : "does not play"} on load, muted and looped, and the button pauses and resumes it`, async ({ page, baseURL }) => {
      await openProduct(page, baseURL, "gizmo");
      const video = page.locator(VIDEO);
      const toggle = page.locator(TOGGLE);
      // The button is shown by the script that decided whether to play.
      await expect(toggle).toBeVisible();
      if (!playsOnLoad) {
        // An `autoplay` attribute starts the video only when it is in view and the browser has
        // buffered it, so read `paused` after both: until then it is true whatever the markup says.
        await video.scrollIntoViewIfNeeded();
        await video.evaluate((el: HTMLVideoElement) => {
          el.preload = "auto";
        });
        await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBe(4);
        // The browser starts an in-view autoplay video after the frame that shows it.
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      await expect(video).toHaveJSProperty("paused", !playsOnLoad);
      await expect(video).toHaveJSProperty("muted", true);
      await expect(video).toHaveJSProperty("loop", true);
      await expect(video).toHaveJSProperty("controls", false);
      await expect(toggle).toHaveAccessibleName(playsOnLoad ? /^Pause video:/ : /^Play video:/);
      await expect(toggle).toContainText(playsOnLoad ? "Pause" : "Play");
      await toggle.click();
      await expect(video).toHaveJSProperty("paused", playsOnLoad);
      await expect(toggle).toHaveAccessibleName(playsOnLoad ? /^Play video:/ : /^Pause video:/);
      await toggle.click();
      await expect(video).toHaveJSProperty("paused", !playsOnLoad);
    });

    test("the button is reached and pressed with the keyboard", async ({ page, baseURL }) => {
      await openProduct(page, baseURL, "gizmo");
      const toggle = page.locator(TOGGLE);
      await expect(toggle).toBeVisible();
      await toggle.focus();
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator(VIDEO)).toHaveJSProperty("paused", playsOnLoad);
      await page.keyboard.press("Space");
      await expect(page.locator(VIDEO)).toHaveJSProperty("paused", !playsOnLoad);
    });
  });
}

test.describe("video without script", () => {
  test.use({ javaScriptEnabled: false });

  test("does not play, and keeps its native controls and no button", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const video = page.locator(VIDEO);
    await expect(video).toHaveJSProperty("controls", true);
    await expect(video).toHaveJSProperty("paused", true);
    await expect(page.locator(TOGGLE)).toBeHidden();
  });
});

/*
 * The tour's modal: a click on a tour thumbnail opens that item in a native
 * <dialog>. Gizmo's tour has three items: a video, then two images.
 */
const OPENERS = ".media-tour [data-media-open]";
const DIALOG = "dialog.media-modal";

/** Open the tour item at `index` (0 is the first item of the tour) by a click. */
async function openTourItem(page: Page, index: number) {
  await page.locator(OPENERS).nth(index).click();
  await expect(page.locator(DIALOG)).toBeVisible();
}

const modal = (page: Page) => {
  const dialog = page.locator(DIALOG);
  return {
    dialog,
    position: dialog.locator("[data-modal-position]"),
    caption: dialog.locator("[data-modal-caption]"),
    previous: dialog.locator("[data-modal-prev]"),
    next: dialog.locator("[data-modal-next]"),
    close: dialog.locator("[data-modal-close]"),
    image: dialog.locator("[data-modal-stage] img"),
    video: dialog.locator("[data-modal-stage] video"),
    toggle: dialog.locator("[data-modal-stage] [data-media-toggle]"),
  };
};

test.describe("tour modal", () => {
  test("a click on a thumbnail opens the dialog on that item", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const { dialog, position, caption, image } = modal(page);
    await expect(dialog).toBeHidden();
    await openTourItem(page, 2);
    await expect(dialog).toHaveJSProperty("open", true);
    await expect(position).toHaveText("3 of 3");
    await expect(caption).toHaveText("The sample notes.");
    await expect(image).toHaveAttribute("src", "/assets/gizmo/assets/notes.png");
    await expect(image).toHaveAttribute("alt", "A list of sample notes.");
  });

  test("a click on the video thumbnail opens the dialog on the video", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const { position, caption, video, image } = modal(page);
    await openTourItem(page, 0);
    await expect(position).toHaveText("1 of 3");
    await expect(caption).toHaveText("The sample board in use.");
    await expect(video).toHaveAttribute("src", "/assets/gizmo/assets/demo.webm");
    await expect(image).toHaveCount(0);
  });

  test("a click on the video itself opens the dialog, and focus returns to the video's link on close", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    // Away from the Pause button (bottom-left) and the expand button (top-right).
    await page.locator(".media-tour video").click({ position: { x: 40, y: 40 } });
    await expect(modal(page).dialog).toBeVisible();
    await expect(modal(page).position).toHaveText("1 of 3");
    await page.keyboard.press("Escape");
    await expect(modal(page).dialog).toBeHidden();
    await expect(page.locator(OPENERS).nth(0)).toBeFocused();
  });

  test("the Pause button of a video thumbnail does not open the dialog", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await page.locator(TOGGLE).click();
    await expect(modal(page).dialog).toBeHidden();
  });

  test("the thumbnails of a gadget (images only) open it too", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gadget");
    await expect(page.locator(OPENERS)).toHaveCount(2);
    await openTourItem(page, 1);
    const { position, caption, image } = modal(page);
    await expect(position).toHaveText("2 of 2");
    await expect(caption).toHaveText("Change the sample settings.");
    await expect(image).toHaveAttribute("src", "/assets/gadget/assets/settings.png");
  });

  test("next and previous, by button and by arrow key, stop at the ends", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const { position, caption, previous, next } = modal(page);
    await openTourItem(page, 0);
    await expect(position).toHaveText("1 of 3");
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    await next.click();
    await expect(position).toHaveText("2 of 3");
    await expect(caption).toHaveText("The sample panel.");
    await expect(previous).toBeEnabled();

    await page.keyboard.press("ArrowRight");
    await expect(position).toHaveText("3 of 3");
    await expect(caption).toHaveText("The sample notes.");
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();

    await page.keyboard.press("ArrowRight");
    await expect(position, "the last item stops").toHaveText("3 of 3");

    await page.keyboard.press("ArrowLeft");
    await expect(position).toHaveText("2 of 3");
    await previous.click();
    await expect(position).toHaveText("1 of 3");
    await page.keyboard.press("ArrowLeft");
    await expect(position, "the first item stops").toHaveText("1 of 3");
    await expect(modal(page).dialog).toBeVisible();
  });

  test("Esc closes it", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await openTourItem(page, 1);
    await page.keyboard.press("Escape");
    await expect(modal(page).dialog).toBeHidden();
    await expect(modal(page).dialog).toHaveJSProperty("open", false);
  });

  test("the close button closes it", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await openTourItem(page, 1);
    await expect(modal(page).close).toHaveAccessibleName("Close");
    await modal(page).close.click();
    await expect(modal(page).dialog).toBeHidden();
  });

  test("a click on the backdrop closes it, a click inside does not", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await openTourItem(page, 1);
    await modal(page).caption.click();
    await modal(page).image.click();
    await expect(modal(page).dialog).toBeVisible();
    // The dialog is centred, so the corner of the viewport is the backdrop.
    await page.mouse.click(4, 4);
    await expect(modal(page).dialog).toBeHidden();
  });

  test("focus moves into the dialog on open and returns to the thumbnail on close", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const { dialog } = modal(page);
    for (const close of ["Escape", "button", "backdrop"] as const) {
      const opener = page.locator(OPENERS).nth(1);
      await opener.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((el) => el.contains(document.activeElement)), "focus is in the dialog").toBe(true);
      if (close === "Escape") await page.keyboard.press("Escape");
      else if (close === "button") await modal(page).close.click();
      else await page.mouse.click(4, 4);
      await expect(dialog).toBeHidden();
      await expect(opener, `focus after ${close}`).toBeFocused();
    }
  });

  test("focus stays in the dialog when an end of the tour disables the button that had it", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const { dialog, next } = modal(page);
    await openTourItem(page, 1);
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(next).toBeDisabled();
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("ArrowLeft");
    await expect(modal(page).position).toHaveText("2 of 3");
  });

  test("the URL and the scroll position do not change", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const url = page.url();
    await page.locator(OPENERS).nth(1).scrollIntoViewIfNeeded();
    await openTourItem(page, 1);
    const scrollY = await page.evaluate(() => window.scrollY);
    // The page is long enough to scroll, so a wheel over the backdrop would move it.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY)).toBeGreaterThan(300);
    await page.keyboard.press("ArrowRight");
    await page.mouse.move(4, 4);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow), "the page behind is locked").toBe("hidden");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("PageDown");
    await expect(modal(page).dialog).toBeVisible();
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    await page.keyboard.press("Escape");
    await expect(modal(page).dialog).toBeHidden();
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  });

  test("a thumbnail is a button named by its alt or caption, and Enter and Space open it", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const openers = page.locator(OPENERS);
    await expect(openers.nth(1)).toHaveRole("button");
    await expect(openers.nth(1)).toHaveAccessibleName("The sample panel.");
    await expect(openers.nth(2)).toHaveAccessibleName("A list of sample notes.");
    await expect(openers.nth(0)).toHaveRole("button");
    await expect(openers.nth(0)).toHaveAccessibleName(/A recording of the sample board\./);
    for (const key of ["Enter", "Space"]) {
      await openers.nth(2).focus();
      await page.keyboard.press(key);
      await expect(modal(page).dialog, key).toBeVisible();
      await expect(modal(page).position).toHaveText("3 of 3");
      await page.keyboard.press("Escape");
      await expect(modal(page).dialog).toBeHidden();
    }
  });

  test("the first, full-width item has no modal", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await expect(page.locator(".media-main [data-media-open]")).toHaveCount(0);
    await page.locator(".media-main img").click();
    await expect(modal(page).dialog).toBeHidden();
  });

  test("an image is as large as the viewport allows and no larger than its natural size", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await openTourItem(page, 1);
    const { image } = modal(page);
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1200);
    const fit = async () => {
      const box = (await image.boundingBox())!;
      const viewport = page.viewportSize()!;
      return { box, viewport };
    };

    // A short window: the height is the limit, so the image shrinks and keeps its 16:9 shape.
    await page.setViewportSize({ width: 1440, height: 600 });
    let { box, viewport } = await fit();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.width / box.height).toBeCloseTo(1200 / 675, 1);
    expect(box.height, "uses the height it has").toBeGreaterThan(viewport.height * 0.5);
    expect(box.height).toBeLessThan(675);

    // A phone: the width is the limit.
    await page.setViewportSize({ width: 390, height: 800 });
    ({ box, viewport } = await fit());
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.width / box.height).toBeCloseTo(1200 / 675, 1);
    expect(box.width, "uses the width it has").toBeGreaterThan(viewport.width * 0.7);

    // A large screen: the image stops at its natural size.
    await page.setViewportSize({ width: 2560, height: 1600 });
    ({ box } = await fit());
    expect(box.width).toBeLessThanOrEqual(1200 + 0.5);
    expect(box.width).toBeGreaterThan(1200 - 1);
  });

  test("the page has no sideways scroll with the dialog open on a phone", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openProduct(page, baseURL, "gizmo");
    await openTourItem(page, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  for (const theme of ["dark", "light"] as const) {
    test(`follows the ${theme} theme: a panel on the surface token, a translucent backdrop`, async ({ page, baseURL }) => {
      await openProduct(page, baseURL, "gizmo");
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      await openTourItem(page, 1);
      const { dialog } = modal(page);
      const surface = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--surface)";
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      });
      expect(await dialog.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(surface);
      const backdrop = await dialog.evaluate((el) => getComputedStyle(el, "::backdrop").backgroundColor);
      // Translucent: a colour with an alpha under 1.
      const alpha = /\/\s*([\d.]+)\s*\)|rgba\([^)]*,\s*([\d.]+)\)/.exec(backdrop);
      expect(alpha, `the backdrop colour ${backdrop} has an alpha`).not.toBeNull();
      expect(Number(alpha![1] ?? alpha![2])).toBeLessThan(1);
      expect(Number(alpha![1] ?? alpha![2])).toBeGreaterThan(0);
    });
  }
});

test.describe("tour modal: the video", () => {
  for (const [preference, playsOnOpen] of [
    ["no-preference", true],
    ["reduce", false],
  ] as const) {
    test.describe(`with reducedMotion "${preference}"`, () => {
      test.use({ reducedMotion: preference });

      test(`${playsOnOpen ? "plays" : "does not play"} on open, muted and looped, with the pause button; it stops when the dialog closes`, async ({ page, baseURL }) => {
        await openProduct(page, baseURL, "gizmo");
        await openTourItem(page, 0);
        const { video, toggle, close } = modal(page);
        await expect(toggle).toBeVisible();
        await expect(video).toHaveJSProperty("muted", true);
        await expect(video).toHaveJSProperty("loop", true);
        await expect(video).toHaveJSProperty("controls", false);
        await expect(video).toHaveJSProperty("paused", !playsOnOpen);
        await expect(toggle).toHaveAccessibleName(playsOnOpen ? /^Pause video:/ : /^Play video:/);
        await toggle.click();
        await expect(video).toHaveJSProperty("paused", playsOnOpen);
        await toggle.click();
        await expect(video).toHaveJSProperty("paused", !playsOnOpen);

        const handle = await video.elementHandle();
        if (!playsOnOpen) await toggle.click();
        await expect(video).toHaveJSProperty("paused", false);
        await close.click();
        await expect(modal(page).dialog).toBeHidden();
        await expect.poll(() => handle!.evaluate((el: HTMLVideoElement) => el.paused), "stopped on close").toBe(true);
      });
    });
  }

  test("stops when the dialog moves to another item", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await openTourItem(page, 0);
    const { video, next, image } = modal(page);
    await expect(video).toHaveJSProperty("paused", false);
    const handle = await video.elementHandle();
    await next.click();
    await expect(image).toHaveAttribute("src", "/assets/gizmo/assets/panel.png");
    await expect(video).toHaveCount(0);
    expect(await handle!.evaluate((el: HTMLVideoElement) => el.paused), "stopped on moving").toBe(true);
  });

  test("starts again when the dialog comes back to the video", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await openTourItem(page, 1);
    await page.keyboard.press("ArrowLeft");
    await expect(modal(page).video).toHaveJSProperty("paused", false);
  });
});

test.describe("tour modal without script", () => {
  test.use({ javaScriptEnabled: false });

  test("a thumbnail is a link to the full-size image", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    const opener = page.locator(OPENERS).nth(1);
    await expect(opener).toHaveJSProperty("tagName", "A");
    await expect(opener).toHaveAttribute("href", "/assets/gizmo/assets/panel.png");
    await expect(opener).toHaveAccessibleName("The sample panel.");
    await expect(page.locator(DIALOG)).toBeHidden();
    await opener.click();
    await expect(page).toHaveURL(/\/assets\/gizmo\/assets\/panel\.png$/);
  });

  test("the video's link goes to the video file", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "gizmo");
    await expect(page.locator(OPENERS).nth(0)).toHaveAttribute("href", "/assets/gizmo/assets/demo.webm");
  });
});

test.describe("page", () => {
  test("the latest version in the facts goes to the page's Releases section", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "widget");
    await page.locator('[data-fact="latest"] a').click();
    await page.waitForURL(/\/tools\/widget\/?#releases$/);
    await expect(page.locator("#releases")).toBeInViewport();
  });

  test("the latest version goes to the Releases section, not to a README heading of that name", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "lantern");
    await expect(page.locator("#readme .product-prose h4", { hasText: "Releases" })).toHaveCount(1);
    await page.locator('[data-fact="latest"] a').click();
    await page.waitForURL(/\/tools\/lantern\/?#releases$/);
    await expect(page.locator(":target")).toHaveJSProperty("tagName", "SECTION");
    await expect(page.locator("section#releases")).toBeInViewport();
  });

  test("the header's Releases link goes to /releases, and All releases to the product's releases page", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "widget");
    await page.locator(".site-nav a", { hasText: "Releases" }).click();
    await page.waitForURL(/\/releases\/?$/);
    await expect(page.locator('.site-nav a[aria-current="page"]')).toHaveText("Releases");
    await page.locator('[data-release-entry="widget"] .releases-item-head').click();
    await page.waitForURL(/\/tools\/widget\/releases\/?$/);
    await expect(page.locator("[data-product-releases=widget] .release-log")).toBeVisible();
    await openProduct(page, baseURL, "widget");
    await page.locator("#releases a", { hasText: "All releases" }).click();
    await page.waitForURL(/\/tools\/widget\/releases\/?$/);
  });

  test("a link in a README to one of its headings goes to that heading", async ({ page, baseURL }) => {
    await openProduct(page, baseURL, "lantern");
    await page.locator("#readme .product-prose a", { hasText: "Options" }).click();
    await page.waitForURL(/#readme--options$/);
    await expect(page.locator("#readme--options")).toBeInViewport();
  });

  for (const [theme, shown, hidden] of [
    ["dark", "logo-dark.svg", "logo.svg"],
    ["light", "logo.svg", "logo-dark.svg"],
  ] as const) {
    test(`the ${theme} theme shows the ${theme} logo`, async ({ page, baseURL }) => {
      await openProduct(page, baseURL, "widget");
      await store(page, theme);
      await page.reload();
      await expect(page.locator(`.hero-title img[src$="/${shown}"]`)).toBeVisible();
      await expect(page.locator(`.hero-title img[src$="/${hidden}"]`)).toBeHidden();
    });
  }

  test("no releases page scrolls sideways on a phone", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/releases/", ...PRODUCTS.map((key) => `/tools/${key}/releases/`)]) {
      await openPage(page, baseURL, path);
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(width.scroll, path).toBe(width.client);
    }
  });

  test("no product page scrolls sideways on a phone", async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const key of PRODUCTS) {
      await openProduct(page, baseURL, key);
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(width.scroll, key).toBe(width.client);
    }
  });
});

type Rgba = [number, number, number, number];
const rgba = (css: string): Rgba => {
  const [r, g, b, a = 1] = css.match(/[\d.]+/g)!.map(Number);
  return [r, g, b, a];
};

/** The colour that `layers` show, top layer first, each over the next. */
function composite(layers: string[]): Rgba {
  return layers
    .map(rgba)
    .reverse()
    .reduce<Rgba>((under, [r, g, b, a]) => [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a), 1], [255, 255, 255, 1]);
}

/** The contrast ratio of two opaque colours. */
function contrast(fg: Rgba, bg: Rgba): number {
  const luminance = ([r, g, b]: Rgba) => {
    const [lr, lg, lb] = [r, g, b].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test.describe("releases pages in each theme", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`/releases and a product's releases page read in the ${theme} theme`, async ({ page, baseURL }) => {
      for (const [path, card, texts] of [
        ["/releases/", '[data-release-entry="widget"]', [".release-entry-name", ".release-entry-meta", ".release-entry h3", ".release-entry li"]],
        ["/tools/widget/releases/", "[data-product-releases=widget]", [".release-version", ".release-log h4", ".release-log h5", ".release-log li"]],
      ] as const) {
        await openPage(page, baseURL, path);
        await store(page, theme);
        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(`${card} .product-mark img[src$="/${theme === "dark" ? "logo-dark.svg" : "logo.svg"}"]`).first()).toBeVisible();
        for (const selector of texts) {
          // The text colour, and the backgrounds behind it up to the first opaque one, nearest first.
          const colours = await page.locator(`${card} ${selector}`).first().evaluate((el) => {
            const layers: string[] = [];
            for (let node: Element | null = el; node; node = node.parentElement) {
              const bg = getComputedStyle(node).backgroundColor;
              if (bg !== "rgba(0, 0, 0, 0)") layers.push(bg);
              if (/^rgb\(/.test(bg)) break;
            }
            return { fg: getComputedStyle(el).color, layers };
          });
          const ratio = contrast(composite([colours.fg, ...colours.layers]), composite(colours.layers));
          expect(ratio, `${path} ${selector} ${colours.fg} on ${colours.layers.join(" over ")}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});

/*
 * /releases clamps an entry that is taller than the clamp height and expands
 * it in place. lantern's latest entry is long; widget's is short.
 */
const LONG = '[data-release-entry="lantern"]';
const SHORT = '[data-release-entry="widget"]';
const LAST_LINE = "Add the last-lantern-option option.";

test.describe("/releases clamp", () => {
  const toggle = (page: Page, entry: string) => page.locator(`${entry} [data-release-toggle]`);
  const body = (page: Page, entry: string) => page.locator(`${entry} [data-release-body]`);
  const height = (page: Page, entry: string) => body(page, entry).evaluate((el) => el.getBoundingClientRect().height);

  test("clamps a long entry, with a Show more button", async ({ page, baseURL }) => {
    await openPage(page, baseURL, "/releases/");
    await expect(toggle(page, LONG)).toBeVisible();
    await expect(toggle(page, LONG)).toHaveText("Show more");
    await expect(toggle(page, LONG)).toHaveAttribute("aria-expanded", "false");
    await expect(toggle(page, LONG)).toHaveAttribute("aria-controls", (await body(page, LONG).getAttribute("id"))!);
    expect(await height(page, LONG)).toBeLessThan(
      await body(page, LONG).evaluate((el) => el.scrollHeight),
    );
    await expect(page.locator(LONG).getByText(LAST_LINE)).not.toBeInViewport({ ratio: 0.01 });
  });

  test("expands in place on a click, and collapses on the next", async ({ page, baseURL }) => {
    await openPage(page, baseURL, "/releases/");
    const url = page.url();
    const button = toggle(page, LONG);
    const clamped = await height(page, LONG);
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(button).toHaveText("Show less");
    await expect(button).toBeFocused();
    await expect(page.locator(LONG).getByText(LAST_LINE)).toBeVisible();
    expect(await height(page, LONG)).toBeGreaterThan(clamped);
    expect(page.url()).toBe(url);
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toHaveText("Show more");
    await expect(button).toBeFocused();
    await expect(page.locator(LONG).getByText(LAST_LINE)).not.toBeInViewport({ ratio: 0.01 });
    expect(await height(page, LONG)).toBe(clamped);
    expect(page.url()).toBe(url);
  });

  test("works with the keyboard", async ({ page, baseURL }) => {
    await openPage(page, baseURL, "/releases/");
    const button = toggle(page, LONG);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(button).toBeFocused();
  });

  test("gives a short entry no button and no clamp", async ({ page, baseURL }) => {
    await openPage(page, baseURL, "/releases/");
    await expect(page.locator(`${SHORT} [data-release-body]`)).toBeVisible();
    await expect(toggle(page, SHORT)).toBeHidden();
    await expect(page.locator(`${SHORT} .release-entry.is-clamped`)).toHaveCount(0);
  });

  test("keeps the other pages' entries whole", async ({ page, baseURL }) => {
    await openPage(page, baseURL, "/tools/lantern/releases/");
    await expect(page.getByText(LAST_LINE).first()).toBeVisible();
    await openPage(page, baseURL, "/tools/lantern/");
    await expect(page.locator("#releases").getByText(LAST_LINE).first()).toBeVisible();
  });
});

test.describe("/releases clamp without script", () => {
  test.use({ javaScriptEnabled: false });

  test("shows a long entry in full, with no button", async ({ page, baseURL }) => {
    await openPage(page, baseURL, "/releases/");
    await expect(page.locator(LONG).getByText(LAST_LINE)).toBeVisible();
    await expect(page.locator(`${LONG} [data-release-toggle]`)).toBeHidden();
    const body = page.locator(`${LONG} [data-release-body]`);
    // Nothing is cut off: the body is as tall as its content.
    expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
  });
});

for (const key of ["gadget", "widget"]) {
  test(`${key}: app and CLI Docker manifests preserve authored settings and clipboard bytes`, async ({ context, page, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openProduct(page, baseURL, key);
    const block = page.locator('[data-install-block="platforms"]');
    await block.getByRole("tab", { name: "Docker", exact: true }).click();
    const docker = block.getByRole("tabpanel").filter({ has: page.getByRole("tablist", { name: "Docker install method", exact: true }) });
    await expect(docker.getByRole("tablist").getByRole("tab")).toHaveText(["Docker run", "Docker Compose", "Kubernetes"]);
    await expect(docker.getByRole("tab", { name: "Docker run", exact: true })).toHaveAttribute("aria-selected", "true");
    await docker.getByRole("button", { name: "Copy", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("docker run");
    if (key === "gadget") await block.screenshot({ path: "docs/media/container-install/app-docker-run.png" });
    for (const [label, path, command] of [
      ["Docker Compose", "install/compose.yaml", "docker compose -f 'install/compose.yaml' up -d"],
      ["Kubernetes", "install/workload.yaml", "kubectl apply -f 'install/workload.yaml'"],
    ]) {
      await docker.getByRole("tab", { name: label, exact: true }).click();
      const panel = docker.getByRole("tabpanel");
      const source = readFileSync(new URL(`../fixtures/product-content/${key}/docs/${path}`, import.meta.url), "utf8");
      await panel.getByRole("button", { name: "Copy", exact: true }).first().click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
      await expect(panel.getByRole("button", { name: "Copied", exact: true })).toHaveCount(1);
      if (key === "gadget") await block.screenshot({ path: `docs/media/container-install/app-${label === "Docker Compose" ? "compose" : "kubernetes"}.png` });
      const download = panel.getByRole("link", { name: `Download ${path}`, exact: true });
      const response = await page.request.get((await download.getAttribute("href"))!);
      expect(await response.body()).toEqual(Buffer.from(source));
      await panel.getByRole("button", { name: "Copy", exact: true }).last().click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command);
    }
    await docker.getByRole("tab", { name: "Kubernetes", exact: true }).press("Home");
    await expect(docker.getByRole("tab", { name: "Docker run", exact: true })).toHaveAttribute("aria-selected", "true");
  });
}
