/*
 * How a product page video starts and stops (WCAG 2.2.2, Pause, Stop, Hide):
 * it plays on load, muted and looped, unless the visitor asks for reduced
 * motion, and a button pauses and resumes it either way. Without script the
 * video keeps its native controls and does not play.
 */

/** The media query of the visitor's reduced motion preference. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface VideoLike {
  paused: boolean;
  controls: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: "play" | "pause", listener: () => void): void;
}

export interface ToggleLike {
  hidden: boolean | string;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", listener: () => void): void;
}

export interface VideoOptions {
  video: VideoLike;
  button: ToggleLike;
  /** What the video shows, for the button's name: "Pause video: <name>". */
  name: string;
  reducedMotion: boolean;
}

export function startProductVideo({ video, button, name, reducedMotion }: VideoOptions): void {
  const sync = () => {
    button.setAttribute("data-playing", String(!video.paused));
    button.setAttribute("aria-label", `${video.paused ? "Play" : "Pause"} video: ${name}`);
  };
  video.addEventListener("play", sync);
  video.addEventListener("pause", sync);
  // The video has its own button now, so its native controls go.
  video.controls = false;
  button.hidden = false;
  button.addEventListener("click", () => {
    if (video.paused) play(video);
    else video.pause();
  });
  sync();
  if (!reducedMotion) play(video);
}

/** Play the video; a refusal (the browser's autoplay policy) leaves it paused, with the button to start it. */
function play(video: VideoLike): void {
  Promise.resolve()
    .then(() => video.play())
    .catch(() => {});
}
