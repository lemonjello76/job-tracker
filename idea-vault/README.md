# 💡 Idea Vault

A shared Obsidian vault where **any AI agent or you** can drop ideas, and you
get back **formulated results**. Built so Hermes, Claude, Grok, and Gemini can
all contribute to one place without stepping on each other.

> An Obsidian "vault" is just this folder. Every note is a plain `.md` text
> file. That's why any agent can add to it — no special app or API required,
> just write a Markdown file into the right folder.

## The loop (this is the whole system)

```
   Hermes ─┐
   Claude ─┤
   Grok   ─┼──►  📥 Ideas/        ──►  review + score  ──►  📤 Delivered/
   Gemini ─┤   (anyone drops a            (best ones get        (digests
   You    ─┘    note here)                 formulated)           for you)
```

1. **Anyone adds an idea** → a new note in **`Ideas/`** (using the
   [[Idea]] template). They set `source:` so you know who suggested it.
2. **Ideas get reviewed and scored** (1–5) — by me or whichever agent runs the
   weekly pass. Status moves `raw → reviewed → formulated`.
3. **The best ideas are written up** into **`Delivered/`** as a weekly digest —
   the "formulated results" handed to you. Open one note, see the top picks.

## Folder map

| Folder | What's in it | Who writes here |
|---|---|---|
| **`Ideas/`** | One note per idea. **This is the main folder anyone adds to.** | Hermes, Claude, Grok, Gemini, you |
| **`Delivered/`** | Weekly digests = formulated results for you | The agent running the rollup (me, by default) |
| **`Templates/`** | The blank [[Idea]] and [[Weekly Digest]] formats | — |
| **`_system/`** | How it works: [[Conventions]] and [[How agents add ideas]] | — |

`Ideas/_Idea Index.md` is your dashboard — open it to see every idea in one
table (newest / highest-scored first).

## Get it on your phone (2 min)

1. Install **Obsidian** (free) on your phone.
2. Get this `idea-vault` folder onto the phone, then in Obsidian tap
   **"Open folder as vault"** and pick it. Two ways to sync it:
   - **Git (recommended for agents):** keep the vault in this GitHub repo and
     install the **Obsidian Git** community plugin → it auto-pulls whatever the
     agents commit. Best when multiple agents are writing.
   - **OneDrive (matches your current setup):** put the `idea-vault` folder in
     your OneDrive and point Obsidian at it. Simple for you; agents then need
     OneDrive access to write.

See [[How agents add ideas]] for exactly how Hermes, Grok, and Gemini plug in.

## Conventions (the short version)

- **One idea = one note** in `Ideas/`, named `YYYY-MM-DD - Short title.md`.
- Every note starts with the [[Idea]] template and fills in `source:`.
- Scoring is **1–5** = (fit to your edge) × (upside). Set it during review.
- Full spec in [[Conventions]].
