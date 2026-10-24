import { describe, expect, it } from "vitest";
import { startProductVideo } from "../src/lib/product-video";

type Listener = () => void;

/** A video that plays and pauses as a browser's does: `paused` changes, then the event fires. */
function fakeVideo(options: { refusePlay?: boolean } = {}) {
  const listeners: Record<string, Listener[]> = { play: [], pause: [] };
  const video = {
    paused: true,
    controls: true,
    plays: 0,
    play() {
      video.plays++;
      if (options.refusePlay) return Promise.reject(new DOMException("play() failed: no user gesture", "NotAllowedError"));
      video.paused = false;
      listeners.play.forEach((l) => l());
      return Promise.resolve();
    },
    pause() {
      video.paused = true;
      listeners.pause.forEach((l) => l());
    },
    addEventListener(type: "play" | "pause", listener: Listener) {
      listeners[type].push(listener);
    },
  };
  return video;
}

function fakeButton() {
  const attributes: Record<string, string> = {};
  const clicks: Listener[] = [];
  return {
    hidden: true as boolean | string,
    attributes,
    setAttribute: (name: string, value: string) => void (attributes[name] = value),
    addEventListener: (_type: "click", listener: Listener) => void clicks.push(listener),
    click: () => clicks.forEach((l) => l()),
  };
}

/** Let the microtasks that start playback run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function start(reducedMotion: boolean, options?: { refusePlay?: boolean }) {
  const video = fakeVideo(options);
  const button = fakeButton();
  startProductVideo({ video, button, name: "A recording", reducedMotion });
  return { video, button };
}

describe("startProductVideo", () => {
  it("plays the video on load when the visitor has no reduced motion preference", async () => {
    const { video, button } = start(false);
    await settle();
    expect(video.paused).toBe(false);
    expect(button.attributes["aria-label"]).toBe("Pause video: A recording");
    expect(button.attributes["data-playing"]).toBe("true");
  });

  it("does not play the video on load when the visitor prefers reduced motion", async () => {
    const { video, button } = start(true);
    await settle();
    expect(video.plays).toBe(0);
    expect(video.paused).toBe(true);
    expect(button.attributes["aria-label"]).toBe("Play video: A recording");
    expect(button.attributes["data-playing"]).toBe("false");
  });

  it("shows its own button and drops the native controls, in both preferences", () => {
    for (const reducedMotion of [false, true]) {
      const { video, button } = start(reducedMotion);
      expect(button.hidden, `reducedMotion ${reducedMotion}`).toBe(false);
      expect(video.controls, `reducedMotion ${reducedMotion}`).toBe(false);
    }
  });

  it("pauses a playing video and resumes a paused one when the button is pressed", async () => {
    const { video, button } = start(false);
    await settle();
    button.click();
    expect(video.paused).toBe(true);
    expect(button.attributes["aria-label"]).toBe("Play video: A recording");
    button.click();
    await settle();
    expect(video.paused).toBe(false);
    expect(button.attributes["aria-label"]).toBe("Pause video: A recording");
  });

  it("lets a visitor with reduced motion start the video, then pause it again", async () => {
    const { video, button } = start(true);
    button.click();
    await settle();
    expect(video.paused).toBe(false);
    button.click();
    expect(video.paused).toBe(true);
  });

  it("follows a pause or play that did not come from the button", async () => {
    const { video, button } = start(false);
    await settle();
    video.pause();
    expect(button.attributes["data-playing"]).toBe("false");
    await video.play();
    expect(button.attributes["data-playing"]).toBe("true");
  });

  it("stays paused, with the button to start it, when the browser refuses to play, and raises no unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", record);
    try {
      const { video, button } = start(false, { refusePlay: true });
      await settle();
      button.click();
      await settle();
      expect(video.plays, "load and the press each tried").toBe(2);
      expect(video.paused).toBe(true);
      expect(button.attributes["aria-label"]).toBe("Play video: A recording");
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", record);
    }
  });
});
