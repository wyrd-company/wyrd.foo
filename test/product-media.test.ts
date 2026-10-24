import { describe, expect, it } from "vitest";
import ProductMedia from "../src/components/product/ProductMedia.astro";
import { formatReleaseDate } from "../src/lib/product-facts";
import { isVideo } from "../src/lib/product-media";
import { render } from "./render";

describe("isVideo", () => {
  it("is true for MP4 and WebM files, in any case, before a query or fragment", () => {
    expect(isVideo("/assets/x/demo.mp4")).toBe(true);
    expect(isVideo("/assets/x/demo.WEBM?v=1")).toBe(true);
  });
  it("is false for images, GIFs included", () => {
    for (const src of ["/assets/x/demo.gif", "/assets/x/shot.png", "/assets/x/mp4.png"]) expect(isVideo(src)).toBe(false);
  });
});

describe("ProductMedia", () => {
  it("plays a video as muted, looping and inline, and shows a GIF as an image", async () => {
    const root = await render(ProductMedia, {
      media: [
        { src: "/assets/x/demo.mp4", caption: "A recorded session." },
        { src: "/assets/x/step.gif", caption: "One step.", alt: "A step" },
      ],
      tourTitle: "More",
    });
    const video = root.querySelector(".media-main video")!;
    expect(video.getAttribute("src")).toBe("/assets/x/demo.mp4");
    for (const attr of ["autoplay", "muted", "loop", "playsinline"]) expect(video.hasAttribute(attr), attr).toBe(true);
    expect(video.getAttribute("aria-label")).toBe("A recorded session.");
    const img = root.querySelector(".media-tour img")!;
    expect(img.getAttribute("src")).toBe("/assets/x/step.gif");
    expect(img.getAttribute("alt")).toBe("A step");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("has no tour for a single media item", async () => {
    const root = await render(ProductMedia, { media: [{ src: "/assets/x/a.png", caption: "A." }], tourTitle: "More" });
    expect(root.querySelector(".media-tour")).toBeNull();
    expect(root.querySelector(".media-main img")?.getAttribute("alt")).toBe("A.");
  });
});

describe("formatReleaseDate", () => {
  it("writes the UTC date as YYYY-MM-DD", () => {
    expect(formatReleaseDate(new Date("2026-09-30T23:30:00Z"))).toBe("2026-09-30");
    expect(formatReleaseDate(new Date("2026-10-01"))).toBe("2026-10-01");
  });
});
