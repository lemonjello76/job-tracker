# Conventions

Keep these consistent so any agent's notes line up and the index/digests work.

## Note = one idea
- Each idea is its **own note** in `Ideas/`.
- File name: `YYYY-MM-DD - Short title.md` (date it was added).

## Frontmatter (the `---` block at the top)
Every idea note starts with:

```yaml
---
source:          # hermes | claude | grok | gemini | lyle  (REQUIRED)
created: YYYY-MM-DD
status: raw      # raw → reviewed → formulated → delivered
score:           # 1–5, set during review
tags: []
---
```

- **`source`** is the only field an agent must always fill. It's how you see who
  suggested what.

## Status lifecycle
| status | meaning |
|---|---|
| `raw` | just dropped, not yet looked at |
| `reviewed` | read and scored |
| `formulated` | written up properly, ready to deliver |
| `delivered` | included in a `Delivered/` digest |

## Scoring (1–5)
Rough gut score = **fit to Lyle's edge × upside**.
- **5** — squarely in your wheelhouse + big upside (do this).
- **3** — interesting but needs a stretch or smaller payoff.
- **1** — off-base or tiny. Keep for reference.

## Tags (optional)
Use light tags so the index can filter, e.g. `#monetize`, `#saas`,
`#service-biz`, `#content`, `#automation`.
