import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { readImageHeader } from "../../src/schema/index.ts";
import { FIXTURES } from "./load-tree.ts";

const asset = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, "assets", name)));
const text = (value: string) => new TextEncoder().encode(value);

describe("readImageHeader", () => {
  it("reads PNG size", () => {
    assert.deepEqual(readImageHeader(asset("social.png")), { type: "png", width: 1200, height: 630 });
    assert.deepEqual(readImageHeader(asset("favicon.png")), { type: "png", width: 32, height: 32 });
  });

  it("reads JPEG size past the JFIF segment", () => {
    assert.deepEqual(readImageHeader(asset("social.jpg")), { type: "jpeg", width: 1200, height: 630 });
  });

  it("skips a Huffman table segment before the frame", () => {
    // SOI, DHT (FFC4, not a frame) with a 3-byte body, then SOF0 at 630x1200.
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc4, 0x00, 0x05, 0x00, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x76, 0x04, 0xb0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    ]);
    assert.deepEqual(readImageHeader(bytes), { type: "jpeg", width: 1200, height: 630 });
  });

  it("recognizes SVG after a BOM, an XML declaration, a comment and a doctype", () => {
    assert.deepEqual(readImageHeader(asset("logo.svg")), { type: "svg" });
    const svg = '﻿<?xml version="1.0"?>\n<!-- mark -->\n<!DOCTYPE svg>\n<svg viewBox="0 0 1 1"/>';
    assert.deepEqual(readImageHeader(text(svg)), { type: "svg" });
  });

  it("returns undefined for other and truncated files", () => {
    assert.equal(readImageHeader(asset("demo.gif")), undefined);
    assert.equal(readImageHeader(text("<html><svg></svg></html>")), undefined);
    assert.equal(readImageHeader(asset("social.png").subarray(0, 20)), undefined);
    assert.equal(readImageHeader(asset("social.jpg").subarray(0, 30)), undefined);
  });

  it("returns undefined for a PNG whose first chunk is not IHDR", () => {
    const bytes = asset("social.png");
    bytes.set(text("IDAT"), 12);
    assert.equal(readImageHeader(bytes), undefined);
  });

  it("returns undefined for a JPEG cut off inside its frame header", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x05, 0x00, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08]);
    assert.equal(readImageHeader(bytes), undefined);
  });
});
