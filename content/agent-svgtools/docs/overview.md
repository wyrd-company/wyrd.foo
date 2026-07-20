---
title: Overview
order: 1
---

Coding agents write clean, semantic SVG but cannot *see* their output. When an
agent recreates a logo as SVG from a raster reference, it has no way to tell how
close it got. `agent-svgtools` closes that loop: it renders the SVG, scores it
against the reference, localizes the errors, and produces comparison images a
vision model can read — all machine-first, so the result drops straight back
into an iterate-and-improve cycle.

- **Pure Rust, single static binary** — no C dependencies.
- **Machine-first output** — TOON by default (token-efficient for LLMs), with
  JSON, JSONL, and pretty-printing on tap.
- **Scoring engine** — pixel match %, SSIM, a combined score, and ranked error
  regions with pixel-coordinate bounding boxes.
- **Artifacts** — diff heatmaps, labeled side-by-side panels, onion-skin blends,
  and coordinate grids, written only to the paths you ask for.

Prebuilt binaries for macOS (arm64/x64), Linux (x64/arm64, musl static), and
Windows (x64) are attached to every release.
