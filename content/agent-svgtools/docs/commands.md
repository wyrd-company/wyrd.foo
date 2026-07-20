---
title: Command reference
order: 4
---

| Command | Purpose |
| --- | --- |
| `judge <reference-image> <candidate.svg>` | Render the SVG at the reference resolution and score it (pixel match, SSIM, combined, regions). |
| `compare <image-a> <image-b>` | The same engine for two raster images. |
| `render <candidate.svg> <output.png>` | Plain rasterization (`--width` / `--height` / `--scale` / `--background`). |
| `trace <image> [output.svg]` | Raster-to-vector starting point via the embedded vtracer. |
| `colors <image>` | Dominant color palette: hex, coverage %, sample location. |
| `skill` | Print the agent-facing skill document (Markdown). |

`judge` / `compare` artifact flags: `--diff-image`, `--side-by-side`, `--blend`,
`--grid`, `--threshold <0-100>`, `--block`, `--max-regions`. Artifacts are only
ever written to the explicit paths you pass — never to implicit temp files.

## Output conventions

- **TOON by default** for all commands; `--format json`, `--format jsonl`, and
  `--pretty` (for JSON) are available. JSONL streams a header record followed by
  one record per list element (for example, one per diff region).
- **Exit codes:** `0` success, `1` usage/IO error, `2` threshold not met
  (`judge` / `compare`).
