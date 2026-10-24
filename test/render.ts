import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { parse, type HTMLElement } from "node-html-parser";

export const SITE = "https://wyrd.foo";

/** Render an Astro component at a URL on the site and parse the HTML. */
export async function render(
  component: Parameters<AstroContainer["renderToString"]>[0],
  props: Record<string, unknown>,
  path = "/",
): Promise<HTMLElement> {
  const container = await AstroContainer.create({ astroConfig: { site: SITE } });
  const html = await container.renderToString(component, {
    props,
    request: new Request(new URL(path, SITE)),
  });
  return parse(html);
}

export function attr(root: HTMLElement, selector: string, name: string): string | undefined {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`no element matches ${selector}`);
  return el.getAttribute(name);
}
