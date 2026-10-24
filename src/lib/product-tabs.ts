/*
 * Tabs and Copy buttons on the product page. Tabs follow the WAI-ARIA tabs
 * pattern: a `role="tablist"` of `role="tab"` buttons, each naming its
 * `role="tabpanel"` through `aria-controls`. The server renders the selected
 * tab; the script only switches.
 */

/** The tab to move to for a key press, or undefined for a key tabs ignore. */
export function nextTabIndex(current: number, count: number, key: string): number | undefined {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

function select(tabs: HTMLElement[], chosen: HTMLElement) {
  for (const tab of tabs) {
    const on = tab === chosen;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
    if (panel) panel.hidden = !on;
  }
}

/** Make every tablist under `root` switch its panels on click and with the arrow keys. */
export function startTabs(root: ParentNode = document) {
  for (const list of root.querySelectorAll<HTMLElement>('[role="tablist"]')) {
    const tabs = [...list.querySelectorAll<HTMLElement>(':scope > [role="tab"]')];
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tabs, tab));
      tab.addEventListener("keydown", (event) => {
        const next = nextTabIndex(index, tabs.length, event.key);
        if (next === undefined) return;
        event.preventDefault();
        select(tabs, tabs[next]);
        tabs[next].focus();
      });
    });
  }
}

/** Make every `[data-copy]` button copy the text of the `pre` in its code block. */
export function startCopyButtons(root: ParentNode = document) {
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
    button.addEventListener("click", async () => {
      const code = button.closest("[data-code-block]")?.querySelector("pre");
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.textContent ?? "");
        button.textContent = "Copied";
      } catch {
        button.textContent = "Copy failed";
      }
      setTimeout(() => (button.textContent = "Copy"), 1600);
    });
  }
}
