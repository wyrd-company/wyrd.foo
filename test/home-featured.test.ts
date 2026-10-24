/*
 * The featured slot as the build renders it (HomeFeatured.astro): the build's
 * pick in the slot, every other card as a template, and a hidden slot when
 * the build has no pick.
 */
import { describe, expect, it } from "vitest";
import HomeFeatured from "../src/components/home/HomeFeatured.astro";
import type { FeaturedCandidate } from "../src/lib/featured";
import type { FeaturedCard } from "../src/lib/home";
import { render } from "./render";

const card = (key: string): FeaturedCard => ({
  key,
  name: key,
  kind: "cli",
  status: "preview",
  tagline: `${key} tagline`,
  blurb: `${key} blurb`,
  getStarted: `/tools/${key}#install`,
  media: { src: `/assets/${key}/demo.png`, alt: "" },
});
const cards = new Map(["sample-a", "sample-b"].map((key) => [key, card(key)]));
const candidates: FeaturedCandidate[] = [...cards.keys()].map((key) => ({ key, stable: false, hasMedia: true }));

describe("featured slot", () => {
  it("shows the build's pick and keeps the others as templates", async () => {
    const root = await render(HomeFeatured, { cards, candidates, pick: "sample-a" });
    const wrapper = root.querySelector("[data-home-featured]")!;
    expect(wrapper.hasAttribute("hidden")).toBe(false);
    expect(wrapper.querySelector("[data-featured-slot] [data-featured-key]")?.getAttribute("data-featured-key")).toBe("sample-a");
    expect(wrapper.querySelectorAll("template[data-featured-template]").map((t) => t.getAttribute("data-featured-template"))).toEqual(["sample-b"]);
  });

  it("is hidden and empty when the build has no pick, with every card as a template", async () => {
    const root = await render(HomeFeatured, { cards, candidates, pick: undefined });
    const wrapper = root.querySelector("[data-home-featured]")!;
    expect(wrapper.hasAttribute("hidden")).toBe(true);
    expect(wrapper.querySelector("[data-featured-slot]")?.childNodes.filter((n) => n.toString().trim() !== "")).toEqual([]);
    expect(wrapper.querySelectorAll("template[data-featured-template]").map((t) => t.getAttribute("data-featured-template"))).toEqual([
      "sample-a",
      "sample-b",
    ]);
  });
});
