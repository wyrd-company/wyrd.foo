---
title: research
order: 6
---

Autonomous deep research — multi-step investigation that browses, verifies, and
compiles a cited report. These calls are slower than `web` (seconds to tens of
minutes) and stream progress to stderr unless quieted.

```bash
seek research <provider> "<query...>" [options]
```

Providers: `brave`, `parallel`, `google`, `perplexity`.

## research brave

Brave Answers Deep Research — a quick, surface-level pass. Uses
`BRAVE_ANSWERS_API_KEY`.

```bash
seek research brave "what changed in the EU AI Act this month?" --citations
```

| Option              | Description                          |
| ------------------- | ------------------------------------ |
| `--country <cc>`    | Two-letter country code (default `us`)|
| `--language <code>` | Response language (default `en`)      |
| `--citations`       | Request provider citation tags        |
| `--entities`        | Request provider entity tags          |
| `--json`            | Emit raw JSON response               |

Output: report text with a citations list appended.

## research parallel

Parallel Deep Research — thorough, from ~30s up to ~25 minutes depending on
processor depth. Supports strict JSON output via a schema file, giving
auditable sources for B2B and data-ops work.

```bash
seek research parallel "list the top 10 EV battery manufacturers" \
  --schema ./schema.json --processor pro
```

| Option               | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `--schema <path>`    | Path to a JSON file describing the desired output schema        |
| `--processor <name>` | Depth: `core-fast` \| `core` \| `core2x-fast` \| `core2x` \| `pro-fast` \| `pro` \| `ultra-fast` \| `ultra` (default `core`) |
| `--json`             | Emit raw JSON response                                         |

Processor guidance: `-fast` variants trade data freshness for speed.
`core` = cross-referenced moderate complexity; `core2x` = high-complexity
cross-referenced; `pro` = exploratory web research; `ultra` = advanced
multi-source deep research.

Output: report content (JSON-stringified if a schema was used) with unique
citation URLs appended.

## research google

Gemini Deep Research Agent — comprehensive, 5–20 minutes. It autonomously
plans, executes, and synthesizes multi-step research into a detailed, cited
report. Uses `GEMINI_API_KEY`.

```bash
seek research google "summarize the SEC investigation into ACME Corp"
seek research google "map the competitive landscape for open-weight speech models" \
  --interactive --planner perplexity
```

| Option                | Description                                                  |
| --------------------- | ----------------------------------------------------------- |
| `--agent <name>`      | Override the Deep Research agent id                          |
| `--system <text>`     | Optional system instruction (e.g. "act as an equity analyst")|
| `--interactive`       | Review and approve a research plan before starting           |
| `--planner <provider>`| Planner for `--interactive`: `perplexity` \| `brave` \| `manual` (default `perplexity`) |
| `--quiet`             | Suppress polling progress on stderr                          |
| `--json`              | Emit raw JSON interaction object                             |

`--interactive` requires a TTY; it proposes a plan you can approve, revise, or
quit before the long-running research begins.

Output: report text with a citations list appended.

## research perplexity

Perplexity Sonar Deep Research — an informed pass, ~1–3 minutes, run as an
async job. Uses `PERPLEXITY_API_KEY`.

```bash
seek research perplexity "state of the small language model market"
```

| Option             | Description                                       |
| ------------------ | ------------------------------------------------- |
| `--model <name>`   | Override model (default `sonar-deep-research`)     |
| `--effort <level>` | Reasoning effort: `low` \| `medium` \| `high` (default `medium`) |
| `--quiet`          | Suppress polling progress on stderr                |
| `--json`           | Emit raw JSON async job object                     |

Output: report text with a citations list appended.
