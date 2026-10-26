/* How the product page shows a media file. */

const VIDEO = /\.(mp4|webm)$/i;

/** True for MP4 and WebM files, which play as video; every other file shows as an image. */
export function isVideo(src: string): boolean {
  return VIDEO.test(src.split(/[?#]/)[0]);
}
