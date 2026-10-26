/*
 * How /releases clamps a long release entry: a body taller than its clamp
 * height is cut off with a fade, and a button below it expands it in place.
 * The markup holds the whole entry and a hidden button; this script clamps
 * only an entry whose content overflows and shows the button for it, so
 * without script every entry shows in full. The clamp is visual: the text
 * stays in the page, and in the search index.
 */

export interface EntryLike {
  classList: { toggle(name: string, force: boolean): unknown };
}

export interface BodyLike {
  scrollHeight: number;
  clientHeight: number;
}

export interface ButtonLike {
  hidden: boolean | string;
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", listener: () => void): void;
}

export interface ClampOptions {
  entry: EntryLike;
  body: BodyLike;
  button: ButtonLike;
}

export const CLAMPED_CLASS = "is-clamped";

/**
 * Clamp the entry if its content overflows the clamp height. Returns a
 * function that measures again, for when the entry's width changes.
 */
export function startReleaseClamp({ entry, body, button }: ClampOptions): () => void {
  let expanded = false;

  const render = () => {
    entry.classList.toggle(CLAMPED_CLASS, !expanded);
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? "Show less" : "Show more";
  };

  button.addEventListener("click", () => {
    expanded = !expanded;
    render();
  });

  return function measure() {
    // An expanded entry stays expanded: it overflowed when the visitor opened it.
    if (expanded) return;
    // Clamp first: `scrollHeight` is the content's height, `clientHeight` the clamped one.
    render();
    const overflows = body.scrollHeight > body.clientHeight;
    entry.classList.toggle(CLAMPED_CLASS, overflows);
    button.hidden = !overflows;
  };
}
