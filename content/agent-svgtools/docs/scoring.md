---
title: How scoring works
order: 5
---

Every `judge` and `compare` run produces four things worth reading.

- **pixel_match** — mean per-channel agreement (0–100) after compositing both
  images over white.
- **ssim** — an in-house mean-SSIM index (Wang et al. 2004) over a Gaussian
  window, implemented in pure Rust to keep the license permissive and the scores
  deterministic.
- **combined** — a weighted blend of the two; the single number to optimize.
- **regions** — the frame is tiled, per-block error is measured, and contiguous
  high-error blocks are merged into ranked bounding boxes in reference-pixel
  coordinates.

## Interpreting the scores

- **High pixel match + low SSIM** usually means structural or edge misalignment
  — check `--blend`.
- **Low pixel match + high SSIM** means the shapes are right but the colors are
  off — re-run `colors`.
