import { describe, expect, it } from "vitest";
import { startThemeToggle, THEME_KEY } from "../src/lib/theme";

type Listener = (e: { matches: boolean }) => void;

/** A page with a theme, a storage, and a system preference the test can change. */
function page(theme: "light" | "dark", storage: Pick<Storage, "getItem" | "setItem"> | null) {
  const root = { dataset: { theme } as Record<string, string | undefined> };
  const listeners: Listener[] = [];
  let changes = 0;
  const toggle = startThemeToggle({
    root,
    storage,
    system: { addEventListener: (_type, l) => listeners.push(l) },
    onChange: () => changes++,
  });
  return {
    toggle,
    theme: () => root.dataset.theme,
    changes: () => changes,
    system: (light: boolean) => listeners.forEach((l) => l({ matches: light })),
  };
}

function memoryStorage(initial?: string) {
  const data = new Map<string, string>(initial ? [[THEME_KEY, initial]] : []);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const failingWrites = {
  getItem: () => null,
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("theme toggle", () => {
  it("keeps the choice for the page when storage writes fail", () => {
    const p = page("dark", failingWrites);
    p.toggle.toggle();
    p.system(true);
    p.system(false);
    expect(p.theme()).toBe("light");
  });

  it("keeps the choice for the page when there is no storage", () => {
    const p = page("light", null);
    p.toggle.toggle();
    p.system(true);
    expect(p.theme()).toBe("dark");
  });

  it("stores the choice", () => {
    const storage = memoryStorage();
    const p = page("dark", storage);
    p.toggle.toggle();
    expect(storage.data.get(THEME_KEY)).toBe("light");
    expect(p.theme()).toBe("light");
  });

  it("follows the system preference until the user chooses", () => {
    const p = page("dark", memoryStorage());
    p.system(true);
    expect(p.theme()).toBe("light");
    p.system(false);
    expect(p.theme()).toBe("dark");
    expect(p.changes()).toBe(2);
  });

  it("ignores the system preference when a choice is stored", () => {
    const p = page("light", memoryStorage("light"));
    p.system(false);
    expect(p.theme()).toBe("light");
  });

  it("follows the system preference when the stored value is not a theme", () => {
    const p = page("dark", memoryStorage("sepia"));
    p.system(true);
    expect(p.theme()).toBe("light");
  });
});
