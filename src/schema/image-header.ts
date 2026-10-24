// Reads an image file's type, and for raster images its size, from its first
// bytes. Only the types the docs contract accepts are recognized.

export type ImageType = "svg" | "png" | "jpeg";

export interface ImageHeader {
  type: ImageType;
  /** Pixel size; absent for SVG. */
  width?: number;
  height?: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The file's type and size, or undefined when it is not SVG, PNG or JPEG. */
export function readImageHeader(bytes: Uint8Array): ImageHeader | undefined {
  return readPng(bytes) ?? readJpeg(bytes) ?? readSvg(bytes);
}

function readPng(bytes: Uint8Array): ImageHeader | undefined {
  if (bytes.length < 24 || !PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk !== "IHDR") return undefined;
  return { type: "png", width: view.getUint32(16), height: view.getUint32(20) };
}

// Start-of-frame markers carry the size. C4 (DHT), C8 (JPG) and CC (DAC) are
// not frames.
const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function readJpeg(bytes: Uint8Array): ImageHeader | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2; // marker with no length
      continue;
    }
    const length = view.getUint16(offset + 2);
    if (isStartOfFrame(marker)) {
      if (offset + 9 > bytes.length) return undefined;
      return { type: "jpeg", height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

const SVG_START = /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:(?:<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*)*<svg[\s>/]/i;

function readSvg(bytes: Uint8Array): ImageHeader | undefined {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096)).replace(/^﻿/, "");
  return SVG_START.test(text) ? { type: "svg" } : undefined;
}
