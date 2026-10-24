import { describe, expect, it } from "vitest";
import SiteLayout from "../src/layouts/SiteLayout.astro";
import { render } from "./render";

/** The inline script in <head> that sets the theme before the first paint. */
async function themeScript(): Promise<string> {
  const root = await render(SiteLayout, { title: "Example" });
  const script = root.querySelector("head > script");
  if (!script) throw new Error("no inline script in <head>");
  return script.text;
}

/** Run the script with a stored value (or a throwing store) and a system preference. */
function run(source: string, stored: string | null | Error, prefersLight: boolean): string | undefined {
  const dataset: Record<string, string> = {};
  const localStorage = {
    getItem: () => {
      if (stored instanceof Error) throw stored;
      return stored;
    },
  };
  const matchMedia = (q: string) => ({ matches: q === "(prefers-color-scheme: light)" && prefersLight });
  const document = { documentElement: { dataset } };
  new Function("localStorage", "matchMedia", "document", source)(localStorage, matchMedia, document);
  return dataset.theme;
}

describe("theme script", () => {
  it("is the first element in <head> after the charset, before any stylesheet", async () => {
    const root = await render(SiteLayout, { title: "Example" });
    const children = root.querySelector("head")!.childNodes.filter((n) => n.nodeType === 1) as never as { tagName: string }[];
    expect(children.slice(0, 2).map((c) => c.tagName)).toEqual(["META", "SCRIPT"]);
  });

  it("uses the stored choice over the system preference", async () => {
    const s = await themeScript();
    expect(run(s, "light", false)).toBe("light");
    expect(run(s, "dark", true)).toBe("dark");
  });

  it("follows the system preference until the user chooses", async () => {
    const s = await themeScript();
    expect(run(s, null, true)).toBe("light");
    expect(run(s, null, false)).toBe("dark");
    expect(run(s, "sepia", true)).toBe("light");
  });

  it("follows the system preference when storage is not available", async () => {
    const s = await themeScript();
    expect(run(s, new Error("SecurityError"), true)).toBe("light");
    expect(run(s, new Error("SecurityError"), false)).toBe("dark");
  });
});
