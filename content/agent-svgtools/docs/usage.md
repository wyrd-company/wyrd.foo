---
title: The agent loop
order: 3
---

The tool is built around a tight iterate-and-improve loop: read the target
colors, author or revise the SVG, score it, attack the worst region, repeat.

1. `agent-svgtools colors <reference>` — read the exact hex values to target.
2. *(optional)* `agent-svgtools trace <reference> start.svg` — a starting-point SVG.
3. Author or revise `candidate.svg`.
4. `agent-svgtools judge <reference> candidate.svg --diff-image diff.png --grid` — score it and localize the errors.
5. Read the scores and `regions`, open `diff.png`, attack the worst region, and return to step 3. Stop when `combined` clears your target (or `--threshold` passes).

Run `agent-svgtools skill > SKILL.md` to install the full, agent-facing workflow
guide into a project.

## Quick start

```bash
# Score an SVG against a reference image (TOON by default).
agent-svgtools judge logo.png candidate.svg

# With artifacts and a coordinate grid for a vision model.
agent-svgtools judge logo.png candidate.svg \
  --diff-image diff.png --side-by-side sbs.png --grid

# CI gate: exit code 2 if the combined score is below 95.
agent-svgtools judge logo.png candidate.svg --threshold 95
```

Example `judge` output:

```toon
reference:
  path: logo.png
  width: 512
  height: 512
candidate: candidate.svg
scores:
  pixel_match: 96.4
  ssim: 88.1
  combined: 92.25
regions[2]{x,y,width,height,error}:
  192,64,128,96,41.2
  0,416,96,96,33.7
artifacts:
  diff_image: diff.png
```
