/*
 * The theme toggle's behaviour. The page follows the system preference until
 * the user chooses; the choice then holds for the life of the page, and is
 * stored when storage is available so the next page starts with it (see the
 * inline script in SiteHead).
 */

export type Theme = "light" | "dark";

/** The storage key; the inline script in SiteHead reads the same key. */
export const THEME_KEY = "wyrd-theme";

export interface ThemeEnv {
  root: { dataset: Record<string, string | undefined> };
  /** null when the page cannot reach storage. */
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  /** The `(prefers-color-scheme: light)` media query. */
  system: { addEventListener(type: "change", listener: (e: { matches: boolean }) => void): void };
  /** Called after each theme change. */
  onChange(): void;
}

const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark";

export function startThemeToggle({ root, storage, system, onChange }: ThemeEnv) {
  let choice: Theme | null = null;
  try {
    const stored = storage?.getItem(THEME_KEY);
    if (isTheme(stored)) choice = stored;
  } catch {}

  system.addEventListener("change", (e) => {
    if (choice) return;
    root.dataset.theme = e.matches ? "light" : "dark";
    onChange();
  });

  return {
    toggle() {
      const next: Theme = root.dataset.theme === "light" ? "dark" : "light";
      root.dataset.theme = next;
      choice = next;
      try {
        storage?.setItem(THEME_KEY, next);
      } catch {}
      onChange();
    },
  };
}
